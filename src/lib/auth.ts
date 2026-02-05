import { SignJWT, jwtVerify } from 'jose';

const SECRET_KEY = process.env.JWT_SECRET || 'dev_secret_key_change_me_in_prod';
const key = new TextEncoder().encode(SECRET_KEY);

export async function signSessionToken(payload: { userId: string; role: string; orgId: string }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h') // Sesión de 1 día
    .sign(key);
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    });
    return payload;
  } catch (error) {
    return null;
  }
}
