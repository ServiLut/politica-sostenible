# Preparación del acceso de ejecución a PostgreSQL

**Estado: preparado, no provisionado. TLS obligatorio pendiente.** Este procedimiento no aplica cambios a producción ni modifica el usuario actual. No acredita capacidad comercial, aislamiento completo por RLS ni una conexión cifrada. La autenticación y el filtrado por organización siguen siendo responsabilidad de NestJS.

Antes de utilizar este procedimiento, el operador debe verificar la identidad exacta de la base, los privilegios efectivos del usuario de ejecución, la separación de la identidad de migración y el transporte TLS disponible. Las observaciones de una instalación, los manifiestos concretos y las evidencias operativas se conservan fuera del repositorio público y nunca contienen credenciales.

Cambiar únicamente las variables del cliente no habilita TLS en el servidor. La preparación comercial requiere transporte verificado y privilegios mínimos; el procedimiento no modifica automáticamente ninguna instalación ni convierte un perfil de evaluación en producción comercial.

## Control de arranque en NestJS

`PrismaService` consulta sólo catálogos PostgreSQL al iniciar en `NODE_ENV=production`, salvo el perfil explícito `DEPLOYMENT_PROFILE=evaluation`. Exige esquema explícito y activo coincidente; rechaza superusuario, BYPASSRLS, creación de roles/bases, replicación, propiedad de base/esquema/relaciones, CREATE sobre esquemas y membresías privilegiadas, incluso con NOINHERIT. También rechaza permisos efectivos de tablas, columnas y secuencias fuera del esquema, incluidos los obtenidos mediante un rol lector sin atributos elevados, y funciones SECURITY DEFINER ejecutables que requieren revisión. Si falla, no anuncia conexión lista y cierra su pool. No registra nombres de roles, URL, contenido de tablas ni inventarios de otras aplicaciones en el mensaje del control.

Este control complementa TLS, permisos por tabla y aislamiento multitenant; no los sustituye. Un catálogo inaccesible, un resultado incompleto o un esquema distinto bloquean el perfil comercial. Las pruebas `runtime-database-role-postgres.integration.spec.ts` entran en el paso PostgreSQL existente de CI mediante `TEST_DATABASE_URL`, sin un nuevo secreto ni cambios de workflow adicionales.

Para transporte comercial, el validador de despliegue exige un único `sslmode=verify-full` tanto en `DATABASE_URL` como en `DIRECT_URL`. Rechaza opciones TLS repetidas, nombres alternativos, `ssl`, `uselibpqcompat`, negociación y rutas de certificados dentro de la URL. El adaptador Nest también valida antes de construir el pool; elimina exclusivamente el modo canónico permitido para que `pg` conserve el objeto explícito `rejectUnauthorized: true`. El migrador usa la misma protección para sus dos clientes `pg`.

El motor nativo Prisma 7.9.1 tiene un contrato diferente: la contraprueba física local demostró que `verify-full` permite una conexión sin TLS. Después de validar la configuración externa, el migrador transforma únicamente las URLs del proceso hijo a `sslmode=require&sslaccept=strict`, el contrato nativo que exige cifrado y verificación. Las URLs externas del operador permanecen sin cambios. La regresión nativa ejecuta sólo `SELECT 1`: demuestra un control accesible sin TLS y el rechazo P1011 del hijo comercial contra esa misma QA. Esto no acredita una negociación positiva con certificado válido, ni demuestra TLS en producción. Los certificados y CA deben configurarse y verificarse en los almacenes de confianza de cada motor antes de activar el perfil comercial; no se presupone que la configuración CA de Node sea también utilizada por el motor nativo.

## Qué prepara el helper

`deploy/prepare-runtime-db-role.mjs` sólo lee el manifiesto y `schema.prisma`, y escribe un paquete SQL para revisión. No abre conexiones, ejecuta SQL, consulta variables secretas ni genera contraseñas. Rechaza campos adicionales, URLs, nombres ambiguos, huellas incompletas, roles preexistentes al ejecutar SQL y cambios en el inventario esperado de 120 modelos. Una nueva tabla requiere revisar nuevamente el contrato.

El manifiesto debe indicar exactamente `database`, `schema`, `fingerprint` de 64 caracteres hexadecimales, `schemaVersion`, `runtimeRole` nuevo con prefijo `ps_runtime_`, y `migrationRole` distinto. No se deduce el esquema a partir de `public`, del nombre del programa o de una URL. Se exige el marcador final `20261016213000_schema_contract_marker`: **el paquete sólo puede ejecutarse en una base que ya haya alcanzado ese marcador mediante el procedimiento de migración autorizado**.

Con un manifiesto revisado y un directorio de salida nuevo:

```sh
node deploy/prepare-runtime-db-role.mjs --manifest ruta/al/manifest.json --output-dir ruta/al/paquete-nuevo
```

El paquete contiene `runtime-role.sql`, `rollback-unused-role.sql`, `prisma-inventory.json` y `status.json`. Su estado permanece `PREPARED_NOT_EXECUTED` y `TLS_REQUIRED_PENDING`. El SQL de creación valida base, ejecutor, esquema, las 120 tablas, el historial de migraciones, huella y marcador antes de crear el rol dentro de una transacción. Usa esperas acotadas y bloqueos de lectura para estabilizar el inventario.

El nuevo rol es `NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`. Recibe `CONNECT` sobre la base exacta, `USAGE` sobre el esquema exacto y permisos explícitos por tabla: CRUD en 119 tablas, únicamente `SELECT` en `SystemDatabaseIdentity`. No recibe `TRUNCATE`, DDL, propiedad de objetos, membresías, permisos por defecto ni `ALL TABLES`. El esquema actual no usa columnas `autoincrement`; no se conceden secuencias. Si el inventario incorporara una, el helper sólo resuelve su secuencia mediante la dependencia de propiedad de esa columna, concede USAGE/SELECT y aborta si UPDATE está heredado, incluso en una secuencia propia.

El inspector de arranque compara el historial con ambas identidades. Para permitir esa comprobación, `_prisma_migrations` es una excepción explícita de metadatos, separada de los 120 modelos: recibe únicamente `SELECT` de `migration_name`, `checksum`, `finished_at`, `rolled_back_at`, `applied_steps_count` y `started_at`. No se concede lectura de tabla completa, `id`, `logs` ni columnas futuras; tampoco escritura o `REFERENCES`. El postcontrol exige exactamente esas seis lecturas y aborta si `PUBLIC` aporta permisos adicionales. La reversión revoca esa misma lista. La regresión PostgreSQL invoca el inspector real con el rol limitado y comprueba que logs, lecturas completas y escrituras se rechazan.

`NOINHERIT` no elimina los permisos de `PUBLIC`. El SQL aborta ante derechos heredados de creación de esquemas, acceso a tablas o secuencias fuera del inventario, escritura en la identidad o funciones `SECURITY DEFINER` ejecutables que necesitan revisión independiente. No revoca permisos de `PUBLIC` ni de otros programas. Los privilegios generales de `PUBLIC`, como `TEMPORARY` o conexión a otras bases, requieren inventario separado: PostgreSQL no dispone de un veto por rol que anule un permiso concedido a `PUBLIC`. Las funciones de trigger y los efectos de los triggers de la aplicación también deben revisarse como parte de la auditoría del esquema. Si es necesaria una frontera más estricta, se debe evaluar una base dedicada, sin alterar las aplicaciones compartidas por este procedimiento.

## Entrega al operador autorizado

1. Confirmar factory-gate, respaldo y restauración, revisión exacta, marcador final y manifiesto. Revisar el SQL y los permisos efectivos con el propietario de PostgreSQL. Si hay un bloqueo de permisos heredados, detener el cambio; no resolverlo con revocaciones generales.
2. Ejecutar el SQL revisado con la identidad de migración separada. Verificar que el rol nuevo continúa `NOLOGIN`, sin membresías, propiedad ni atributos elevados. Este paso no se ha ejecutado en producción.
3. Resolver primero TLS con el administrador de la base: certificado y CA confiables, nombre de servidor coincidente y validación estricta para ambas conexiones. No cambiar a `rejectUnauthorized=false` ni afirmar cifrado por haber modificado una variable. Validar la conexión real y el certificado sin registrar su URL o contraseña.
4. Únicamente bajo autorización operativa, fijar la contraseña del **rol nuevo** mediante `\password nombre_del_rol_nuevo` en una sesión psql segura; no ponerla en SQL, línea de comandos, Git, manifiestos o reportes. Habilitar `LOGIN` sólo para ese rol cuando las comprobaciones estén completas.
5. Configurar `DATABASE_URL` con el rol de ejecución nuevo y conservar una conexión distinta y protegida en `DIRECT_URL` para migraciones. Mantener idéntica base y esquema verificados, con TLS y certificados válidos. No entregar la identidad de migración al frontend. Revisar también worker y supervisor antes del cambio.
6. Probar readiness y recorridos con el rol limitado: lectura, altas, cambios, borrado autorizado, importaciones, trabajos y autorización multitenant. Confirmar que migraciones funcionan únicamente con su identidad separada. Registrar resultado sin credenciales y conservar la reversión de la configuración anterior hasta cerrar la entrega.

## Reversión del borrador aplicado

`rollback-unused-role.sql` sólo elimina el nuevo rol si sigue `NOLOGIN`, no tiene sesiones, membresías, objetos propios ni atributos elevados, y la identidad de base y marcador siguen coincidiendo. Revoca únicamente sus concesiones explícitas y ejecuta `DROP ROLE` dentro de una transacción. No usa `DROP OWNED`, no cambia el usuario anterior ni revoca permisos de otros usuarios. Si el rol se activó o presenta dependencias nuevas, aborta y exige revisión manual; no es un procedimiento de retirada de una cuenta en servicio.

Las pruebas PostgreSQL utilizan sólo esquemas y roles efímeros de una base QA. Se habilitan expresamente mediante `RUNTIME_ROLE_TEST_DATABASE_URL`; sin ella quedan omitidas. Pasar esas pruebas no demuestra que el nuevo rol exista en producción ni que sus triggers y recorridos reales hayan sido comprobados allí.
