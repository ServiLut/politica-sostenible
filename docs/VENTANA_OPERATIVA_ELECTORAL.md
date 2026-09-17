# Ventana operativa electoral

## Contrato de fecha civil

`electionDate` sigue siendo la fecha electoral principal declarada. La ventana
se guarda en `votingStartDate` y `votingEndDate` como columnas PostgreSQL
`DATE`, con formato de API `YYYY-MM-DD`. Ambos límites son inclusivos y se
interpretan en `America/Bogota`; no representan instantes UTC.

La fecha actual sí se obtiene a partir de un instante del servidor y se
convierte al día civil de Bogotá. En cambio, una fecha declarada nunca se pasa
por esa conversión: `2026-06-21` persiste y se compara como `2026-06-21`.
Interpretar el `00:00Z` que Prisma usa para un `DATE` como instante de Bogotá la
movería erróneamente al día anterior.

Invariantes de API y base de datos:

- `votingStartDate <= electionDate <= votingEndDate`.
- Entre 1 y 14 fechas civiles inclusivas (`end - start` entre 0 y 13).
- Inicio y fin se declaran juntos. Si ambos se omiten en un cliente legado, el
  servidor crea una ventana de un solo día en `electionDate`.
- Una ventana de varios días exige `votingWindowSourceUrl` HTTPS, sin
  credenciales embebidas, y una `votingWindowReference` de 10 a 500 caracteres.
- URL y referencia se guardan juntas. Son procedencia declarada: la plataforma
  no las llama oficiales ni afirma haber verificado a la autoridad emisora.

## Etapa y alistamiento

El avance a `ELECTION_DAY` se permite únicamente cuando el día del servidor en
Bogotá está dentro de la ventana inclusiva, además de las demás compuertas de
alistamiento. Fuera de ella se devuelve el bloqueador estable
`ELECTION_DAY_OUTSIDE_VOTING_WINDOW_BOGOTA`.

El panel de alistamiento publica el check `ELECTION_OPERATING_WINDOW`, las fechas
de corte y la procedencia declarada. No convierte esos datos en una
certificación electoral.

## Capacidades E-14 offline

Una capacidad `REAL` solo se provisiona en `ELECTION_DAY` y dentro de la ventana.
La capacidad durable guarda las dos fechas y un SHA-256 canónico ligado a:

- tenant y perfil operativo;
- fecha principal e inicio/fin;
- URL y referencia documental;
- zona horaria contractual.

Al sincronizar, Nest vuelve a bloquear y consultar el perfil tenant-scoped,
recalcula el hash y revalida identidad, rol, puesto y mesa. Tanto `capturedAt`
como `receivedAt` de una captura `REAL` deben caer dentro de la ventana. Un
cambio de cualquier campo de la ventana revoca capacidades abiertas de ese
tenant/perfil en la misma transacción que actualiza y audita el perfil.

El reloj del dispositivo no es hardware confiable. `capturedAt` es una
declaración acotada por la vigencia de la capacidad y por el reloj de recepción
del servidor; no es una prueba criptográfica de la hora física de captura.
`SIMULATION` continúa aislado por `captureContext` y no puede convertirse en
`REAL` por enviar la cola después.

## Migración y compatibilidad

La migración `20260909200000_election_operating_window` rellena
`start=end=electionDate::date`. No usa `AT TIME ZONE`, para preservar el día
civil declarado. Las capacidades offline preexistentes quedan revocadas y con
un hash legado de cuarentena; la evidencia cifrada local no se borra y deberá
obtener una capacidad vigente antes de un nuevo intento permitido.

Solicitudes de adopción o terminación pendientes creadas antes del nuevo
snapshot pueden fallar de forma segura por hash obsoleto. Deben cancelarse,
expirar o recrearse con la ventana explícita; no se reescriben hashes históricos
para fabricar continuidad de evidencia.

La captura offline solo guarda evidencia cifrada local cuando ya se provisionó
en línea la capacidad y el alcance. La subida directa, confirmación y recibo
durable requieren reconexión. Capturar offline nunca equivale a recepción del
servidor ni a resultado oficial.
