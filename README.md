# Política Sostenible

Sistema operativo multitenant para campañas políticas y equipos de gestión pública en Colombia. Coordina territorio, relacionamiento consentido, agenda, equipo, finanzas, tareas, compromisos, atención ciudadana, incidentes, comunicaciones, auditoría y operación del Día D.

## Arquitectura

- `apps/web`: Next.js App Router; presentación y peticiones HTTP con Bearer.
- `apps/api`: NestJS; autenticación, RBAC, lógica de negocio, Prisma y PostgreSQL.
- `packages/ui`: componentes compartidos.
- Supabase se usa únicamente como Storage privado mediante subidas directas con URL firmada.
- Cada registro operativo está aislado por `tenantId`, obtenido del JWT y validado en NestJS.

Los prototipos inseguros `apps/pwa-field` y `packages/ai-agent` están excluidos del workspace. Las rutas visuales heredadas con datos simulados se bloquean o redirigen a módulos reales.

## Desarrollo

Requisitos: Node.js 22, pnpm 10.28.2, PostgreSQL y un bucket privado compatible con Supabase Storage.

```bash
pnpm install --frozen-lockfile
pnpm --filter api generate
pnpm dev
```

Copia `.env.example` a un archivo local no versionado y usa valores exclusivos de desarrollo. Nunca reutilices secretos productivos.

## Verificación

```bash
pnpm --filter api exec prisma validate
pnpm --filter api test --runInBand
pnpm test:web-unit
pnpm --filter api build
pnpm --filter web exec tsc --noEmit --incremental false
pnpm --filter web lint
pnpm --filter web build
pnpm test:e2e
```

La prueba `pnpm --filter api test:integration` requiere `TEST_DATABASE_URL` apuntando exclusivamente a una base PostgreSQL desechable. CI crea ese servicio y ejecuta `prisma db push` sólo allí.

## Producción

Consulta [DEPLOYMENT.md](./DEPLOYMENT.md) antes de desplegar y [PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md) para las decisiones de producto y fuentes colombianas. No ejecutes `prisma db push` contra producción ni apliques estas migraciones sin respaldo restaurado, reconciliación de la línea base y rollback probado.

La plataforma prepara controles y borradores internos; no sustituye Cuentas Claras, la Registraduría, el CNE, la SIC ni la revisión jurídica y contable aplicable.
