# Continuidad offline de incidentes de campaña

## Alcance

La bóveda instalable permite preparar un incidente operativo sin conexión y
consultar una copia cifrada del calendario electoral activo. Ninguna de estas
acciones equivale a una recepción del servidor mientras no exista un recibo
durable validado.

El incidente admite exclusivamente categoría, prioridad, título operativo,
descripción, fecha civil del hecho y un territorio opcional u obligatorio según
el rol. No admite nombres de personas, documentos, teléfonos, direcciones,
archivos, imágenes ni firmas. La interfaz advierte que tampoco deben escribirse
estos datos dentro del texto libre.

## Flujo de incidente

1. En línea y con la bóveda desbloqueada, `GET /offline-incidents/context`
   provisiona cifrados el rol, etapa y territorios permitidos.
2. La captura genera un UUID v4, normaliza el contenido y calcula un SHA-256
   canónico. El registro completo se cifra individualmente con AES-GCM; la clave
   derivada de la frase no se persiste.
3. Al reconectar, `POST /offline-incidents/sync` vuelve a validar token, usuario
   activo y no revocado, rol de PostgreSQL, tenant de campaña, perfil no
   `CLOSED`, etapa y territorio.
4. Una transacción `SERIALIZABLE`, protegida con advisory locks, crea exactamente
   un `IssueCase` con referencia `INC-CAM`, un `AuditEvent` redactado y un
   `OfflineSyncReceipt`.
5. Repetir UUID y contenido devuelve el mismo recibo como `DUPLICATE`; reutilizar
   el UUID con otro contenido devuelve conflicto. Un rechazo conserva el
   pendiente cifrado. Sólo un recibo cuyo UUID, tipo, fecha y SHA coincidan
   autoriza eliminar la copia local.

Los recibos son append-only en PostgreSQL mediante triggers `ENABLE ALWAYS`.
`payloadSha256` es nullable para preservar sin cambios los recibos históricos de
votantes y E-14; se exige en el flujo nuevo de incidentes.

## Copia offline del calendario

El usuario guarda explícitamente la release `ACTIVE` que ya entrega el módulo de
calendario. La copia cifra `releaseId`, versión, ronda, SHA-256 de fuente, corte,
zona horaria y los hitos con su fecha/hora civil, responsable y suplente. La UI
la marca siempre como:

- solo lectura;
- posiblemente desactualizada respecto del servidor;
- no sustitutiva de la versión viva;
- sin alertas sincronizadas ni cálculo jurídico local de días hábiles.

No se hardcodean fechas electorales ni se descarga información de RNEC desde el
cliente.

## Operación y recuperación

La ruta pública instalable `/aplicacion` puede abrir la bóveda en un arranque en
frío sin sesión ni red, siempre que el dispositivo haya recibido previamente el
shell del service worker y la misma persona conozca su frase. La identidad se
revalida antes de cualquier sincronización. Cerrar, ocultar la aplicación o
cambiar de identidad retira la clave de memoria.

Los estados visibles son `PENDING`, `SYNCING`, `CONFLICT`, `FAILED` y `APPLIED`.
Los fallos transitorios usan backoff limitado; un fallo definitivo requiere un
reintento explícito. Un conflicto de idempotencia no se reenvía ciegamente: debe
revisarse y, si corresponde, eliminarse mediante la confirmación accesible de la
aplicación.

## Verificación local

La migración es únicamente
`20260909300000_offline_incident_reports/migration.sql`, con `BEGIN`/`COMMIT` y
`ALTER TYPE ... ADD VALUE`. Las pruebas focales cubren DTO, servicio, controlador,
esquema, cifrado, cold-start, conflictos, recibos y E2E en Chrome de escritorio y
Pixel. La integración PostgreSQL 16 requiere `TEST_DATABASE_URL` o
`OFFLINE_INCIDENT_INTEGRATION_DATABASE_URL` apuntando a una base desechable ya
migrada.

Este cambio no despliega ni modifica producción.
