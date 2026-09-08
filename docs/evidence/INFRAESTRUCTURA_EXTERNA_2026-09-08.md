# Evidencia de exposición externa — 8 de septiembre de 2026

## Alcance

Comprobación remota, limitada y no autenticada del host que sirve Política
Sostenible. No se intentó iniciar sesión, enumerar bases, adivinar credenciales,
alterar firewall ni cambiar servicios. Las respuestas sólo demuestran alcance de
red; no prueban acceso a datos.

## Resultado

| Puerto | Resultado externo | Interpretación |
| ---: | --- | --- |
| 22 | TCP accesible | SSH está publicado; debe restringirse por IP/VPN y autenticación fuerte. |
| 80 | TCP accesible | Entrada HTTP pública esperable sólo para redirección controlada a HTTPS. |
| 443 | TCP accesible | Entrada HTTPS pública esperada. |
| 3000 | HTTP `200`, título `Dokploy` | El panel de administración está expuesto directamente por HTTP. |
| 5432 | TCP accesible; `pg_isready` indicó que acepta conexiones | PostgreSQL está alcanzable desde Internet. No se probaron credenciales. |
| 3001, 4000, 5000, 6379, 8000, 8080 y 9000 | Sin conexión en el muestreo | No se observó exposición en esos puertos desde el origen de auditoría. |

La raíz, `health/live` y `health/ready` de la aplicación respondieron `200` con
TLS válido. Esto confirma disponibilidad, no endurecimiento: la versión antigua
continúa exponiendo cabeceras `X-Powered-By`.

## Decisión

La publicación directa de Dokploy y PostgreSQL constituye un bloqueo **P0** para
una base con información política. Antes de un corte:

1. confirmar qué aplicaciones y bases comparten el host;
2. conservar acceso administrativo alterno y reglas actuales del firewall;
3. restringir 5432 a la red privada o a orígenes explícitos de aplicación y
   respaldo;
4. publicar Dokploy sólo por HTTPS detrás de autenticación fuerte, VPN o lista de
   IP permitida;
5. restringir SSH por IP/VPN, deshabilitar contraseña si existe una ruta de llave
   comprobada y mantener una sesión de recuperación antes de aplicar reglas;
6. probar las cuatro aplicaciones y sus jobs después de cada cambio;
7. conservar evidencia de reglas antes/después y un procedimiento de reversión.

No debe cerrarse 22, 3000 o 5432 a ciegas: hacerlo sin inventario puede cortar el
único acceso de recuperación o conexiones legítimas de otras aplicaciones.
