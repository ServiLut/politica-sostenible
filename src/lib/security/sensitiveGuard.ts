import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/services/auth.service';

type RouteHandler = (req: NextRequest, context: any) => Promise<NextResponse>;

/**
 * Middleware de Protección para Acciones Sensibles (Capa 2).
 * Intercepta la petición, extrae el PIN del header 'x-security-pin' o del body,
 * y lo valida contra el servicio de autenticación.
 * 
 * Uso:
 * export const POST = withSensitiveGuard(async (req) => { ... });
 */
export function withSensitiveGuard(handler: RouteHandler) {
  return async (req: NextRequest, context: any) => {
    try {
      // 1. Identificar Usuario (Mock: Asumimos que un middleware previo inyectó el ID en headers)
      // En Next.js App Router real, usaríamos getServerSession() o similar aquí.
      const userId = req.headers.get('x-user-id'); 
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized: No session' }, { status: 401 });
      }

      // 2. Extraer PIN
      // Prioridad: Header > Body (Solo si es JSON)
      let pin = req.headers.get('x-security-pin');
      
      if (!pin && req.method !== 'GET') {
        try {
          // Clonamos para no consumir el stream si el handler lo necesita después
          const body = await req.clone().json();
          pin = body.securityPin;
        } catch {
          // Body no es JSON o está vacío
        }
      }

      if (!pin) {
        return NextResponse.json({ error: 'Forbidden: Security PIN required for this action' }, { status: 403 });
      }

      // 3. Obtener contexto de la acción (URL)
      const actionContext = `API:${req.method}:${req.nextUrl.pathname}`;
      const ip = req.headers.get('x-forwarded-for') || 'unknown';

      // 4. Validar PIN (Lanza error si falla o está bloqueado)
      await authService.validateSecurityPin(userId, pin, actionContext, ip);

      // 5. Proceder al Handler original
      return await handler(req, context);

    } catch (error: any) {
      const message = error.message || 'Internal Security Error';
      
      if (message.includes('SECURITY_LOCKOUT') || message.includes('SECURITY_ALERT')) {
        return NextResponse.json({ error: message }, { status: 429 }); // Too Many Requests
      }
      
      if (message.includes('Invalid Security PIN')) {
        return NextResponse.json({ error: message }, { status: 401 });
      }

      console.error('SensitiveGuard Error:', error);
      return NextResponse.json({ error: 'Forbidden: Security verification failed' }, { status: 403 });
    }
  };
}

/**
 * Protection Wrapper for Server Actions.
 * Simple pass-through for now.
 */
export function withSensitiveProtection<T extends (...args: any[]) => Promise<any>>(
  actionContext: string,
  fn: T
) {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    // Logic to verify PIN for Server Actions could go here.
    return await fn(...args);
  };
}
