import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getSignedUrl } from '@/lib/storage';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const path = searchParams.get('path');

    if (!path) return NextResponse.json({ error: 'Path required' }, { status: 400 });

    const signedUrl = await getSignedUrl(path, 'soportes-gastos', 60); // 60 seconds validity

    return NextResponse.json({ signedUrl });

  } catch (error: any) {
    console.error('Signed URL Error:', error);
    return NextResponse.json({ error: 'Error generating URL' }, { status: 500 });
  }
}