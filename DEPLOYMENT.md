# Despliegue seguro

La aplicación está preparada para ejecutarse detrás del proxy HTTPS del VPS. El archivo `compose.production.yml` publica la web únicamente en `127.0.0.1`; NestJS permanece en la red interna de Compose. Redis/BullMQ se añadirán cuando exista un worker real que los necesite.

Compose usa `.env.production` sólo para interpolar variables y entrega a cada contenedor una lista explícita: la web no recibe `DATABASE_URL` ni `SUPABASE_SERVICE_ROLE_KEY`. Las variables obligatorias fallan al validar la configuración si están ausentes.

## Bloqueadores antes del primer despliegue

1. Rotar todas las credenciales compartidas fuera del gestor de secretos: contraseña PostgreSQL, service role de Storage, secreto JWT de Supabase y cualquier secreto de sesión/JWT de la aplicación.
2. Recuperar o configurar el repositorio Git remoto y confirmar un mecanismo de rollback. Este directorio no contiene metadatos `.git`.
3. Tomar y restaurar en un entorno aislado una copia de PostgreSQL.
4. Reconciliar una línea base de migraciones contra la copia restaurada y preparar el backfill de `tenantId` antes de imponer las nuevas claves foráneas. La carpeta actual contiene cambios incrementales, no una línea base suficiente para una base desconocida. No ejecutar `prisma db push` sobre producción.
5. Crear un bucket privado y configurar `SUPABASE_STORAGE_BUCKET`. Supabase se usa sólo para Storage.
6. Completar `.env.production` a partir de `.env.example`; nunca versionar ese archivo.

## Validación previa

```bash
pnpm install --frozen-lockfile
pnpm --filter api generate
pnpm --filter api exec prisma validate
pnpm --filter api test:integration
pnpm --filter api test --runInBand
pnpm test:web-unit
pnpm --filter api build
pnpm --filter web exec tsc --noEmit --incremental false
pnpm --filter web lint
pnpm --filter web build
pnpm test:e2e
docker compose --env-file .env.production -f compose.production.yml config
docker compose --env-file .env.production -f compose.production.yml build
```

La imagen final de la API enlaza únicamente dependencias de producción; Prisma
CLI, Jest, TypeScript, ESLint y Nest CLI no son resolubles desde el proceso de
ejecución. Los prototipos `apps/pwa-field` y `packages/ai-agent` están excluidos
del workspace y de este despliegue.

Al 21 de agosto de 2026, `pnpm audit --prod` conserva un aviso alto en
`deepmerge-ts`, heredado exclusivamente por `prisma` CLI a través de
`@prisma/config`. Prisma 7.9.1 aún fija la versión vulnerable y no existe una
actualización compatible aguas arriba. El CLI no es resoluble en la imagen de
ejecución; se debe volver a evaluar el aviso al actualizar Prisma, sin forzar
una versión mayor incompatible mediante `overrides`.

## Activación

Después de aprobar la migración y verificar el respaldo:

```bash
docker compose --env-file .env.production -f compose.production.yml up -d
docker compose --env-file .env.production -f compose.production.yml ps
```

Comprobar `/health/live`, `/health/ready`, login, aislamiento entre dos tenants de prueba, carga firmada de un soporte y los flujos de votantes, finanzas, tareas y compromisos. Mantener la versión anterior disponible hasta completar estas pruebas.
