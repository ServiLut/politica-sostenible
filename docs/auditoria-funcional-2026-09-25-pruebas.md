# Auditoría funcional: evidencia de pruebas y utilidad del producto

Fecha: 25 de septiembre de 2026. Alcance: repositorio local; ningún despliegue ni escritura en producción realizados por esta revisión.

## Conclusión de cobertura

El repositorio contiene pruebas extensas, pero no debe confundirse su inventario con un recorrido completo que haya demostrado la persistencia real de todas las operaciones. La suite local de navegador construye sólo Next.js y sustituye muchas respuestas de la API y Storage. Un resultado correcto de esa suite prueba interfaz, manejo de errores y contratos simulados, no la conexión física completa Next → Nest → PostgreSQL → Storage → worker.

Inventario obtenido en este corte:

- `playwright test --list`: 318 casos en 46 archivos. Son 159 escenarios ejecutables en dos perfiles, escritorio y móvil; no 318 funcionalidades diferentes.
- 44 archivos de `e2e` contienen interceptaciones `page.route`, `route.fulfill` o `route.abort`; se encontraron 548 referencias. Se inspeccionaron sus fixtures antes de clasificar la evidencia.
- 66 archivos de pruebas unitarias web al inicio; usan el runner Playwright sin abrir navegador.
- 13 archivos de integración `*postgres.integration.spec.ts` exigen una base real de prueba. Sin `TEST_DATABASE_URL`, no deben presentarse como una verificación física ejecutada.
- Inventario estático de contratos: 245 rutas NestJS, 233 llamadas web (69 mediante wrappers), cero destinos no resueltos y ninguna llamada sin ruta HTTP compatible. Esto demuestra correspondencia de rutas, no éxito operativo de cada solicitud.
- La auditoría de producción por 11 roles estaba documentada, pero le faltaba `playwright.production-role-audit.config.ts`. Se agregó el archivo, con opt-in obligatorio, origen HTTPS, un solo worker, bloqueo de service workers, sin trazas, videos o capturas. No se ejecutó contra producción.

## Resultados reproducibles

| Control | Baseline local | Resultado posterior de este subtrabajo | Alcance real |
|---|---:|---:|---|
| Web unit completa | 260 pasan, 11 fallan, total 271 | Ver suite completa final del informe principal | Pruebas locales, sin navegador |
| Seis archivos unit web corregidos | 10 fallos repartidos entre formato y fixtures | 27 de 27 pasan | Validación de código y contratos simulados |
| Deploy completo | 111 pasan, 9 fallan, total 120 | 120 pasan y 1 falla, total 121; se agregó prueba del analizador de rutas | Guards y contratos de archivos, no despliegue |
| Identidad del artefacto | Aceptaba `unknown` en producción | 3 de 3 pasan tras cerrar ese permiso | Validación de metadatos |
| Compose + seguridad del repositorio | Fallos de wiring y configuración | 13 de 13 pasan; permiso de compilación fijado a `msgpackr-extract@3.0.4`, sin reinstalar paquetes | Análisis estático; Docker daemon no disponible |
| Dominio voter | 134 de 134 pasan | 143 de 143 pasan, incluidas 9 nuevas de jornada | Servicio con dependencias simuladas |
| Nest HTTP | Sin ejecución en CI | 2 suites, 3 pruebas pasan; incorporadas a CI | Bootstrap y logout HTTP; Prisma sustituido, sin persistencia física |

Comandos directos utilizados ante un problema del `pnpm` del PATH:

```powershell
node --test deploy/*.test.mjs
node node_modules/@playwright/test/cli.js test --config playwright.unit.config.ts
node node_modules/@playwright/test/cli.js test --list
# Desde apps/api:
node node_modules/jest/bin/jest.js --runInBand --testPathPatterns=voter --testPathIgnorePatterns=integration.spec.ts
```

El `pnpm` del PATH intentaba una reinstalación automática y advertía que ignoraba `pnpm.overrides`. Se abortó por ausencia de TTY. No se forzó ni se reinstaló el árbol de dependencias. Las ejecuciones directas utilizaron los paquetes existentes.

Evidencia guardada en `.artifacts/auditoria-web-unit-2026-09-25.log`, `.artifacts/auditoria-web-unit-corregidos-2026-09-25.log`, `.artifacts/auditoria-deploy-2026-09-25.log`, `.artifacts/auditoria-deploy-final-2026-09-25.log`, `.artifacts/auditoria-compose-corregido.log`, `.artifacts/auditoria-e2e-inventario-2026-09-25.log`, `.artifacts/auditoria-api-http.log` y `.artifacts/auditoria-voter-corregido.log`.

## Correcciones verificadas

1. Pruebas MFA, importación, estado de sesión y PWA: normalización CRLF/LF al inspeccionar fuentes. El control de la caché ahora exige encontrar realmente la espera de dependencias antes de publicar el launcher; no acepta accidentalmente índice `-1`.
2. Fixtures de Storage y E-14: confirmación coherente con los campos obligatorios `objectId` y `contentIntegrity`. Los casos con huella no declaran éxito antes de verificación. Se conservó el contrato productivo exigente.
3. Jornada: lectura por identidad/rol actuales en BD, tenant y territorio asignado; etapa `ELECTION_DAY`; último consentimiento vigente. Se enmascara el teléfono y se calculan conteos desde las mismas personas autorizadas. La escritura aplica bloqueo del ciclo de vida, transacción serializable, autorización, consentimiento y auditoría; `update` incluye `id` y `tenantId`.
4. DTO de jornada: enum de Prisma para el estado y eliminación del campo `notes` que se aceptaba sin usar ni guardar.
5. Imports exclusivamente de tipos en controladores Finance/Export para que la compilación no busque tipos de Express como valores de ejecución.
6. Deploy: producción vuelve a exigir SHA Git completo; Compose conecta Redis, HMAC offline y flags de acceso, inicia el worker existente con sólo sus secretos y espera su salud antes de habilitar la web. CI incluye Redis fijado por digest, pruebas HTTP de Nest, lint, esquema de la aplicación y comprobación del worker.
7. `.env.example`: se documentan las variables realmente obligatorias. PostgreSQL usa conexión directa o pool de sesión; la plantilla anterior proponía pool transaccional que el runtime rechaza.
8. Analizador de rutas: reconoce alias locales `const` como el de responsables de propuestas. Sigue rechazando destinos mutables o no resueltos y no toma declaraciones de funciones ajenas. Una prueba específica evita que la corrección oculte conexiones desconocidas.

## Límites y pendientes que impiden afirmar «todo funciona»

- Docker CLI está instalado, pero el daemon Linux no estaba conectado. El Compose corregido pasó controles estáticos y `docker compose ... config --no-interpolate --quiet`; no se construyó ni arrancó físicamente en esta revisión.
- PostgreSQL 17 está instalado en `C:/Program Files/PostgreSQL/17`. Se informó al agente coordinador para crear un cluster desechable y ejecutar las integraciones; ese resultado corresponde al informe principal.
- Las pruebas de atomicidad detectaron la migración histórica `20260909320000_transition_handover_reports` sin transacción explícita. No se cambió su checksum ni se alteró una base existente. Se requiere revisar el historial real antes de decidir la corrección del mecanismo de migración.
- El estado publicado puede corresponder a otra revisión. La captura aportada por la usuaria y el código local no prueban por sí solos que esa revisión esté desplegada.
- Falta cerrar el recorrido con una organización sintética: crear → leer de nuevo → editar → verificar auditoría → confirmar ausencia en otro tenant. Storage debe incluir bytes reales por URL firmada y verificación del worker. Enviar correos, invitaciones, mensajes, pagos o exportaciones con datos reales requiere el flujo autorizado del entorno, no fixtures.

## Referencias de producto, consultadas en fuentes de los proveedores

No se encontró en estas fuentes un ranking independiente que permita llamarlos «los más usados en Colombia». Se usaron como referencias concretas de utilidad, sin recomendar compra ni introducir sus SDK.

| Referencia | Práctica documentada | Aplicación útil en Política Sostenible |
|---|---|---|
| [HubSpot: CRM para responsables comerciales](https://www.hubspot.es/products/crm/crm-for-account-executives) | Seguimiento vinculado a contactos y oportunidades, con fecha y prioridad | Una tarea debe tener responsable, vencimiento, estado y enlace al registro de origen; el resumen debe abrir el trabajo pendiente |
| [Zoho CRM: gestión de cuentas](https://www.zoho.com/es-xl/crm/account-management.html) | Vista conjunta de contactos, actividad reciente y trabajo pendiente | Una ficha y su historial deben reducir duplicación; las secciones deben reutilizar registros, no mantener listas incompatibles |
| [Zoho CRM: notas](https://www.zoho.com/es-xl/crm/notes.html) | Notas con contexto de actividad que permiten retomar una gestión | Conservar resultado, fecha y responsable, evitando botones que sólo muestran confirmación visual |
| [Siigo: valoración de inventarios](https://siigonube.portaldeclientes.siigo.com/generar-informe-valoracion-de-inventarios/) | Reporte con fecha de corte, filtros por producto/categoría y exportación | Finanzas e inventario necesitan corte visible, filtros reproducibles, detalle de movimientos y exportación verificable |

La prioridad recomendada es completar los flujos ya presentes: persona autorizada → actividad o compromiso → responsable → resultado verificable; movimiento financiero o de inventario → soporte → revisión → reporte. Un indicador debe poder explicar su numerador, denominador, corte y fuente; un estado vacío debe conducir a una acción permitida. Funciones nuevas deben resolver un trabajo identificado, no aumentar el menú.
