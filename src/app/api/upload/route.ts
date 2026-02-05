import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { createAuditLog } from '@/lib/audit';



export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const personId = formData.get('personId') as string;
    const type = formData.get('type') as string; // 'front' or 'back'

    if (!file || !personId) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });

    // Mock Upload (In real production, upload to S3/Supabase Storage)
    // Here we will pretend we got a URL back
    const fakeUrl = `https://storage.mock.com/${personId}_${type}_${Date.now()}.jpg`;

    // Update Person Record
    const updateData: any = {};
    if (type === 'front') updateData.idCardFrontUrl = fakeUrl;
    if (type === 'back') updateData.idCardBackUrl = fakeUrl;

    await prisma.person.update({
        where: { id: personId },
        data: updateData
    });

    // Audit Log: SENSITIVE DATA ACCESS/UPLOAD
    await createAuditLog(
        user.id, 
        'SENSITIVE_DATA_UPLOAD', 
        'Person', 
        personId, 
        { 
            msg: `Usuario ${user.fullName} cargó evidencia documental (${type})`,
            docType: type 
        }
    );

    return NextResponse.json({ success: true, url: fakeUrl });

  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: 'Error uploading file' }, { status: 500 });
  }
}

