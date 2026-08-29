# Despliegue seguro

La aplicación está preparada para ejecutarse detrás del proxy HTTPS del VPS.
La web se publica únicamente en `127.0.0.1`; NestJS permanece en la red interna
de Compose. Redis y BullMQ se incorporarán cuando exista el primer worker real.

Compose usa `.env.production` sólo para interpolar variables y entrega a cada
contenedor una lista explícita. La web nunca recibe `DATABASE_URL`, `DIRECT_URL`
ni `SUPABASE_SERVICE_ROLE_KEY`.

## Antes de cualquier despliegue

1. Rota toda credencial compartida fuera de un gestor de secretos: PostgreSQL,
   service role de Storage, JWT de Supabase y secretos de sesión de la app.
2. Configura un remoto Git privado y confirma un mecanismo de rollback.
3. Toma un respaldo de PostgreSQL y demuestra que puede restaurarse en un
   entorno aislado.
4. Crea un bucket privado y configura `SUPABASE_STORAGE_BUCKET`. Supabase se usa
   sólo para Storage. Demuestra con la clave anónima que ninguna operación de
   objeto funciona sin URL firmada y que una firma expirada es rechazada.
5. Completa `.env.production` desde `.env.example`; nunca versiones ese archivo.

## Migraciones

`20260827000000_baseline` es una línea base completa y reproducible. El job de
CI la aplica sobre PostgreSQL 16 vacío mediante `prisma migrate deploy`, verifica
su estado y comprueba que no exista deriva respecto de `schema.prisma`.

Para una base nueva no se requiere intervención: el servicio `migrate` termina
antes de que arranque la API.

No intentes ejecutar la línea base encima de tablas existentes. Toda adopción
se ensaya primero contra una copia restaurada y exige respaldo recuperable,
ventana de mantenimiento y deriva cero.

Inyecta `POSTGRES_ADOPTION_URL` desde el gestor de secretos apuntando únicamente
a esa copia restaurada. Los comandos siguientes asignan esa misma URL a
`DIRECT_URL` de forma explícita para no comprobar una base y resolver otra.

### Base existente sin historial de Prisma

Una base creada sólo con `prisma db push` no tendrá la tabla
`_prisma_migrations`, o la tendrá vacía. Sobre la **copia restaurada** comprueba
primero la deriva:

```bash
DIRECT_URL="$POSTGRES_ADOPTION_URL" \
  pnpm --filter api exec prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --exit-code
```

Sólo si la deriva es cero y el respaldo fue validado, registra la línea base
como ya aplicada:

```bash
DIRECT_URL="$POSTGRES_ADOPTION_URL" \
  pnpm --filter api exec prisma migrate resolve \
  --applied 20260827000000_baseline
DIRECT_URL="$POSTGRES_ADOPTION_URL" \
  pnpm --filter api exec prisma migrate status
```

Si la deriva no es cero, detén el despliegue y crea una migración de
reconciliación revisada. Nunca uses `prisma db push` en ese entorno.

### Base con las cinco migraciones históricas de 20260821

Algunas evaluaciones anteriores alcanzaron a registrar estas migraciones:

- `20260821123000_issue_case_mode_reference`
- `20260821140000_consent_revocation_reason`
- `20260821160000_team_invitations`
- `20260821170000_campaign_events`
- `20260821180000_user_account_lifecycle`

No borres, renombres ni edites esas filas. Prisma acepta conservarlas y añadir
la baseline como nuevo punto común. Antes de hacerlo, ejecuta este guard de
solo lectura en la **copia restaurada**. `POSTGRES_ADOPTION_URL` debe ser una
URL estándar de PostgreSQL que apunte a esa copia, no a la base primaria:

```bash
PGOPTIONS='-c default_transaction_read_only=on' \
  psql "$POSTGRES_ADOPTION_URL" -v ON_ERROR_STOP=1 <<'SQL'
WITH expected(name) AS (
  VALUES
    ('20260821123000_issue_case_mode_reference'),
    ('20260821140000_consent_revocation_reason'),
    ('20260821160000_team_invitations'),
    ('20260821170000_campaign_events'),
    ('20260821180000_user_account_lifecycle')
), observed AS (
  SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
  FROM "_prisma_migrations"
)
SELECT CASE
  WHEN (SELECT count(*) FROM observed) = 5
   AND NOT EXISTS (
     SELECT 1
     FROM expected e
     LEFT JOIN observed o ON o.migration_name = e.name
     WHERE o.migration_name IS NULL
        OR o.finished_at IS NULL
        OR o.rolled_back_at IS NOT NULL
        OR o.applied_steps_count < 1
   )
  THEN 'READY'
  ELSE 'STOP'
END AS baseline_adoption;
SQL
```

Sólo `READY` autoriza continuar. `STOP`, una migración parcial/fallida, una
sexta fila inesperada o la ausencia de la tabla requieren revisión manual; no
se corrigen modificando `_prisma_migrations`. Aun con `READY`, verifica que el
esquema real ya sea exactamente el esquema actual:

```bash
DIRECT_URL="$POSTGRES_ADOPTION_URL" \
  pnpm --filter api exec prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --exit-code
```

Con deriva cero, registra la baseline y valida el resultado:

```bash
DIRECT_URL="$POSTGRES_ADOPTION_URL" \
  pnpm --filter api exec prisma migrate resolve \
  --applied 20260827000000_baseline
DIRECT_URL="$POSTGRES_ADOPTION_URL" \
  pnpm --filter api exec prisma migrate status
```

Es normal que `migrate status` anuncie historias distintas antes de
`resolve`. Después debe responder `Database schema is up to date!`. El CI
reproduce este escenario en una segunda base PostgreSQL desechable y comprueba
que las cinco filas antiguas permanecen intactas.

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
pnpm --filter api test --runInBand
pnpm test:web-unit
pnpm --filter web exec tsc --noEmit --incremental false
pnpm --filter web lint
pnpm build
pnpm test:e2e
docker compose --env-file .env.production -f compose.production.yml config
docker compose --env-file .env.production -f compose.production.yml build
```

La imagen final de la API enlaza únicamente dependencias de producción. El
contenedor efímero `migrate` conserva Prisma CLI y el historial; termina antes
de iniciar la API. Los prototipos `apps/pwa-field` y `packages/ai-agent` siguen
fuera del workspace y del despliegue.

## Activación

Después de aprobar la migración y verificar el respaldo:

```bash
docker compose --env-file .env.production -f compose.production.yml up -d
docker compose --env-file .env.production -f compose.production.yml ps
```

Comprueba `/health/live`, `/health/ready`, login, aislamiento entre dos tenants,
carga firmada, consumo único y lectura temporal auditada de un soporte, además
de los flujos de consentimiento, finanzas, tareas y compromisos. Mantén la
versión anterior disponible hasta completar las pruebas.
