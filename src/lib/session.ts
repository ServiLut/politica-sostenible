import { cookies } from 'next/headers';
import { verifySessionToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function getCurrentUser() {
  const cookieStore = cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId as string },
    include: {
        territory: true
    }
  });

  // PROTOCOLO DE SALIDA: Si el usuario fue desactivado, la sesión es inválida
  if (user && !user.isActive) {
      return null;
  }

  return user;
}