# Sesión del frontend

El frontend autentica contra `POST /auth/login` de NestJS y adjunta el JWT devuelto como `Authorization: Bearer <token>` mediante `lib/api-client.ts`.

La sesión se conserva en `sessionStorage`: sobrevive a una recarga, se elimina al cerrar la pestaña y no se comparte entre pestañas. Esta es una protección de navegación del cliente, no un control de autorización. Cada endpoint de NestJS debe validar el JWT, derivar allí el `tenantId` y aplicar sus permisos.

`sessionStorage` sigue siendo accesible para JavaScript y, por tanto, un XSS podría leer el token. El candidato genera en `proxy.ts` un nonce criptográfico distinto para cada documento, lo entrega a Next.js en el encabezado de la petición y publica una CSP con `script-src 'strict-dynamic'` y sin `unsafe-inline`; además bloquea handlers de script mediante `script-src-attr 'none'`. Los estilos calculados de barras y mapas conservan `style-src 'unsafe-inline'`, que no autoriza ejecución de JavaScript. Esto reduce la superficie, pero no convierte `sessionStorage` en un almacén inaccesible: deben seguir prohibidos HTML no sanitizado, dependencias no confiables y registro del JWT. Si se adopta una cookie `HttpOnly` en el futuro, deberá diseñarse un flujo explícito en NestJS/BFF con protección CSRF; no debe mezclarse con Supabase Auth.

## Cierre y revocación

Al cerrar sesión, el frontend inicia `POST /auth/logout` con el JWT vigente y `keepalive` antes de borrar la sesión local. La navegación al login es inmediata y no queda bloqueada si la red falla. NestJS incrementa la versión de autenticación persistida del usuario, por lo que los JWT emitidos anteriormente dejan de ser válidos en todos los dispositivos. Los cambios de contraseña o MFA también invalidan las sesiones anteriores.

El borrado de `sessionStorage` por sí solo protege este navegador; la revocación efectiva se aplica en la API al validar cada petición. Si el servidor no recibe el logout por una caída de red, el token remoto conserva su vigencia hasta que expire o se aplique otra revocación de seguridad.

## Dependencias externas pendientes

- La recuperación autoservicio de contraseña o MFA requiere integrar un proveedor de correo o identidad verificada. Hasta entonces, el sistema conserva exclusivamente el restablecimiento administrativo manual y no simula envíos.
- El rate limiting compartido entre réplicas y una futura administración individual por dispositivo requieren Redis o un almacén de sesiones equivalente. La revocación actual de todos los dispositivos es persistente en PostgreSQL y no depende de Redis.
