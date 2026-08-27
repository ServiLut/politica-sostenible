# Sesión del frontend

El frontend autentica contra `POST /auth/login` de NestJS y adjunta el JWT devuelto como `Authorization: Bearer <token>` mediante `lib/api-client.ts`.

La sesión se conserva en `sessionStorage`: sobrevive a una recarga, se elimina al cerrar la pestaña y no se comparte entre pestañas. Esta es una protección de navegación del cliente, no un control de autorización. Cada endpoint de NestJS debe validar el JWT, derivar allí el `tenantId` y aplicar sus permisos.

`sessionStorage` sigue siendo accesible para JavaScript y, por tanto, un XSS podría leer el token. La aplicación debe mantener una política CSP estricta, evitar HTML sin sanitizar y no registrar el JWT. Si se adopta una cookie `HttpOnly` en el futuro, deberá diseñarse un flujo explícito en NestJS/BFF con protección CSRF; no debe mezclarse con Supabase Auth.
