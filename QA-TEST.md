# Verificación de producto

Este archivo ya no registra fallos de prototipos retirados. La verificación
automatizada vigente está en Jest, Playwright y el workflow de CI.

## Puerta de calidad

```bash
pnpm install --frozen-lockfile
pnpm --filter api generate
pnpm --filter api exec prisma validate
pnpm --filter api test --runInBand
pnpm test:web-unit
pnpm --filter api exec tsc -p tsconfig.json --noEmit
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
pnpm --filter web build
pnpm test:e2e
```

La integración PostgreSQL requiere una base desechable. Debe aplicar primero
`prisma migrate deploy`; nunca uses una base real para esa prueba.

## Smoke test previo a liberar

1. Crear dos organizaciones de prueba y confirmar que ninguna consulta,
   archivo o auditoría cruza el tenant autenticado.
2. Revocar un consentimiento y comprobar que una sincronización offline no lo
   reactiva ni reemplaza sus datos.
3. Registrar un soporte mediante URL firmada y comprobar que el binario viaja
   directo a Storage con ruta `{tenantId}/{module}/{uuid-v4}.{ext}`. Intentar
   reutilizarlo debe fallar; su lectura debe requerir ID de recurso, rol vigente
   y una URL nueva de cinco minutos, dejando auditoría sin ruta ni PII.
4. Registrar un movimiento financiero y comprobar que quien lo creó no puede
   aprobarlo, que nadie puede aprobarlo sin soporte y que una segunda persona
   autorizada sí puede hacerlo con motivo.
5. Exportar el borrador financiero y confirmar que sólo incluye gastos
   aprobados o ya reportados y que se identifica como preparatorio, nunca como
   radicación oficial.
6. Verificar los centros de mando `CAMPAIGN` y `PUBLIC_OFFICE` con roles
   permitidos y denegados, sin enviar `tenantId` ni modo desde el navegador.
7. Completar captura E-14, incidentes, invitaciones, tareas, agenda y auditoría
   en escritorio y móvil.
8. Probar con la clave anónima de Storage que listar, leer, crear, sobrescribir
   y borrar sin firma devuelve denegación; repetir contra otro tenant.

Las capacidades aún no liberadas —offline cifrado completo, portal público,
MFA y automatización de derechos de titulares— permanecen en el roadmap de
[estrategia](./docs/ESTRATEGIA_PRODUCTO_2026.md), no se consideran aprobadas por
este checklist.
