import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Middleware en Modo Demo: Permite el paso a todas las rutas
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Coincidir con todas las rutas de solicitud excepto las que comienzan con:
     * - _next/static (archivos estáticos)
     * - _next/image (archivos de optimización de imágenes)
     * - favicon.ico (archivo favicon)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
