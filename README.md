# Política Sostenible

Sistema operativo multitenant para campañas políticas y equipos de gestión pública en Colombia. Coordina territorio, relacionamiento consentido, agenda, equipo, finanzas, tareas, compromisos, atención ciudadana, incidentes, comunicaciones, auditoría y operación del Día D.

## Arquitectura

- `apps/web`: Next.js App Router; presentación y peticiones HTTP con Bearer.
- `apps/api`: NestJS; autenticación, RBAC, lógica de negocio, Prisma y PostgreSQL.
- `packages/ui`: componentes compartidos disponibles para evolución del monorepo.
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

La prueba `pnpm --filter api test:integration` requiere `TEST_DATABASE_URL` apuntando exclusivamente a una base PostgreSQL desechable. CI crea PostgreSQL 16, aplica la migración de línea base con `prisma migrate deploy`, comprueba deriva y ejecuta las pruebas de restricciones reales.

## Producción

Consulta [DEPLOYMENT.md](./DEPLOYMENT.md) antes de desplegar, [PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md) para el alcance implementado y [docs/ESTRATEGIA_PRODUCTO_2026.md](./docs/ESTRATEGIA_PRODUCTO_2026.md) para la investigación competitiva y el roadmap. No ejecutes `prisma db push` contra producción ni adoptes la línea base en una base existente sin respaldo restaurado, deriva cero y rollback probado.

La plataforma prepara controles y borradores internos; no sustituye Cuentas Claras, la Registraduría, el CNE, la SIC ni la revisión jurídica y contable aplicable.
