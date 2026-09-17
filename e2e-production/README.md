# Auditoría READ-ONLY de roles en producción

Esta suite está fuera de `test:e2e` y no inicia servidores locales. Requiere una
confirmación deliberada, un origen HTTPS y credenciales para los 11 roles. No
guarda estado autenticado, trazas, videos ni capturas. Después del login bloquea
en el navegador todo `POST`, `PUT`, `PATCH` o `DELETE`.

Variables obligatorias:

- `POLITICA_PRODUCTION_ROLE_AUDIT_CONFIRM=READ_ONLY_PRODUCTION_ROLE_AUDIT`
- `POLITICA_PRODUCTION_ROLE_AUDIT_BASE_URL=https://dominio-de-produccion`
- Para cada rol del enum, `POLITICA_PRODUCTION_ROLE_AUDIT_<ROLE>_EMAIL` y
  `POLITICA_PRODUCTION_ROLE_AUDIT_<ROLE>_PASSWORD`.
- Si una cuenta usa MFA, también
  `POLITICA_PRODUCTION_ROLE_AUDIT_<ROLE>_TOTP_SECRET` en Base32.

Roles requeridos: `ADMIN`, `CAMPAIGN_MANAGER`, `FINANCE_MANAGER`,
`COMMUNICATIONS_MANAGER`, `CONSTITUENT_SERVICES_MANAGER`, `CASE_WORKER`,
`COMPLIANCE_OFFICER`, `AUDITOR`, `ZONE_COORDINATOR`, `WITNESS` y `VOLUNTEER`.

Ejecutar únicamente en una consola efímera cuyas variables no se registren en
historial ni archivos versionados:

```powershell
pnpm exec playwright test --config playwright.production-role-audit.config.ts
```

La suite inicia sesión por la interfaz, confirma el rótulo del rol, recorre cada
ruta visible, comprueba rutas mínimas esperadas, fuerza accesos prohibidos y
falla ante intentos de mutación, errores de consola, respuestas API 401 o 5xx.
