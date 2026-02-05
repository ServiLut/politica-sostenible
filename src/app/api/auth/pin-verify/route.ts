import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { compare } from 'bcryptjs';



export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { pin } = await req.json();
    if (!pin) return NextResponse.json({ error: 'PIN requerido' }, { status: 400 });

    const secureUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!secureUser || !secureUser.pinHash) return NextResponse.json({ error: 'Error' }, { status: 403 });

    const valid = await compare(pin, secureUser.pinHash);
    if (!valid) return NextResponse.json({ error: 'PIN inválido' }, { status: 403 });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

