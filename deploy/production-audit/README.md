# Prueba HTTP controlada de Política Sostenible

Este runner está preparado para una ejecución deliberada **sobre dos organizaciones
sintéticas exclusivas**, después del despliegue. No se ejecuta en CI, no crea
organizaciones o cuentas y no acepta términos. La preparación del script no
constituye evidencia de que producción pasó las pruebas.

Sin argumentos o con `--plan` imprime el alcance sin red, sin leer credenciales y
sin crear archivos:

```powershell
node deploy/production-audit/controlled-http-smoke.mjs --plan
node --test deploy/production-audit/controlled-http-smoke.test.mjs
```

Preparación del operador responsable:

1. Confirmar la revisión de 40 caracteres desplegada y la salud de **esta aplicación**.
   No reiniciar ni consultar credenciales de otras aplicaciones.
2. Preparar mediante el backend dos organizaciones nuevas, marcadas sintéticas,
   sin perfil operativo, tipo `CANDIDACY`, modo `CAMPAIGN`, sin integraciones,
   personas, documentos, teléfonos, saldos o catálogos reales. Dos usuarios
   `ADMIN`, activos, con contraseñas aleatorias, `mustChangePassword=false` y sin
   acceso SaaS global. No reutilizar cuentas humanas ni `/auth/register`.
3. Guardar los IDs comprobados en
   `.artifacts/production-audit/<UUID-v4>/manifest.json`. El UUID identifica una
   sola ejecución. Nombres, slugs y correos deben ajustarse exactamente al
   siguiente contrato; las contraseñas permanecen en variables efímeras:

```json
{
  "kind": "politica-production-synthetic-audit-v1",
  "runId": "<UUID-v4-minúsculo>",
  "origin": "https://politica-sostenible.abogadosencolombiasas.com",
  "revision": "<40-caracteres-hex-de-la-revisión-desplegada>",
  "operatorVerifiedSynthetic": true,
  "accounts": {
    "a": {
      "tenantId": "<CUID-comprobado-A>",
      "userId": "<CUID-comprobado-usuario-A>",
      "slug": "ps-audit-<UUID-v4>-a",
      "name": "PRUEBA SINTÉTICA ps-audit-<UUID-v4>-a",
      "email": "ps-audit-<UUID-v4>-a@example.invalid"
    },
    "b": {
      "tenantId": "<CUID-comprobado-B>",
      "userId": "<CUID-comprobado-usuario-B>",
      "slug": "ps-audit-<UUID-v4>-b",
      "name": "PRUEBA SINTÉTICA ps-audit-<UUID-v4>-b",
      "email": "ps-audit-<UUID-v4>-b@example.invalid"
    }
  }
}
```

`operatorVerifiedSynthetic` documenta una verificación externa: **no prueba por
sí mismo** que el operador haya creado los datos correctamente. El runner
contrasta IDs, nombres, slug, correo, rol, tipo, modo y ausencia de perfil en el
login y en `/auth/me` antes de cualquier alta. Si la sesión exige MFA, se detiene;
no cambia la configuración MFA ni simula su validación.

Para ejecutar, el operador debe inyectar de forma privada
`POLITICA_PRODUCTION_SMOKE_A_PASSWORD` y `POLITICA_PRODUCTION_SMOKE_B_PASSWORD`
en el proceso. No escribir sus valores en consola, historial o documentación.
No hay lectura automática de `.env`, credenciales de producción o archivos SSH.

```powershell
$env:POLITICA_PRODUCTION_SMOKE_CONFIRM = 'SYNTHETIC_TENANTS_ONLY'
node deploy/production-audit/controlled-http-smoke.mjs --execute <UUID-v4>
```

Ejecuta peticiones secuenciales solo al origen exacto, con prefijo `/api`, hasta
40 peticiones, 12 segundos por petición y sin reintentos ni redirecciones. La
secuencia nominal usa 31 peticiones. Requiere que `X-App-Revision` coincida en
cada respuesta; un cambio durante la prueba exige revisión del operador.
No es una prueba de carga. El cierre invalida las sesiones de estas dos cuentas:
no usarlas simultáneamente en el navegador.

El diario local conserva únicamente IDs sintéticos, rutas, estados HTTP,
intenciones previas a cada alta y controles confirmados. No contiene JWT,
contraseñas ni cuerpos de respuestas. Las altas no se repiten cuando ya existe
un diario. Un bloqueo `runner.lock` impide dos procesos sobre la misma ejecución;
si queda tras una interrupción, verificar primero que el proceso terminó antes
de retirarlo manualmente.

La limpieza se intenta incluso si falla una comprobación, únicamente después de
verificar A. Conserva la tarea `CANCELLED`, elimina únicamente el evento `DRAFT`
del diario y confirma los resultados con consultas posteriores. Si una creación
quedó sin respuesta, busca como máximo dos registros por el marcador UUID exacto
y exige coincidencia unívoca de tenant y nombre. No borra datos históricos,
usuarios, organizaciones ni auditoría. Un cambio de nombre, estado o identidad
detiene la limpieza del objeto afectado.

Para reanudar **solo la limpieza**, con el mismo manifiesto y credenciales:

```powershell
node deploy/production-audit/controlled-http-smoke.mjs --cleanup <UUID-v4>
```

Si el diario original registra una única creación de evento con HTTP 201, pero
la validación impidió conservar su ID y la tarea ya quedó cancelada, existe una
continuación acotada:

```powershell
node deploy/production-audit/controlled-http-smoke.mjs --resume-event <UUID-v4>
```

Este modo conserva `journal.json` y escribe `event-reconciliation.json` por
separado. No permite crear eventos ni acceder a tareas. Exige una coincidencia
unívoca del marcador, consulta el detalle y verifica el responsable sintético,
modo y estado. El contrato público de eventos omite `tenantId`: el aislamiento
se comprueba mediante la identidad autenticada A y los rechazos de lectura y
escritura de B. Después verifica la modificación de A, elimina solo el borrador
comprobado y confirma su ausencia. Tiene un máximo de 20 peticiones, 19 en el
recorrido esperado; no repite una conciliación ya registrada.

Después de revisar el diario, el operador debe desactivar las dos cuentas por el
backend de la aplicación y verificar su estado; el runner no dispone de una
ruta de desactivación permitida. Conservar organizaciones sintéticas, tarea
cancelada y auditoría identificables. No presentar la cancelación como borrado
total. Los logs del servidor y las métricas globales pueden reflejar la prueba.

Límites y matriz de cobertura: [plan de producción](../../docs/PRUEBAS_PRODUCCION_2026-09-25.md).
