import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';



export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { personId, type, fileBase64 } = await req.json(); 

    if (!personId || !type) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // UPLOAD TO STORAGE
    const { uploadToStorage } = await import('@/lib/storage');
    const path = `id_cards/${personId}/${type}`;
    const mockUrl = await uploadToStorage(fileBase64, path);

    const updateData: any = {};
    if (type === 'front') updateData.idCardFrontUrl = mockUrl;
    if (type === 'back') updateData.idCardBackUrl = mockUrl;

    await prisma.person.update({
        where: { id: personId },
        data: updateData
    });

    // AUDIT LOG
    await createAuditLog(user.id, 'UPLOAD_DOC', 'Person', personId, { docType: type });

    return NextResponse.json({ success: true, url: mockUrl });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error uploading' }, { status: 500 });
  }
}

