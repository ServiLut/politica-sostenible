# Despliegue seguro

La aplicación está preparada para ejecutarse detrás del proxy HTTPS del VPS.
La web se publica únicamente en `127.0.0.1`; NestJS permanece en la red interna
de Compose. Redis y BullMQ se incorporarán cuando exista el primer worker real.

Compose usa `.env.production` sólo para interpolar variables y entrega a cada
contenedor una lista explícita. La web nunca recibe `DATABASE_URL`, `DIRECT_URL`
ni `SUPABASE_SERVICE_ROLE_KEY`. Ese archivo sigue siendo un secreto: debe
pertenecer al usuario de despliegue, tener modo `0600`, quedar fuera de backups
no cifrados y borrarse de cualquier exportación de soporte. El acceso al socket
de Docker equivale a acceso a esos secretos y se restringe al personal de
plataforma. Tras una exposición o copia no controlada, se rotan las credenciales;
ocultar el archivo después no corrige la exposición.

La topología primaria y soportada es `compose.production.yml`: migrador, API y
web en contenedores separados, con identidades, secretos, health checks y
límites propios. El `Dockerfile` raíz combinado es únicamente una compatibilidad
para plataformas que no admiten esa topología. Conserva dos usuarios distintos,
pero comparte kernel, red, PID namespace y un supervisor root; no ofrece el
mismo límite de impacto que Compose separado.

## Perímetro de la VPS

Desde Internet sólo deben quedar accesibles `443/tcp` y, si se usa exclusivamente
para redirección a HTTPS, `80/tcp`. SSH (`22/tcp`) se restringe a VPN o IPs de
administración y autenticación por llave. Dokploy (`3000/tcp`), PostgreSQL
(`5432/tcp`), Redis y los puertos internos de API nunca se publican a Internet:
se enlazan a loopback o red privada y se alcanzan mediante proxy seguro, túnel o
VPN según el caso.

No apliques reglas a ciegas. Antes de cerrar un puerto registra listeners,
contenedores, redes, consumidores, reglas actuales y una sesión de recuperación;
confirma que ninguna de las demás aplicaciones de la VPS depende de esa ruta.
Después de cada cambio comprueba desde una red externa que 3000/5432 no responden
y repite health, login y jobs de las cuatro aplicaciones. Si se pierde acceso o
un consumidor legítimo falla, revierte la regla exacta antes de continuar.

## Ambientes y staging

Staging es un proyecto Dokploy separado con dominio, PostgreSQL, schema, bucket,
credenciales y tenants sintéticos propios. No puede compartir base, bucket,
service role, claves MFA/JWT ni proveedores de mensajería con producción. Debe
usar `NODE_ENV=production`, `DEPLOYMENT_PROFILE=production`, TLS estricto y el
mismo digest/`APP_REVISION` que se propone promover; `evaluation` sólo existe
para pruebas locales aisladas sin datos personales.

Los proveedores con efectos externos permanecen deshabilitados o en sandbox y
con destinatarios permitidos. La promoción no recompila: identifica y despliega
el mismo digest aprobado en staging. Una variable, dominio o identidad de base
que apunte a producción durante la preparación de staging es `STOP`.

## Antes de cualquier despliegue

1. Rota toda credencial compartida fuera de un gestor de secretos: PostgreSQL,
   service role de Storage, JWT de Supabase y secretos de sesión de la app.
2. Configura un remoto Git privado, revisa el historial completo por material
   sensible y rota preventivamente todo secreto que pudo estar expuesto. Un
   repositorio público o un árbol de trabajo sin congelar es `STOP`. Confirma
   además un mecanismo de recuperación compatible con la migración; conservar
   una imagen anterior no basta.
3. Toma un respaldo cifrado de PostgreSQL y demuestra que puede restaurarse en
   un entorno aislado, con egress e integraciones apagados, ACL mínima, registro
   de acceso, retención corta y destrucción verificable. Una copia de datos
   políticos es otra superficie de datos personales, no un simple artefacto QA.
4. Crea un bucket privado y configura `SUPABASE_STORAGE_BUCKET`. Supabase se usa
   sólo para Storage. Demuestra con la clave anónima que ninguna operación de
   objeto funciona sin URL firmada y que una firma expirada es rechazada.
5. Completa `.env.production` desde `.env.example`; nunca versiones ese archivo.
6. Congela el commit, inventaría el historial real de migraciones de cada base y
   no autorices el corte si difiere del candidato.

En Dokploy configura también estos tres valores como **Build-time Arguments**:
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Next.js los incorpora al paquete del navegador
durante la compilación; definirlos sólo como variables de ejecución no corrige
un paquete ya construido. El Dockerfile raíz detiene el build si alguno queda
vacío y no contiene valores de credenciales en el repositorio.

Configura además `APP_REVISION` como **Build-time Argument** con el SHA Git
completo de 40 caracteres del commit congelado y
`DEPLOYMENT_PROFILE=production`. No uses rama, tag móvil ni SHA abreviado. Si
Dokploy no expone una variable de commit documentada, el responsable de la
liberación copia el resultado exacto de `git rev-parse HEAD`; no se inventa un
nombre de variable del proveedor. Todas las imágenes escriben ese valor en
`org.opencontainers.image.revision` y fijan el remoto canónico en
`org.opencontainers.image.source`. Un build productivo con `unknown`, vacío o
un valor que no sea SHA completo se detiene antes de compilar la aplicación.

Después de construir, compara la etiqueta con el SHA congelado antes de iniciar
el migrador o publicar tráfico:

```bash
test "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$IMAGE_REF")" = "$RELEASE_SHA"
test "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.source" }}' "$IMAGE_REF")" = "https://github.com/ServiLut/politica-sostenible"
```

GitHub Actions pasa `${GITHUB_SHA}` al build combinado y `${{ github.sha }}` a
los tres builds de Compose. Para una imagen estrictamente local y desechable se
permite declarar de forma explícita `DEPLOYMENT_PROFILE=evaluation` junto con
`APP_REVISION=unknown`; esa imagen no se publica, promueve ni reutiliza para un
corte real.

Si Dokploy usa la imagen combinada, debe aplicar en ejecución `--read-only`,
`--tmpfs /tmp`, `--tmpfs /app/apps/web/.next/cache`,
`--security-opt no-new-privileges:true`, límites de CPU/memoria/PID y rotación de
logs, además de un timeout de parada de al menos
`SUPERVISOR_SHUTDOWN_GRACE_MS + 10 segundos` (40 segundos con el valor
predeterminado). El supervisor falla
cerrado si no puede ejecutar API y web con UID/GID
completos y distintos o si faltan filesystem de solo lectura y
`NoNewPrivileges`. Si el proveedor no permite configurar esas opciones, esa
topología no se autoriza.

## Migraciones

`20260827000000_baseline` es una línea base completa y reproducible. El job de
CI la aplica sobre PostgreSQL 16 vacío mediante el mismo guard usado en
producción, verifica su estado y comprueba que no exista deriva respecto de
`schema.prisma`.

Para una base nueva no se requiere intervención: el servicio `migrate` termina
antes de que arranque la API.

En Dokploy, el `Dockerfile` raíz ejecuta API y web en un único contenedor. Su
arranque ejecuta `deploy/migrate.mjs` antes de abrir ambos procesos y trabaja
exclusivamente con una conexión directa. La prioridad es `DIRECT_URL`, luego
`POSTGRES_URL_NON_POOLING` por compatibilidad; `DATABASE_URL` sólo se acepta
como último recurso cuando no contiene señales de pooler. Se rechazan
explícitamente `pgbouncer=true`, `pool_mode=transaction` y el puerto 6543.
La base y el schema seleccionados por la URL directa deben coincidir con
`DATABASE_URL`; los hosts pueden diferir por un pooler, pero las identidades no
deben compartir privilegios. El migrador usa un rol exclusivo con DDL limitado
al schema de la aplicación. La API usa otro rol sin DDL, sin acceso a otros
schemas y con el DML mínimo necesario. Esta separación se prueba en staging y
no se infiere comparando textos de URL. Si se
define `DATABASE_SCHEMA`, el guard lo escribe en una copia en memoria de
`DIRECT_URL` antes de entregarla tanto a `pg` como a Prisma; así la inspección y
la CLI nunca pueden operar sobre schemas distintos. Nunca imprimas estas URLs
en logs.

El guard de Dokploy falla cerrado según el estado observado:

- Schema vacío: ejecuta `prisma migrate deploy` y después `migrate status`.
- Baseline ya registrada y sin migración fallida: aplica migraciones pendientes
  y comprueba el estado.
- Exactamente las cinco migraciones históricas completas, sin filas adicionales:
  compara la base contra `prisma/baseline.schema.prisma`, una fotografía
  inmutable del contrato que esas migraciones deben producir. Sólo con deriva
  cero registra la baseline; luego aplica, en orden, las migraciones posteriores.
- Objetos existentes sin historial, filas parciales/fallidas, duplicados,
  migraciones históricas incompletas o nombres inesperados: detiene el
  contenedor con diagnóstico accionable y no modifica el esquema.
- Una migración local ya registrada cuyo checksum SHA-256 no coincide byte a
  byte con `_prisma_migrations`: detiene el contenedor antes de ejecutar Prisma.
  No se corrige la tabla de historial automáticamente.

Hay dos migraciones publicadas (`20260905130000_subscription_plans` y
`20260905140000_colombia_pmf_features`) cuyo contenido difiere entre el historial
Git y el candidato actual; la segunda además estaba codificada como UTF-16 y
repetía el DDL de la anterior. Por esa razón, **antes del próximo despliegue** se
debe consultar, en cada base objetivo y de forma de solo lectura,
`migration_name`, `checksum`, `finished_at`, `rolled_back_at` y
`applied_steps_count` para ambas filas. Si sus checksums no coinciden con los
archivos exactos del candidato congelado, se detiene el despliegue y se ensaya
la reconciliación sobre una copia restaurada. Nunca se edita
`_prisma_migrations` directamente en producción ni se asume que dos ambientes
tienen el mismo linaje.

Los SHA-256 canónicos de los archivos LF del candidato son:

| Migración                              | Candidato congelado                                                | Blob histórico original                                            |
| -------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `20260905130000_subscription_plans`    | `3c0eab259d299491ca612c6ae011d9b51f826800ed7d6f8b45a1ca0bceb17338` | `2014782367f42cb15389ab47b032c8c5d0b22aa6ece8d5eed3f59aa48503a450` |
| `20260905140000_colombia_pmf_features` | `4b69078f4848c7da9819758323cf85f7563df3bd97364dd2f9d81976c3bb088f` | `4c882121319131b92df23f3d841d5092fe17761f7ce6df66724641a9aab95e66` |

La consulta mínima de inventario debe calificar el schema explícitamente. Monta
la contraseña desde el gestor de secretos en un `PGPASSFILE` con modo `0600`;
no la escribas en la URI, el historial, argumentos o logs. La URL de `psql` no
puede contener el parámetro exclusivo de Prisma `schema=` y debe ser directa,
sin pooler:

```bash
export APP_SCHEMA='politica-sostenible'
export PGPASSFILE='/run/secrets/politica-postgres.pgpass'
export POSTGRES_INVENTORY_URL='postgresql://USER@HOST:5432/DATABASE?sslmode=verify-full&connect_timeout=10'
set -euo pipefail
set +x

test "$(stat -c '%a' "$PGPASSFILE")" = '600'
test "$(stat -c '%u' "$PGPASSFILE")" = "$(id -u)"

PGOPTIONS='-c default_transaction_read_only=on -c lock_timeout=10000 -c statement_timeout=30000 -c idle_in_transaction_session_timeout=30000' \
  psql "$POSTGRES_INVENTORY_URL" \
  --no-password \
  --set=ON_ERROR_STOP=1 \
  --set=app_schema="$APP_SCHEMA" <<'SQL'
BEGIN READ ONLY;
SELECT migration_name, checksum, finished_at, rolled_back_at,
       applied_steps_count
FROM :"app_schema"."_prisma_migrations"
WHERE migration_name IN (
  '20260905130000_subscription_plans',
  '20260905140000_colombia_pmf_features'
)
ORDER BY migration_name;

SELECT count(*) AS proposal_lifecycle_blockers
FROM :"app_schema"."PoliticalProposal"
WHERE
  ("status" IN ('DRAFT', 'PROPOSED') AND "progressPercent" <> 0)
  OR ("status" = 'COMPLETED' AND "progressPercent" <> 100);
COMMIT;
SQL
unset POSTGRES_INVENTORY_URL PGPASSFILE
```

La consulta sólo produce evidencia; por sí sola no autoriza un despliegue. Dos
revisores comparan exactamente las dos filas, sus estados y checksums. Cualquier
ausencia, duplicado, estado parcial, rollback o checksum distinto es `STOP`; no
se ejecuta el migrador sobre producción para “ver qué pasa”.
`proposal_lifecycle_blockers` debe ser cero; cualquier otro valor exige
reconciliar responsables y estados sobre una copia antes de abrir el corte.

El guard automatizado mantiene un advisory lock durante su inspección y
despliegue, incluida la única adopción histórica que reconoce de forma expresa.
No protege comandos manuales ejecutados fuera del guard. Prisma mantiene además
su propio lock durante `migrate deploy`. Antes de permitir el
arranque, el guard ejecuta también `prisma migrate diff --exit-code` contra
`schema.prisma` y comprueba de forma explícita los `CHECK`, índices parciales,
funciones y triggers críticos que Prisma no representa completamente. Un
historial marcado como aplicado no puede ocultar deriva física.

El guard prueba además que la conexión directa y la de runtime llegan a la
misma base física mediante un advisory lock aleatorio, y exige la huella
persistente de `SystemDatabaseIdentity`. Los timeouts por defecto son 10 segundos
para locks y 900 segundos por sentencia (`MIGRATION_LOCK_TIMEOUT_MS` y
`MIGRATION_STATEMENT_TIMEOUT_MS`). Sólo se elevan después de medir una copia
restaurada; nunca se elimina el límite para desbloquear un despliegue.

Antes de migrar, el contenedor también rechaza los valores públicos de
`.env.example`, secretos JWT o salts de consentimiento menores de 32 bytes y
URLs sin el protocolo esperado. Para el Dockerfile raíz usado por Dokploy,
`NESTJS_API_URL` debe ser `http://127.0.0.1:4000`; el Compose separado lo
sobrescribe internamente con `http://api:4000`.

TLS de PostgreSQL con validación de certificado y hostname se exige de forma
predeterminada cuando `NODE_ENV=production`: tanto `DATABASE_URL` como
`DIRECT_URL` deben declarar `sslmode=verify-full`, y los clientes deben recibir
una CA confiable cuando el proveedor no use una cadena pública.
Si un entorno aislado de evaluación no ofrece TLS y no contiene datos personales
ni operativos,
puede habilitarse temporalmente la excepción de doble consentimiento con
`DEPLOYMENT_PROFILE=evaluation` y
`ALLOW_INSECURE_DATABASE_CONNECTION=true`. En ese caso ambas URLs deben declarar
`sslmode=disable`, `DATABASE_SSL=false` y
`DATABASE_SSL_REJECT_UNAUTHORIZED=false`; el arranque
falla ante cualquier combinación parcial y deja una advertencia visible. Esta
excepción no es aceptable para producción real: habilita TLS en PostgreSQL,
vuelve al perfil `production` y restaura verificación estricta antes de cargar
datos personales.

No intentes ejecutar la línea base encima de tablas existentes. La adopción no
es una secuencia para copiar y pegar: un simple cotejo de host, puerto, base o
usuario no demuestra identidad física, TLS directo ni que el destino sea una
copia. Todo caso excepcional exige un runbook versionado y revisado por DBA que:

- opere primero sobre una restauración desechable con un marcador de identidad
  exclusivo de esa copia y verificación TLS/hostname;
- use roles separados de inventario, migración y runtime, con `PGPASSFILE`
  validado por dueño y modo, y nunca incluya contraseñas en URLs o logs;
- falle con código distinto de cero ante cualquier `STOP`, resultado inesperado,
  estado parcial, checksum distinto o deriva;
- mantenga un lock de exclusión durante toda modificación del historial y
  garantice un único migrador identificado por digest y commit;
- conserve inventario antes/después, logs, tiempos, aprobación de dos personas y
  un backup cuya restauración ya fue probada.

No se autoriza ejecutar `prisma migrate resolve`, `prisma db push` ni editar
`_prisma_migrations` manualmente en producción. Si la base tiene objetos sin
historial, un historial distinto del caso automatizado o deriva, el guard debe
detenerse hasta que ese runbook se implemente como script fail-closed y supere
una revisión independiente.

### Caso histórico automatizado por el guard

Algunas evaluaciones anteriores alcanzaron a registrar exactamente estas cinco
migraciones:

- `20260821123000_issue_case_mode_reference`
- `20260821140000_consent_revocation_reason`
- `20260821160000_team_invitations`
- `20260821170000_campaign_events`
- `20260821180000_user_account_lifecycle`

No borres, renombres ni edites esas filas. El guard de Dokploy automatiza la
adopción únicamente cuando observa esas cinco filas, todas completas, ninguna
adicional y deriva cero frente a la fotografía inmutable de baseline. Mantiene
el lock, registra la baseline y aplica los deltas desde una sola ejecución. CI
reproduce el escenario sobre PostgreSQL desechable y comprueba que las cinco
filas antiguas permanecen intactas. Cualquier otra combinación es `STOP` y se
rige por el procedimiento excepcional anterior; no se improvisa una resolución
manual durante el corte.

## Inventario y rotación de MFA

Antes de cambiar `MFA_TOTP_LEGACY_PLAINTEXT_MODE` de `migrate` a `reject` o de
retirar una clave anterior, inventaría sólo metadatos, nunca valores de secreto.
Ejecuta la consulta primero en una copia restaurada y después, en ventana
controlada, como lectura sobre el schema objetivo:

```bash
export APP_SCHEMA='politica-sostenible'
export PGPASSFILE='/run/secrets/politica-postgres.pgpass'
export POSTGRES_INVENTORY_URL='postgresql://USER@HOST:5432/DATABASE?sslmode=verify-full&connect_timeout=10'
set -euo pipefail
set +x
test "$(stat -c '%a' "$PGPASSFILE")" = '600'
test "$(stat -c '%u' "$PGPASSFILE")" = "$(id -u)"
PGOPTIONS='-c default_transaction_read_only=on -c lock_timeout=10000 -c statement_timeout=30000 -c idle_in_transaction_session_timeout=30000' \
  psql "$POSTGRES_INVENTORY_URL" \
  --no-password \
  --set=ON_ERROR_STOP=1 \
  --set=app_schema="$APP_SCHEMA" <<'SQL'
BEGIN READ ONLY;
SELECT
  count(*) FILTER (
    WHERE "totpSecret" IS NOT NULL
      AND "totpSecret" NOT LIKE 'totp:v1:%'
  ) AS legacy_plaintext_count,
  count(*) FILTER (
    WHERE "totpSecret" LIKE 'totp:v1:%'
  ) AS encrypted_count
FROM :"app_schema"."User";

SELECT split_part("totpSecret", ':', 3) AS key_id, count(*) AS envelopes
FROM :"app_schema"."User"
WHERE "totpSecret" LIKE 'totp:v1:%'
GROUP BY key_id
ORDER BY key_id;
COMMIT;
SQL
unset POSTGRES_INVENTORY_URL PGPASSFILE
```

Sólo `legacy_plaintext_count = 0` permite activar `reject`. Una clave permanece
en `MFA_TOTP_PREVIOUS_KEYS` hasta que su conteo sea cero después de que usuarios
autenticados hayan recifrado sus sobres y los eventos `MFA_SECRET_REENCRYPTED`
se hayan conciliado. No registres, exportes ni inspecciones `totpSecret`.

## Dependencias de herramientas de migración

Prisma 7.9.1 trae `deepmerge-ts` mediante
`prisma -> @prisma/config -> deepmerge-ts`. La versión 7.1.5 está afectada por
[GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx): dos
grafos de objetos recursivos pueden agotar la pila. JSON plano no satisface esa
precondición y la ruta se usa al cargar configuración de Prisma, no al atender
peticiones HTTP, pero el paquete sí es ejecutable dentro de `migrator`.

La tienda virtual de pnpm también puede conservar el artefacto en la imagen de
runtime aunque la CLI `prisma` no esté enlazada desde `apps/api/node_modules`;
por eso no se acepta como mitigación afirmar simplemente que es una dependencia
de desarrollo. El override raíz fuerza `deepmerge-ts` 8.0.0 —la primera versión
corregida— en ambas imágenes. CI inspecciona el árbol resuelto y falla si el
componente mayor de alguna versión es inferior a 8. Revisa y retira el override cuando una
versión de Prisma declare de forma nativa `deepmerge-ts >= 8`.

Comprobación local:

```bash
pnpm why deepmerge-ts -r
pnpm list deepmerge-ts -r --depth 20
```

## Validación previa

```bash
pnpm install --frozen-lockfile
pnpm --filter api generate
pnpm --filter api exec prisma validate
pnpm --filter api exec tsc -p tsconfig.build.json --noEmit --incremental false
unset TEST_DATABASE_URL DATABASE_URL DIRECT_URL POSTGRES_URL_NON_POOLING
pnpm --filter api exec jest --runInBand
pnpm test:deploy
pnpm test:web-unit
pnpm --filter web exec tsc --noEmit --incremental false
pnpm --filter web lint
pnpm build
pnpm test:e2e
docker compose --env-file .env.production -f compose.production.yml config --quiet
docker compose --env-file .env.production -f compose.production.yml build
docker build \
  --build-arg DEPLOYMENT_PROFILE=evaluation \
  --build-arg APP_REVISION=unknown \
  --build-arg NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:?export NEXT_PUBLIC_APP_URL}" \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:?export NEXT_PUBLIC_SUPABASE_URL}" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:?export NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  --tag politica-sostenible-local .
docker run --rm --entrypoint node politica-sostenible-local apps/api/node_modules/prisma/build/index.js --version
```

Las pruebas unitarias anteriores se ejecutan sin URL de base para impedir que un
test mal clasificado altere PostgreSQL. El último `docker run` sí inicia un
contenedor efímero, pero sólo consulta la versión de la CLI y no recibe una URL
de base. Nunca ejecutes `compose up` con las URLs de producción durante esta fase: ese comando
activa el migrador. El arranque real pertenece exclusivamente al corte
controlado descrito abajo, después de bloquear escrituras y detener binarios
anteriores.

El gate no se considera verde con un `docker compose config` ni un build
aislado. Debe arrancar físicamente la topología separada sobre PostgreSQL 16
desechable, esperar `migrate` exitoso, comprobar readiness, login, filesystem de
solo lectura, UID/GID efectivos y ausencia de secretos de API en web. Si también
se mantiene el contenedor combinado, se construye y prueba por separado con los
flags endurecidos descritos arriba.

La imagen final de la API instala únicamente las dependencias declaradas de
producción. En el candidato actual `prisma` sigue declarado allí para sostener
la imagen combinada de compatibilidad, por lo que no debe afirmarse que la CLI
está ausente del runtime. El contenedor efímero `migrate` conserva además la CLI
y el historial y termina antes de iniciar la API. Antes de reducir esta
superficie se debe separar el paquete de migración sin romper la topología
combinada. Los prototipos `apps/pwa-field` y `packages/ai-agent` siguen fuera del
workspace y del despliegue.

El contenedor combinado de Dokploy también conserva Prisma CLI 7.9.1 como
dependencia de producción porque migra antes de iniciar. La CLI, el schema y el
historial se copian durante el build; no descarga herramientas ni ejecuta
`pnpm install` al arrancar.

## Corte controlado y recuperación

Este candidato no autoriza rollout gradual ni convivencia de versiones. Los
cambios de autenticación, MFA y esquema hacen inseguro iniciar un binario viejo
contra una base ya migrada. El procedimiento es:

1. Abre ventana de mantenimiento y bloquea nuevas escrituras.
2. Drena solicitudes y detén todos los nodos API, web y workers anteriores.
3. Toma el respaldo final, registra su hora/RPO y restaura una copia para probarlo.
4. Ejecuta el inventario de historial, identidad, roles y MFA; ante cualquier
   diferencia, `STOP`.
5. Verifica que las etiquetas OCI `revision` y `source` de cada imagen coincidan
   con el commit congelado y el repositorio canónico; conserva esa evidencia.
6. Ejecuta una sola vez el servicio `migrate` del commit y digest congelados;
   no lances además el comando manual ni una segunda instancia de Compose.
   Conserva sus logs.
7. Inicia únicamente API y web del mismo commit. Espera readiness antes de abrir
   tráfico.
8. Comprueba `/api/health/live`, `/api/health/ready`, login, aislamiento entre dos
   tenants, carga firmada/consumo único/lectura temporal, consentimiento,
   finanzas, tareas y compromisos con datos sintéticos.
9. Abre tráfico sólo después de aprobar el smoke; mantén observación y un canal
   operativo manual.

Esta lista es política de corte, no un orquestador ejecutable. Antes de usarla
debe existir un runbook externo con responsable nominal, comandos del proveedor,
criterios cuantificados de aborto, digest/commit, confirmación de cero nodos o
writers antiguos y evidencia de restauración. Sin ese documento aprobado, el
corte permanece en `NO-GO`.

La imagen anterior se conserva como artefacto archivado, nunca ejecutándose en
paralelo contra la base migrada. Si falla el corte, la primera opción es una
corrección hacia adelante o un binario puente explícitamente compatible. La
restauración del backup es el último recurso y debe aceptar por escrito el RPO:
toda escritura posterior al respaldo se perderá o requerirá reconciliación
manual. No se hace “rollback” de migraciones editando tablas, checksums ni
`_prisma_migrations`.
