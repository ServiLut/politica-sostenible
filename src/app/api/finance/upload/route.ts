import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { uploadToStorage } from '@/lib/storage';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const path = `${user.id}/${timestamp}_${cleanName}`;

    // Upload to 'soportes-gastos' bucket
    const resultPath = await uploadToStorage(buffer, path, file.type, 'soportes-gastos');

    return NextResponse.json({ success: true, path: resultPath });

  } catch (error: any) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: error.message || 'Error uploading file' }, { status: 500 });
  }
}