# Captura E-14 offline: contrato y límites de seguridad

## Alcance

La captura offline conserva en IndexedDB, dentro de una bóveda AES-GCM
particionada por tenant y usuario, el formulario, una copia del archivo y una
capacidad opaca. La frase no se persiste y la llave derivada permanece solo en
memoria. Ocultar la aplicación, cambiar de identidad o recargar exige
desbloquear otra vez.

No se usa CacheStorage para datos, API o evidencias, Background Sync ni un
service worker para mutaciones. Toda sincronización requiere conexión,
aplicación visible, bóveda desbloqueada y una acción explícita.

## Capacidad de captura

POST /witnesses/offline-capture-grants registra una capacidad de vida corta.
El servidor obtiene exclusivamente del JWT y de la base de datos:

- tenant, actor, authVersion y rol vigente;
- perfil y fecha electoral;
- etapa de emisión;
- contexto inmutable SIMULATION o REAL;
- puestos vigentes y máximo de mesas de cada puesto;
- snapshot exacto del release, código físico, fecha lógica y zona horaria del
  puesto.

El cliente recibe un token aleatorio y la vista mínima de sus puestos. La base
de datos conserva solo el HMAC del token. Una capacidad SIMULATION sigue siendo
de simulacro aunque se sincronice después de avanzar a ELECTION_DAY o
POST_ELECTION. Una capacidad REAL solo nace en ELECTION_DAY dentro de la
ventana documental general y solo incluye puestos cuya fecha lógica está
activa en la zona IANA persistida. Un puesto doméstico no se habilita antes de
su domingo porque la ventana haya abierto para consulados. Un puesto exterior
sin zona verificable queda bloqueado: el sistema no la infiere por país ni por
coordenadas.

Una REAL puede terminar de sincronizarse en POST_ELECTION mientras el grant no
haya vencido y `receivedAt` permanezca dentro de la ventana general; su
`capturedAt` debe corresponder exactamente a la fecha local congelada del
puesto. Cambiar release, código físico, jornada o zona invalida el grant.
CLOSED rechaza toda mutación.

El servicio bloquea las filas de capacidad y perfil dentro de la misma
transacción serializable que crea el reporte, consume el objeto, audita y crea
el recibo. Allí vuelve a validar identidad, authVersion, rol, territorio,
puesto y mesa.

## Archivo y cola local

- Formatos: JPG/JPEG, PNG, WEBP y PDF.
- Límite por archivo: 15 MiB.
- Límite por bóveda: 4 actas y 30 MiB de bytes originales.
- Se validan extensión, MIME, tamaño y firma mágica antes de cifrar y otra vez
  después de descifrar.
- Se calcula SHA-256 sobre los bytes descifrados.
- El nombre original no se conserva: la cola usa un UUID sintético.
- Metadatos, bytes, grant y progreso se cifran registro por registro con AAD.

Un conflicto, revocación, cambio de permisos, vencimiento o error conserva la
evidencia local hasta que el operador la elimine explícitamente o reciba un
recibo durable exacto.

## Protocolo de sincronización y recuperación

1. Revalidar la identidad autenticada contra la partición de la bóveda.
2. Solicitar a NestJS una autorización de subida para el nombre sintético,
   MIME, tamaño y SHA-256.
3. Persistir cifrada únicamente la ruta canónica antes del PUT. La URL y el
   token firmados nunca se persisten.
4. Hacer PUT directo a Supabase Storage.
5. Confirmar en NestJS la ruta y metadatos.
6. Enviar POST /logistics/sync/e14 con la ruta confirmada, id de operación,
   hora de captura, capacidad y SHA-256.
7. Eliminar el registro cifrado solo al validar un recibo APPLIED o DUPLICATE
   para la misma operación, hora y contexto.

Si la aplicación cae después de guardar la ruta o durante el PUT, intenta
confirmar esa ruta antes de autorizar otra. Un 404/409 de confirmación descarta
solo la ruta cifrada y permite una nueva autorización; el proceso de limpieza
de objetos huérfanos del backend conserva su política independiente. Si se
pierde la respuesta después del commit, el mismo id y payload recuperan
DUPLICATE.

## Límites que no deben presentarse como garantías

El reloj local no es hardware confiable. capturedAt documenta la hora declarada
por el dispositivo y el servidor permite una desviación acotada; no prueba por
sí sola cuándo se tomó la foto. receivedAt siempre es del servidor y nunca se
fabrica una IP de captura offline.

Supabase Storage devuelve tamaño, MIME, ETag y metadatos, pero su API usada aquí
no calcula ni firma un SHA-256 independiente del objeto. La huella prueba
continuidad entre bóveda, autorización, metadata declarada, objeto confirmado,
idempotencia y recibo, y detecta corrupción accidental. No es una atestación
forense contra un cliente malicioso que controle simultáneamente archivo y
metadata. La autenticidad electoral requiere conciliación humana y fuentes
electorales autorizadas.

“Recibido por el servidor” tampoco significa resultado oficial, escrutinio,
transmisión a la RNEC ni reclamación radicada.

## Rotación

OFFLINE_SYNC_HMAC_SECRET debe ser independiente, secreto y de al menos 32
bytes. Rotarlo invalida la verificación de capacidades y comparaciones
idempotentes pendientes emitidas con la versión anterior. Antes de rotar:

1. anunciar una ventana y sincronizar o revocar las capacidades pendientes;
2. conservar evidencia local que no tenga recibo;
3. desplegar el nuevo secreto solo en la API, nunca en web, worker o migraciones;
4. provisionar nuevas capacidades después de la rotación.

La versión actual no mantiene un llavero de secretos anteriores. Una rotación
de emergencia prioriza revocación sobre disponibilidad y exige reprovisionar.
