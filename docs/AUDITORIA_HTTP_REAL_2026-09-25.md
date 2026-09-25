# Integración HTTP real local — 25/09/2026

Resultado: **25 pruebas aprobadas de 25; proceso finalizado con código 0**. Última ejecución completa: 10,6 segundos incluyendo compilación TypeScript/carga del grafo Nest. Registro: `.artifacts/api-http-integration-20260925.log`.

## Qué conecta la prueba

`apps/api/test/app-http.integration.ts` arranca el `AppModule` real con `TestingModule.createNestApplication()` y `app.init()`. Supertest realiza peticiones HTTP contra Nest. PostgreSQL 16 y Redis 7.4 son servicios locales reales; se utiliza `PrismaService`, bcrypt, JWT, todos los guards, DTO/ValidationPipe, interceptor y filtro de excepciones reales. No se sustituye ningún proveedor ni se usa `jest.mock`.

El runner usa Node 22 + `node:test` + `ts-node/register`, evitando el aislamiento CommonJS de Jest que no puede cargar la dependencia ESM de otplib. La biblioteca otplib real se carga correctamente; **no se ejecutó MFA** y no se acredita su funcionamiento con esta suite.

Se establece `NODE_ENV=development` porque `test` desactiva los proveedores BullMQ en este proyecto. La configuración mantiene Redis real y los productores BullMQ reales; esta suite no acredita procesamiento de trabajos por un worker ni envío de archivos.

## Cobertura comprobada

- Login con contraseña bcrypt real y JWT firmado; identidad y tenant leídos por `/auth/me`. Contraseña incorrecta, JWT ausente y firma inválida devuelven 401. Logout incrementa/revoca la sesión y el JWT anterior recibe 401.
- `/operation-profile/readiness` consulta la base y devuelve `BLOCKED`, etapa nula y bloqueo `PROFILE_CONFIGURED` para una organización sin perfil. `/command-center/briefing` contiene la organización correcta, sin datos de la segunda.
- Tarea: creación HTTP, consulta HTTP, lectura SQL, modificación, cancelación y nueva lectura HTTP/SQL. Otra organización no puede verla por filtro ni modificarla. La API usa cancelación; no se inventó un endpoint de eliminación.
- Evento: creación de borrador, consulta, modificación y eliminación HTTP; lecturas SQL verifican cambios y desaparición. La segunda organización recibe 404 al consultar, modificar o eliminar el recurso ajeno.
- Líder territorial: creación, listado, modificación y eliminación con lecturas posteriores HTTP/SQL. La segunda organización recibe 404 al consultar o escribir en la división ajena.
- DTO: rechaza `tenantId` enviado en body y un enum inválido con 400, sin crear registros.
- Auditoría: las operaciones quedan persistidas y son visibles por el endpoint de auditoría de la organización. Redis contiene contadores reales del limitador.

Además se verificaron **22 consultas de módulos** con contenido esperado, no únicamente un código HTTP:

| Consultas | Evidencia exigida |
|---|---|
| Invitaciones, tareas, eventos, propuestas, compromisos, casos, aprobaciones de comunicación, personas | `items=[]`, total de paginación 0 |
| Finanzas, releases de catálogo, ingestas de catálogo | Colección vacía real |
| Cierre financiero, firmas, calendario electoral, escrutinio, E-14, jornada | 409 y razón concreta de perfil/etapa faltante |
| Equipo | Un único administrador propio; usuario del otro tenant ausente |
| Bandeja operativa | Elementos vacíos y total 0 |
| Retención | Perfil nulo, solicitudes y retenciones vacías |
| Aviso de privacidad | `configured=false`, aviso nulo |
| Resumen financiero | Ingresos y gastos 0; límites sin configurar |

## Hallazgo corregido mediante la integración

Nest cerraba Prisma pero conservaba aproximadamente 30 segundos los sockets PostgreSQL del pool externo. La implementación instalada de `@prisma/adapter-pg` 7.9.1 muestra que `disposeExternalPool` vale `false` por defecto y `dispose()` solamente retira un listener del pool externo en ese caso.

`PrismaService` ahora declara `disposeExternalPool: true`, porque Nest crea y posee ese pool. La suite asigna un `PGAPPNAME` aleatorio, verifica que la conexión lo usa y, después de `app.close()`, consulta `pg_stat_activity` desde una conexión observadora independiente. Exige **0 conexiones propias inmediatamente**. No usa `forceExit`, ni termina manualmente el pool de Prisma desde el harness. La duración pasó de aproximadamente 43 segundos a 10–12 segundos.

Pruebas unitarias de Prisma: 9/9 aprobadas. ESLint de la nueva suite y PrismaService: 0 errores/advertencias. Typecheck independiente: `node node_modules/typescript/bin/tsc -p test/tsconfig.http-integration.json`. Sintaxis Node del runner verificada.

## Aislamiento y restos deliberadamente conservados

El runner requiere URLs explícitas; no toma DATABASE_URL heredada como respaldo. Permite únicamente loopback y una de estas parejas: rol `audit_local` con base prefijada `politica_audit_`/`http_audit_`, o rol `politica_test` con base exacta `politica_sostenible_test`. El schema es `politica-sostenible`; Redis usa exclusivamente su base lógica 14. Cuatro pruebas negativas del runner verifican estos límites.

El proceso hijo recibe una lista acotada de variables y secretos sintéticos aleatorios, utiliza un directorio temporal vacío y no carga archivos `.env` del repositorio. Storage apunta al dominio reservado `.invalid`; ninguna prueba solicita subida, descarga ni servicio externo. El proceso tiene un timeout de 120 segundos para fallar si deja de responder.

Se crean dos organizaciones con prefijo `http_audit_` y metadatos de prueba, sin datos personales reales. La limpieza verifica pertenencia al prefijo de esta ejecución, elimina solamente sus tareas/eventos/líderes, desactiva sus usuarios y revoca sus sesiones. **Conserva tenants, divisiones, usuarios desactivados y las 10 filas de auditoría inmutables de cada ejecución exitosa**; no intenta vencer los triggers de inmutabilidad ni tocar datos ajenos. Redis conserva las claves que existían antes y elimina solo las nuevas del entorno de prueba. El directorio temporal se elimina únicamente si está vacío y coincide con su directorio padre/prefijo esperado.

## Invocación reproducible

Después de aplicar todas las migraciones a la base local desechable:

```powershell
$env:HTTP_INTEGRATION_DATABASE_URL='postgresql://audit_local@127.0.0.1:55440/politica_audit_integrated_20260925?schema=politica-sostenible'
$env:HTTP_INTEGRATION_REDIS_URL='redis://127.0.0.1:56380/14'
node apps/api/test/run-http-integration.mjs
node --test apps/api/test/run-http-integration-guard.test.mjs
```

En CI puede usarse la pareja existente `politica_test` / `politica_sostenible_test` con su contraseña sintética y puertos locales; el script `test:http-integration` ya existe en `apps/api/package.json`. La configuración de CI corresponde al agente principal.

Límites: esta suite acredita integración HTTP y persistencia local de los flujos descritos. No navega por la interfaz, no visita producción, no acredita MFA, pagos, entrega de comunicaciones, almacenamiento externo, sincronización offline ni procesamiento completo de BullMQ.

## Flujo real adicional: Storage, integridad y catálogo — 8/8

El 25/09/2026 se completó una segunda prueba independiente, `deploy/staging/test-storage-workflow.mjs`: **8 comprobaciones aprobadas, código de salida 0**, en aproximadamente 7 segundos. Evidencia: `.artifacts/staging/storage-workflow.log`. Esta prueba sí utiliza el API Nest construido en modo `production` con perfil aislado `evaluation`, PostgreSQL 16, Redis 7.4, dos consumidores reales BullMQ y Supabase Storage 1.74.0 con persistencia local. No sustituye Prisma, guards, Storage ni workers.

| Comprobación | Resultado comprobado |
|---|---|
| Identidad y dependencias | Proyecto Compose `politica-local-staging`, base/rol `politica_staging`, esquema `politica-staging`, perfiles y URLs locales exactos; API/worker comparten el espacio de red del gateway; `/health/dependencies` responde correctamente; bucket privado |
| Dos organizaciones | Registro de dos cuentas ficticias mediante DTO real, contraseña y JWT reales, lectura de identidad propia; petición de subida sin sesión rechazada con 401 |
| Evidencia financiera válida | Nest emite autorización; `OPTIONS` admite los encabezados reales del SDK, incluido `x-metadata`; bytes enviados por `PUT` directamente a Storage; confirmación HTTP persiste el objeto; worker calcula SHA-256 y devuelve `VERIFIED`, fecha válida y ningún error |
| Aislamiento del archivo | Tenant B recibe 404 al consultar integridad del objeto de A y 403 al confirmar su ruta; lectura anónima de Storage rechazada |
| Hash incorrecto | Otro objeto lleva una huella declarada falsa tanto en autorización como en metadatos de Storage; el worker lee los bytes y lo marca `FAILED` con `SHA256_MISMATCH`, demostrando verificación independiente |
| Catálogo en segundo plano | JSON sintético mínimo confirmado e ingesta encolada; worker descarga y verifica hash, produce `SUCCEEDED`; lectura HTTP muestra release `STAGED`, SHA-256 correcto y exactamente departamento, municipio, zona y puesto; repetir el mismo `clientRequestId` devuelve el mismo trabajo, sin duplicarlo |
| Aislamiento del catálogo | Tenant B recibe 404 para trabajo y release ajenos y listas vacías; tenant A conserva cero releases `ACTIVE` |
| Cierre de sesión | Logout de ambas cuentas; los dos JWT anteriores reciben 401 en una lectura posterior |

El catálogo tiene un contrato distinto de la evidencia financiera: `/storage/upload-url` no admite `contentSha256` para `electoral-catalog`; su confirmación declara `NOT_PROVIDED`. El hash esperado se envía a `/electoral-catalog/imports` y se verifica en el worker de ingesta, antes de producir el release. La prueba respeta este contrato; no rebaja una guarda ni declara `VERIFIED` para ese objeto de Storage.

La fixture de catálogo **no contiene datos oficiales**. Los nombres, dirección y coordenadas son deliberadamente sintéticos. La URL de Registraduría satisface únicamente el formato del campo de procedencia exigido por el DTO y está marcada como prueba sintética; nunca se consultó ni se presentó como fuente de esos bytes. Los campos de conjunto, autorización y licencia también dicen explícitamente que es una prueba local. El release no se validó ni activó, y no sirve para una operación electoral.

### Reproducción y conservación de fixtures

Con el stack local saludable y sin otra prueba usando las mismas cuentas, ejecutar desde la raíz del repositorio:

```powershell
$env:RUN_LOCAL_STAGING_STORAGE_WORKFLOW='true'
node deploy/staging/test-storage-workflow.mjs 2>&1 | Tee-Object -FilePath .artifacts/staging/storage-workflow.log
```

El script requiere ese opt-in, inspecciona los contenedores antes de cualquier registro y usa exclusivamente el motor WSL `CodexPoliticaAudit20260925`, socket `unix:///run/politica-audit-docker.sock`. Lee `.artifacts/staging/.env.local` sin mostrar valores. Los destinos están fijados a `127.0.0.1:5401` y `127.0.0.1:5800`; los puertos remotos, perfiles productivos y otras bases no son configurables mediante fallback. Cada petición y espera del worker tiene tiempo máximo.

Las dos cuentas reutilizables se guardan en `.artifacts/staging/storage-workflow-fixture.json`, excluido de Git, y se identifican con prefijo `storage_workflow_`. **Ese archivo contiene contraseñas sintéticas locales: no publicarlo, adjuntarlo ni copiarlo a producción.** Reutilizar las cuentas evita agotar la cuota de registro; cada ejecución crea objetos nuevos y revoca sus sesiones al terminar. No ejecutar el harness simultáneamente con una prueba de interfaz que use A o B, porque el logout revoca también otras sesiones de esa cuenta.

La ejecución exitosa subió tres objetos y creó un catálogo. La lectura SQL posterior del entorno aislado confirmó los restos acumulados de la preparación y del intento exitoso: **3 tenants sintéticos** (A, B y uno creado antes de corregir una aserción del harness), **5 objetos** (2 financieros `VERIFIED`, 2 financieros `FAILED` por hash falso y 1 catálogo `CONSUMED` con integridad de Storage `NOT_PROVIDED`) y **1 release `STAGED`**. Se conservan las filas de auditoría y los archivos de prueba; no se borraron triggers, evidencia inmutable, volúmenes ni datos ajenos. Los contadores `objects=3` del log se refieren a la ejecución exitosa, no al acumulado del entorno.

Los problemas previos al resultado final fueron del harness/configuración local: ajuste de la envoltura real `statusCode/data`, IDs `cuid()`, contrato de hash del catálogo, CORS de `x-metadata` y reinicio coordinado del gateway/API/worker. La sección de reinicios de `deploy/staging/README.md` documenta el cambio de espacio de red observado. El resultado final se obtuvo después de resolverlos.

Límites de esta prueba adicional: acredita la cadena API → Storage privado → Redis/BullMQ → PostgreSQL en el entorno aislado descrito. No acredita navegación por navegador, selección nativa de archivos, importación de un catálogo oficial, activación con aprobación independiente, carga grande, concurrencia intensiva, recuperación ante caída, MFA, pagos, envío de comunicaciones ni funcionamiento de producción. Tampoco afirma haber creado o descargado un asiento financiero: la prueba financiera llega a evidencia confirmada y verificada; el smoke separado `verify-storage.mjs` acredita descarga firmada con hash de un objeto propio.
