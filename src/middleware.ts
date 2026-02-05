import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/auth';

/**
 * RBAC - CONTROL DE ACCESO BASADO EN ROLES
 * Define qué roles tienen permiso de entrada a cada ruta.
 */
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/dashboard/requests': ['ADMIN'],
  '/dashboard/team': ['ADMIN'],
  '/dashboard/finance': ['ADMIN'],
  '/dashboard/settings': ['ADMIN'],
  '/dashboard/security': ['ADMIN'],
  '/dashboard/territory': ['ADMIN', 'COORDINATOR'],
  '/dashboard/directory': ['ADMIN', 'COORDINATOR', 'LEADER'],
  '/dashboard/capture': ['ADMIN', 'COORDINATOR', 'LEADER', 'WITNESS'],
};

// Mapeo de nombres descriptivos a roles de DB (Enum ActorRole)
const ROLE_MAP: Record<string, string> = {
  'WITNESS': 'TESTIGO',
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. OMITIR ARCHIVOS ESTÁTICOS Y API DE AUTH
  if (
    pathname.startsWith('/_next') || 
    pathname.startsWith('/api/auth') ||
    pathname.includes('.') // imágenes, favicon, etc
  ) {
    return NextResponse.next();
  }

  // 2. IDENTIFICAR RUTAS PROTEGIDAS
  const isProtectedRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  // 3. VERIFICACIÓN DE SESIÓN
  const token = req.cookies.get('auth_token')?.value;

  if (!token) {
    const url = new URL('/login', req.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  const payload = await verifySessionToken(token);

  if (!payload || !payload.role) {
    const response = NextResponse.redirect(new URL('/login', req.url));
    response.cookies.delete('auth_token');
    return response;
  }

  const userRole = payload.role as string;

  // 4. LÓGICA DE CONTROL DE ACCESO (RBAC)
  
  // Buscar si la ruta actual tiene restricciones específicas
  // Buscamos coincidencia exacta o prefijo (ej: /dashboard/team/123 -> /dashboard/team)
  const restrictedPath = Object.keys(ROUTE_PERMISSIONS).find(path => pathname.startsWith(path));

  if (restrictedPath) {
    const allowedRoles = ROUTE_PERMISSIONS[restrictedPath].map(role => ROLE_MAP[role] || role);
    
    if (!allowedRoles.includes(userRole)) {
      console.warn(`[AUTH] Access Denied: User ${payload.userId} (${userRole}) tried to access ${pathname}`);
      
      // Auditoría de Violación de Seguridad (Async)
      fetch(`${req.nextUrl.origin}/api/audit/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           userId: payload.userId,
           action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
           entity: 'Route',
           details: { path: pathname, role: userRole, required: allowedRoles }
        })
      }).catch(() => {});

      // Redirigir al Home del Dashboard con error
      return NextResponse.redirect(new URL('/dashboard?error=unauthorized', req.url));
    }
  }

  // 5. PROTECCIÓN ADICIONAL PARA TESTIGOS
  // Si un testigo intenta entrar al Home del Dashboard o rutas no permitidas explícitamente, 
  // redirigir a su área de trabajo (PWA).
  if (userRole === 'TESTIGO' && (pathname === '/dashboard' || pathname === '/dashboard/')) {
     return NextResponse.redirect(new URL('/pwa/e14/selector', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*'
  ],
};
