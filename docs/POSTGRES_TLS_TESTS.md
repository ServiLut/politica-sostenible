# Regresión de TLS PostgreSQL con conexión real

`deploy/postgres-tls.integration.test.mjs` comprueba los clientes reales del migrador: `postgresClientOptions` para `pg` y `prismaMigrationConnectionString` con el motor nativo Prisma instalado. No abre la aplicación, instala dependencias, modifica producción ni crea o detiene servidores. Sólo consulta el estado TLS de su propia conexión en una base QA explícita.

La matriz exige seis resultados: para cada motor, CA confiable con `localhost` conecta; sin esa CA rechaza el certificado; con la CA pero usando `127.0.0.1` rechaza la identidad del servidor. El certificado del servidor debe contener únicamente `DNS:localhost` en SAN, sin IP. Así el negativo de nombre no depende de una conexión caída. El caso positivo de `pg` también comprueba SAN y `pg_stat_ssl`; el SQL del hijo nativo falla si PostgreSQL informa una conexión sin TLS.

## Preparación del fixture

Utilizar una instancia PostgreSQL local y desechable, con puerto propio distinto de 5432, usuario `postgres` sin contraseña sólo en el entorno aislado de ensayo y base `politica_tls_test`. No habilitar esa autenticación en un servidor compartido. La instancia debe escuchar únicamente en loopback. Mantener la versión mayor de PostgreSQL utilizada por la integración del repositorio.

Crear fuera del repositorio una CA sintética efímera con CN `Politica disposable QA CA`; firmar con ella un certificado de servidor con `CN=localhost`, `subjectAltName=DNS:localhost`, uso `serverAuth` y sin IP en SAN. Configurar TLS nativo de PostgreSQL con ese certificado y clave. Conservar las claves sólo en el directorio temporal privado del fixture; nunca subirlas ni incluirlas en artefactos CI. Los certificados deben estar vigentes durante la prueba. La configuración de escucha, datos y puerto debe comprobarse antes de arrancar o detener esa instancia.

La prueba no modifica los almacenes de confianza del sistema. Los procesos hijos usan exclusivamente el archivo CA señalado para los casos positivos y de nombre incorrecto; eliminan opciones de confianza heredadas para el caso sin CA. Prisma recibe una única CA PEM mediante la conversión interna autorizada del migrador, que usa el contrato nativo estricto. No se presupone compatibilidad con paquetes de varias CA.

## Ejecución explícita

Definir estas tres variables sólo para el proceso de prueba:

- `POSTGRES_TLS_TEST_ENABLED=1`.
- `POSTGRES_TLS_TEST_DATABASE_URL`: URL PostgreSQL con host exacto `localhost`, puerto aislado, usuario `postgres`, base `politica_tls_test`, sin contraseña ni parámetros. No usar una URL de producción.
- `POSTGRES_TLS_TEST_CA_FILE`: ruta absoluta a la CA sintética fuera del repositorio.

Ejecutar `node --test deploy/postgres-tls.integration.test.mjs`. Se omite la integración cuando ninguna variable está presente. Si se proporciona alguna, la configuración incompleta o no permitida falla; no se convierte en omisión. El recibo de ejecución debe distinguir una prueba física aprobada de una omitida.

Los hijos capturan su salida; los fallos públicos contienen únicamente comprobaciones y códigos TLS controlados. No se imprimen URLs, credenciales, archivos de certificados ni logs nativos completos. El harness elimina sólo su directorio temporal de configuración, comprobando el nombre y padre antes de hacerlo. La persona responsable del fixture verifica y apaga su servidor al terminar las revisiones coordinadas.

## Paso obligatorio preparado en CI

`test-and-build`, después de `security-gate`, llama directamente a `node deploy/run-postgres-tls-tests.mjs`. El runner Linux exige Docker local y OpenSSL disponibles; prepara su propio fixture y las tres variables. Usa la misma imagen PostgreSQL 16 fijada por digest que los servicios de CI, un puerto aleatorio publicado sólo en loopback, límites de CPU/memoria/procesos y datos efímeros en tmpfs. No utiliza la base de las otras integraciones ni un servidor productivo.

La CA y las claves se generan en un directorio temporal privado fuera del repositorio. El contenedor sólo monta la clave y el certificado del servidor, no la clave de la CA. Al terminar, el runner comprueba nombre, etiqueta única e imagen antes de eliminar exclusivamente su contenedor; también verifica el padre y nombre de su directorio temporal antes de limpiarlo. Un fallo de limpieza impide el resultado satisfactorio.

El runner exige salida exitosa y las seis comprobaciones físicas exactas, con siete pruebas aprobadas contando el grupo y cero omitidas, fallidas o canceladas. Ejecutar la suite sin variables y obtener una omisión no satisface el runner. El contrato de workflow tiene regresiones que rechazan retirar este paso, convertirlo en una ejecución optativa, ignorar su error o retirar el digest. Sólo emite el resumen controlado de éxito; no publica claves, entorno ni salida nativa completa.

## Alcance

Esta regresión confirma negociación y rechazo reales en el fixture configurado. No acredita TLS de producción, capacidad, permisos comerciales completos ni rotación de certificados. El paso obligatorio está configurado en fuente; una ejecución de GitHub debe demostrarlo sobre el commit concreto. La prueba física directa de la suite no demuestra por sí sola que el runner Docker haya sido ejecutado. La prueba contra PostgreSQL sin TLS de `runtime-db-role.integration.test.mjs` sigue cubriendo por separado el rechazo a transporte en claro.
