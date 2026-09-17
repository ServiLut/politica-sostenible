# Runbook de respaldo, restauración y corte

> Estado: procedimiento obligatorio, aún no demostrado sobre infraestructura
> productiva. Tener un archivo o una imagen anterior no prueba recuperación.

## 1. Criterio de autorización

No se ejecutan migraciones ni se promueve el candidato si no existe un acta de
restauración reciente que identifique:

- las cuatro aplicaciones afectadas por la VPS, sus dominios y responsables;
- base, schema, bucket y ambiente exactos, sin registrar secretos;
- fecha, tamaño, SHA-256, ubicación externa cifrada y retención del respaldo;
- commit y digest de imagen que se pretende desplegar;
- RPO/RTO aprobados, hora de inicio/fin y resultado de cada comprobación;
- operador y revisor diferentes;
- destrucción o retención aprobada de la copia restaurada.

Una captura de “backup completed” no alcanza. La prueba válida termina cuando
una copia aislada arranca con el mismo artefacto, supera migraciones/readiness y
permite leer datos y objetos sintéticos coherentes.

## 2. Preparación segura

1. Crear red, PostgreSQL, Redis, bucket y secretos exclusivos de ensayo.
2. Bloquear tráfico saliente a proveedores de correo, SMS, WhatsApp, pagos y
   autoridades; usar sólo destinatarios sintéticos permitidos.
3. Crear roles separados de restauración, migración y runtime.
4. Entregar contraseñas mediante un gestor o `PGPASSFILE` con dueño correcto y
   modo `0600`; nunca incluirlas en comandos, URLs, historial o logs.
5. Confirmar dos veces que el destino es el ambiente desechable. Si hostname,
   identidad o etiqueta no coinciden, detenerse.

## 3. Respaldo de PostgreSQL

El operador adapta estos comandos en una terminal con historial desactivado. La
URL no contiene contraseña ni el parámetro Prisma `schema=`:

```bash
set -euo pipefail
set +x
export PGPASSFILE='/run/secrets/politica-postgres.pgpass'
export SOURCE_DATABASE_URL='postgresql://backup_user@db.internal:5432/politica?sslmode=verify-full'
export BACKUP_FILE='/backups/politica-YYYYMMDDTHHMMSSZ.dump'

test "$(stat -c '%a' "$PGPASSFILE")" = '600'
test "$(stat -c '%u' "$PGPASSFILE")" = "$(id -u)"
pg_dump "$SOURCE_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$BACKUP_FILE"
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
pg_restore --list "$BACKUP_FILE" > /dev/null
unset SOURCE_DATABASE_URL BACKUP_FILE PGPASSFILE
```

El archivo y su hash se cifran antes de abandonar el host y se copian a una
cuenta o región cuyo fallo no dependa de la misma VPS. Se valida la apertura del
cifrado desde el destino externo; copiar sin verificar no cuenta como respaldo.

## 4. Respaldo de Storage

La copia debe incluir objetos y un manifiesto con bucket, ruta, tamaño,
`content-type`, ETag/hash disponible y fecha. Se usa la API de Storage o el
mecanismo de exportación/snapshot contratado; nunca Supabase Database/Auth ni
un bucket público.

El respaldo conserva las rutas tenant-scoped y cifra tanto objetos como
manifiesto. Una muestra preseleccionada de cada módulo (`CONSENT`, `VOTER_IMPORT`,
`FINANCE`, `E14`, `SCRUTINY` y los módulos vigentes) debe descargarse desde la
copia y compararse con el hash registrado. No se imprimen nombres, rutas o
metadatos personales en el acta pública.

## 5. Restauración aislada

```bash
set -euo pipefail
set +x
export PGPASSFILE='/run/secrets/politica-restore.pgpass'
export RESTORE_DATABASE_URL='postgresql://restore_user@restore-db.internal:5432/politica_restore?sslmode=verify-full'
export BACKUP_FILE='/restore/input/politica-YYYYMMDDTHHMMSSZ.dump'

sha256sum --check "$BACKUP_FILE.sha256"
pg_restore "$RESTORE_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$BACKUP_FILE"
unset RESTORE_DATABASE_URL BACKUP_FILE PGPASSFILE
```

`--clean` sólo se permite después de demostrar que `RESTORE_DATABASE_URL`
apunta a la base desechable creada para el ensayo. Nunca se calcula el destino
desde una variable genérica ni se ejecuta contra una URL no inspeccionada.

Después se restauran los objetos al bucket de ensayo conservando rutas y
metadatos. Las claves del bucket productivo no se entregan a la aplicación de
ensayo.

## 6. Verificación de la copia

Sobre la restauración, y no sobre producción:

1. registrar identidad física y `_prisma_migrations` antes del cambio;
2. ejecutar el migrador exacto del digest candidato;
3. comprobar `migrate status`, deriva cero e identidad de base;
4. iniciar API, worker y web con el mismo `APP_REVISION`;
5. exigir `/health/ready = 200` y cabecera de revisión exacta;
6. abrir un tenant sintético de cada tipo y verificar roles permitidos/negados;
7. descargar por URL firmada la muestra de objetos y contrastar hashes;
8. ejecutar pruebas PostgreSQL de concurrencia, E2E y smoke de contenedores;
9. medir RPO/RTO reales y registrar cualquier pérdida o intervención manual;
10. apagar proveedores, destruir la copia o aplicar la retención aprobada.

## 7. Corte y reversa

- Congelar escrituras o drenar la versión anterior antes de migrar.
- Tomar un último respaldo incremental/consistente según el proveedor.
- Ejecutar un único migrador; no mezclar binarios viejos y nuevos.
- Publicar sólo el digest probado, observar health, worker, Redis, Storage y
  errores, y recorrer un smoke anónimo/autenticado con datos controlados.
- Si falla antes de aceptar nuevas escrituras, restaurar servicio según el plan
  acordado. Si ya hubo escrituras bajo el esquema nuevo, no restaurar a ciegas:
  decidir corrección hacia adelante o recuperación con pérdida máxima igual al
  RPO explícitamente aprobado.

El cierre se registra como `GO`, `NO-GO` o `ROLL-FORWARD`; “parece funcionar” no
es un estado de liberación.

