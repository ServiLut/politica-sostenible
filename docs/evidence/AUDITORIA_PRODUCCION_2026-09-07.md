# Evidencia no destructiva de producción — 7 de septiembre de 2026

## Alcance e identidad de la evidencia

- Objetivo observado: `https://politica-sostenible.abogadosencolombiasas.com`.
- Zona horaria de la auditoría: America/Bogota.
- Sesión: cuenta administrativa ya existente en el navegador del operador; no se
  conservan correo, identificadores, token, cookies ni datos personales.
- Versión: el despliegue no publicó commit ni digest verificable. Por eso este
  registro prueba el comportamiento observado, no la reproducibilidad de un
  artefacto concreto.
- Método: navegación y solicitudes HTTP no destructivas, escritorio y viewport
  móvil. No se accedió al host, a Docker, a PostgreSQL ni al panel de Dokploy.

## Resultado agregado

| Superficie | Muestra | Resultado observado |
| --- | ---: | --- |
| Navegación autenticada principal | 12 módulos | Las 12 rutas base cargaron; cuatro superficies nuevas quedaron restringidas por contratos ausentes. |
| Contratos GET esperados por el candidato local | 47 | 29 respondieron `401` sin sesión y 18 respondieron `404`, evidencia de desfase de versión. |
| Rutas privadas sin sesión | 22 | Redirigieron al inicio de sesión. |
| Rutas públicas | 8 | Respondieron `200`. |
| Health checks públicos muestreados | 3 | Respondieron, pero readiness exponía más detalle del necesario en la versión desplegada. |
| Accesibilidad básica | 13 rutas | No se detectaron controles sin nombre accesible; el skip link funcionó en la aplicación autenticada. |
| Territorio | 1.122 municipios / 47 páginas | Búsqueda, paginación y zonas respondieron en el muestreo. |

Al cierre se repitió una comprobación HTTP externa: la raíz, `health/live` y
`health/ready` respondieron `200` con TLS válido. El despliegue viejo continuó
exponiendo `X-Powered-By` (`Next.js`/`Express`), por lo que esta confirmación de
disponibilidad no cambia el hallazgo de endurecimiento pendiente ni demuestra
que el candidato local esté desplegado.

## Escenarios comprobados

- Las rutas principales se recorrieron sin errores de consola en el camino
  normal y sin desbordamiento horizontal en 390 × 844.
- Formularios de incidentes, tareas, eventos, comunicaciones, ajustes y equipo
  rechazaron envíos vacíos sin crear registros.
- Personas bloqueó correctamente la captura al no existir aviso de privacidad
  activo.
- Perfil operativo, bandeja, plan/uso y propuestas no estaban disponibles en el
  despliegue observado aunque sí existen en el candidato local.
- `/dashboard/votantes/new` regresó al listado en vez de ofrecer un alta.
- Ctrl+K no produjo una acción útil.
- Manifest, service worker, página offline e icono PWA devolvieron `404`.
- La mesa `999999` produjo un error técnico en inglés, desmontó filtros y dejó
  reintentos persistentes hasta recargar.
- Una credencial errónea fue rechazada y las rutas privadas se mantuvieron
  protegidas sin sesión.
- Se invocó una sola exportación de borrador CNE. No movió dinero ni afirmó una
  radicación; dejó el evento de auditoría
  `CAMPAIGN_CNE_REVIEW_DRAFT_EXPORTED / SUCCESS`.
- Una edición visual de perfil no persistió después de recargar.

## Mutaciones deliberadamente excluidas

No se crearon, modificaron ni eliminaron personas, movimientos financieros,
testigos, casos, equipo, roles, invitaciones o configuración real. No se enviaron
mensajes, se cargaron archivos, se ejecutaron pagos ni se probaron cruces entre
dos tenants reales. Esos escenarios requieren un tenant desechable y datos
sintéticos en staging.

## Límite de reproducibilidad y repetición obligatoria

No se guardaron cuerpos de respuesta porque podían contener datos políticos o
personales, ni un HAR porque incluiría cabeceras de sesión. El inventario bruto
de 47 URLs no quedó firmado como artefacto y debe regenerarse desde los contratos
del commit congelado. Antes y después del corte se exige una corrida automatizada
redactada que conserve: commit/digest, hora, URL, rol sintético, método, ruta,
status esperado/real, latencia y hash del cuerpo sanitizado.
