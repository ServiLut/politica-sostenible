# Evaluación local aislada

Esta configuración inicia la aplicación real y servicios locales para pruebas con **datos sintéticos exclusivamente**. No es un despliegue público ni un artefacto que se pueda promover directamente a producción. Reutiliza los Dockerfiles de NestJS y Next.js y el migrador del repositorio.

## Componentes y aislamiento

| Servicio | Uso | Acceso desde el equipo |
| --- | --- | --- |
| `web` | Next.js, construido con perfil `evaluation` | `http://127.0.0.1:5310` |
| `api` | NestJS, Prisma, reglas de negocio y JWT propios | `http://127.0.0.1:5401` |
| `catalog-worker` | BullMQ real para el catálogo electoral | Sin puerto público |
| `app-db` | PostgreSQL 16 de la aplicación; base `politica_staging`, esquema `politica-staging` | Sin puerto publicado |
| `redis` | Redis 7.4 con contraseña efímera y volumen propio | Sin puerto publicado |
| `storage` | Supabase Storage 1.74.0, backend de archivos local | Solo a través del gateway local |
| `storage-db` | PostgreSQL 16 exclusivo para metadatos internos de Storage | Sin puerto publicado |
| `storage-gateway` | Node HTTP nativo, streaming de `/storage/v1/*`, CORS local | `http://127.0.0.1:5800` |
| `migrate`, `storage-init` | Migraciones canónicas y creación/verificación del bucket privado | Procesos de una sola ejecución |

No se instala Supabase Auth, PostgREST, Studio, Realtime ni una base Supabase para datos de la aplicación. Storage utiliza su propio PostgreSQL interno para metadatos y roles; las tablas operativas de la aplicación permanecen exclusivamente en `app-db`, administradas por NestJS/Prisma. El gateway no autentica por su cuenta: conserva la autorización y las firmas que valida Storage real. No procesa lógica de negocio, no almacena archivos y transmite el flujo sin acumularlo en memoria.

La red `default` es interna y contiene bases de datos, Redis y Storage. La red `frontend` permite publicar los tres puertos en **127.0.0.1 solamente**. La web está únicamente en `frontend`. API y worker comparten el espacio de red del gateway para que `http://127.0.0.1:5800` sea alcanzable tanto por NestJS como por el navegador, sin reescribir las URLs firmadas. Estos tres procesos tienen salida de red por `frontend`; no se han configurado integraciones externas, correo, pagos, Sentry ni datos reales. No ejecutar importaciones o integraciones reales durante esta evaluación.

Todos los volúmenes y redes llevan el prefijo Compose `politica-local-staging`; no se reutilizan volúmenes externos. Las imágenes de PostgreSQL, Redis, Node y Storage están fijadas por digest. El bucket `politica-local-staging-private` no permite lectura pública ni escritura anónima. CORS autoriza únicamente `http://127.0.0.1:5310`.

## Preparación y arranque

Requisitos: Node.js 22, dependencias pnpm del repositorio instaladas y un motor Docker local con Compose. Ejecutar los comandos desde la raíz del repositorio. No cargar `.env` de producción ni copiar sus valores.

```sh
node deploy/staging/create-environment.mjs
docker compose --env-file .artifacts/staging/.env.local -f deploy/staging/compose.yml config --quiet
node --test deploy/staging/staging.test.mjs
docker compose --env-file .artifacts/staging/.env.local -f deploy/staging/compose.yml up -d --build
docker compose --env-file .artifacts/staging/.env.local -f deploy/staging/compose.yml ps
```

El generador utiliza `crypto.randomBytes` para contraseñas independientes de las dos bases, Redis, JWT de la aplicación, JWT de Storage, consentimiento, sincronización offline y cifrado MFA. No imprime secretos y rechaza sobrescribir un archivo existente. `.artifacts/staging/.env.local` está excluido del contexto Docker por `.dockerignore`; no se debe publicar ni adjuntar a un informe. En POSIX se crea con modo 0600; en Windows conviene conservarlo en el perfil privado del usuario. `APP_REVISION=unknown` es intencional para un árbol de trabajo local sin commit de release.

Los JWT locales de Storage caducan en 30 días. Conservar el archivo de entorno junto con sus volúmenes mientras se use esta instalación; no regenerarlo sobre volúmenes existentes porque cambiaría las contraseñas. Para una nueva evaluación tras caducidad, usar una instalación vacía y credenciales nuevas o realizar una rotación explícita coordinada. No reutilizar estas claves en producción.

`PUBLIC_REGISTRATION_ENABLED=true` sirve para crear organizaciones sintéticas mediante el registro real. `SAAS_ADMIN_DISABLED=true` mantiene desactivada la administración global hasta que un responsable defina un usuario sintético con los permisos necesarios. No hay una cuenta ni contraseña universal precreada. El frontend recibe únicamente la clave anónima; la clave de servicio se entrega a NestJS/worker y al inicializador de Storage.

El perfil local requiere `DEPLOYMENT_PROFILE=evaluation` y `ALLOW_LOCAL_STAGING_BUILD=true`; los validadores solo permiten la excepción HTTP en loopback. Para producción se debe reconstruir el artefacto sin esta excepción, con HTTPS y sus controles normales. Esta configuración no modifica `compose.production.yml`.

## Docker aislado usado durante la auditoría en Windows

Se utilizó la distribución WSL propia `CodexPoliticaAudit20260925`, con socket `unix:///run/politica-audit-docker.sock` y directorio de datos propio `/var/lib/politica-audit-docker`. No se reparó ni reconfiguró Docker Desktop. Mientras ese daemon esté activo, el equivalente para consultar los servicios es:

```powershell
wsl -d CodexPoliticaAudit20260925 -- docker -H unix:///run/politica-audit-docker.sock compose --env-file /mnt/c/Users/user/Documents/politica-sostenible/.artifacts/staging/.env.local -f /mnt/c/Users/user/Documents/politica-sostenible/deploy/staging/compose.yml ps
```

Los demás comandos Compose usan el mismo prefijo y rutas. El reenvío local WSL hacia Windows puede tardar unos segundos tras publicar un puerto; comprobar primero el servicio dentro de WSL. No cambiar el enlace de puertos a `0.0.0.0` para resolver esa espera.

Después de reiniciar Windows, comprobar primero si el motor propio responde:

```powershell
wsl -d CodexPoliticaAudit20260925 -- docker -H unix:///run/politica-audit-docker.sock info --format '{{.ServerVersion}}'
```

Sólo si ese socket no está disponible y no existe otro `dockerd` usando ese directorio, iniciar el motor propio en una terminal y mantenerla abierta:

```powershell
wsl -d CodexPoliticaAudit20260925 -- dockerd --host=unix:///run/politica-audit-docker.sock --data-root=/var/lib/politica-audit-docker --pidfile=/run/politica-audit-docker.pid
```

En otra terminal ejecutar el comando Compose anterior sustituyendo `ps` por `up -d --no-build`, y después comprobar salud real. No usar `wsl --shutdown`, borrar el directorio de datos ni restablecer Docker Desktop para arrancar esta evaluación. Las credenciales de la cuenta sintética A utilizada en las comprobaciones están en `.artifacts/staging/ACCESO_LOCAL.md`, excluido de Git; nunca son una cuenta de producción.

## Reinicio coordinado del gateway, API y worker

Antes de reiniciar, esperar a que terminen las cargas y las pruebas activas. API y `catalog-worker` usan `network_mode: service:storage-gateway`. Se comprobó que **reiniciar el gateway cambia su espacio de red incluso si conserva el mismo ID de contenedor**. API y worker pueden permanecer en el espacio anterior; Docker puede seguir mostrando un `healthy` anterior mientras el puerto de la API falla o devuelve un cierre de conexión.

Para aplicar un cambio al archivo del gateway montado desde el repositorio, reiniciar en este orden, sin borrar volúmenes:

```sh
docker compose --env-file .artifacts/staging/.env.local -f deploy/staging/compose.yml restart storage-gateway
docker compose --env-file .artifacts/staging/.env.local -f deploy/staging/compose.yml restart api catalog-worker
```

En la instalación WSL utilizar el prefijo `wsl -d CodexPoliticaAudit20260925 -- docker -H unix:///run/politica-audit-docker.sock` y las rutas absolutas de la sección anterior para **ambos** comandos. Si el gateway se recreó en vez de reiniciarse y cambió su ID, recrear también API y worker mediante `up -d --no-deps --force-recreate api catalog-worker` con el mismo proyecto y archivo de entorno.

Después del reinicio, las tres lecturas siguientes deben devolver el mismo `net:[identificador]`. Son comprobaciones de solo lectura:

```sh
docker compose --env-file .artifacts/staging/.env.local -f deploy/staging/compose.yml exec -T storage-gateway readlink /proc/self/ns/net
docker compose --env-file .artifacts/staging/.env.local -f deploy/staging/compose.yml exec -T api readlink /proc/self/ns/net
docker compose --env-file .artifacts/staging/.env.local -f deploy/staging/compose.yml exec -T catalog-worker readlink /proc/self/ns/net
```

Esperar al arranque y comprobar respuestas nuevas desde el equipo donde se usa el navegador. No dar por recuperado el entorno basándose solamente en `docker compose ps`:

```sh
curl --fail --show-error --max-time 10 http://127.0.0.1:5800/storage/v1/status
curl --fail --show-error --max-time 10 http://127.0.0.1:5401/health/ready
curl --fail --show-error --max-time 10 http://127.0.0.1:5401/health/dependencies
curl --fail --show-error --max-time 10 http://127.0.0.1:5310/api/health/ready
docker compose --env-file .artifacts/staging/.env.local -f deploy/staging/compose.yml exec -T catalog-worker node ../../deploy/catalog-worker-healthcheck.mjs
```

`/health/dependencies` incluye la comprobación del bucket de Storage además de la preparación de la API. Si falla alguna respuesta o difieren los espacios de red, mantener detenidas las pruebas de negocio hasta corregir el reinicio. Estas lecturas no suben archivos ni crean registros. La prueba sintética de carga de la siguiente sección se ejecuta únicamente después de recuperar estas comprobaciones.

## Verificación real

```sh
curl --fail http://127.0.0.1:5800/storage/v1/status
curl --fail http://127.0.0.1:5401/health/ready
curl --fail http://127.0.0.1:5310/api/health/ready
node deploy/staging/verify-storage.mjs
```

`verify-storage.mjs` usa el SDK de Supabase ya instalado en la API. Verifica bucket privado, rechazo de escritura y lectura anónimas, creación de URL firmada, `PUT` directo con CORS, descarga firmada y SHA-256 idéntico. Borra únicamente el objeto sintético UUID que creó en esa ejecución. Un `/status` HTTP 200 por sí solo no prueba estos permisos ni la integridad del archivo.

Para comprobar además el flujo completo de negocio con Nest, sesión JWT, confirmación persistida, consumidores BullMQ y aislamiento entre organizaciones:

```powershell
$env:RUN_LOCAL_STAGING_STORAGE_WORKFLOW='true'
node deploy/staging/test-storage-workflow.mjs 2>&1 | Tee-Object -FilePath .artifacts/staging/storage-workflow.log
```

El harness `test-storage-workflow.mjs` **solo usa el motor propio de esta auditoría**: en Windows invoca WSL `CodexPoliticaAudit20260925` con socket `unix:///run/politica-audit-docker.sock`; dentro de Linux usa ese mismo socket. No usa el contexto Docker Desktop. Exige el opt-in anterior y comprueba proyecto Compose, perfiles `evaluation`, base/rol/esquema locales, URLs loopback fijas, bucket privado, salud actual y espacios de red coincidentes. No debe ejecutarse en un motor distinto cambiando el contexto ni apuntarse a producción.

Resultado del 25/09/2026: **8/8 comprobaciones reales aprobadas, salida 0**. Comprueba login de A/B, autorización firmada, `OPTIONS` con encabezados reales del SDK, `PUT` directo, confirmación del archivo, hash válido verificado por worker y hash falso rechazado. La segunda organización no puede consultar ni confirmar evidencia ajena. Además importa un JSON deliberadamente sintético de cuatro entradas mediante el worker de catálogo, consulta el release `STAGED` y su hash, verifica idempotencia y aislamiento, y revoca ambas sesiones. No activa el catálogo ni atribuye esos bytes a una fuente oficial. El contrato de catálogo verifica SHA-256 durante la ingesta; su objeto de Storage conserva `NOT_PROVIDED`.

El script lee el entorno local sin imprimir secretos y mantiene credenciales de prueba reutilizables en `.artifacts/staging/storage-workflow-fixture.json`, excluido de Git. **No publicar ese archivo ni ejecutarlo mientras alguien usa las cuentas A/B en el navegador**: el logout invalida todas sus sesiones. No borra fixtures ni auditoría al terminar. La ejecución exitosa genera tres objetos y un release; los intentos de preparación dejaron un acumulado comprobado de tres tenants sintéticos, cinco objetos y un release `STAGED`. Los detalles, límites y comprobaciones se encuentran en `docs/AUDITORIA_HTTP_REAL_2026-09-25.md`, apartado «Flujo real adicional». El log `storage-workflow.log` no contiene secretos.

`staging.test.mjs` prueba generación de claves y vencimiento, rechazo de sobrescritura, gateway con transmisión real de 512 KiB y restricciones de origen/ruta, y el modelo Compose resuelto: puertos loopback, separación de bases, imágenes fijadas, redes y ausencia de secretos backend en Next.js. También ejecuta el SDK Supabase instalado con bytes y con un `File`: comprueba el `OPTIONS` de sus encabezados exactos, incluido `x-metadata` para bytes, y los metadatos multipart del archivo. Los encabezados desconocidos siguen rechazados. Solo ejecuta `docker compose config`, sin arrancar contenedores. En un sistema sin `docker` en PATH se puede definir `STAGING_TEST_DOCKER` con la ruta del CLI.

Para detener sin perder evidencia ni datos sintéticos:

```sh
docker compose --env-file .artifacts/staging/.env.local -f deploy/staging/compose.yml stop
```

No usar `down -v` sobre un proyecto cuya evidencia deba preservarse. No hay una tarea de borrado automático de volúmenes ni una acción sobre servicios de producción.

## Fuentes y estado comprobado

- [Configuración oficial de Storage 1.74.0](https://github.com/supabase/storage/blob/v1.74.0/src/config.ts): backend `file`, `DB_INSTALL_ROLES`, URL de base interna y desactivación de transformaciones/S3.
- [Ejemplo independiente oficial](https://github.com/supabase/storage/blob/v1.74.0/docker-compose.yml): Storage puede instalar sus propios roles sobre PostgreSQL; no necesita un servicio Auth para este uso.
- [Rutas oficiales](https://github.com/supabase/storage/blob/v1.74.0/src/app.ts): rutas `bucket`, `object` y estado; el gateway adapta el prefijo que utiliza `supabase-js` y aplica CORS.
- [Documentación oficial de autoalojamiento](https://supabase.com/docs/guides/self-hosting/storage/config). Se priorizó el código de la versión fijada ante nombres de variables antiguos de esta página.

El 25/09/2026 se construyeron y arrancaron web, API y worker junto con PostgreSQL 16, Redis 7.4, Storage 1.74.0 y gateway. Las 44 migraciones y sus postcondiciones pasaron. La prueba de Storage desde Windows pasó y eliminó su objeto propio; el flujo integrado API → Storage → worker → PostgreSQL aprobó 8/8 comprobaciones y conservó únicamente fixtures sintéticos locales. En navegador se verificaron sesión, perfil, mapa, creación y cierre de tarea con recarga, y catálogo procesado en revisión. Evidencia sin secretos: `.artifacts/staging/unit.log`, `.artifacts/staging/storage-smoke.log`, `.artifacts/staging/storage-workflow.log` y [auditoría funcional](../../docs/AUDITORIA_FUNCIONAL_2026-09-25.md). Los resultados acreditan estos recorridos concretos, no certifican automáticamente todas las operaciones del producto ni producción.
