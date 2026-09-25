# Despliegue y validación de Política Sostenible

Fecha: 25 de septiembre de 2026. Alcance autorizado: únicamente Política Sostenible en el servidor compartido. Este documento distingue la preparación, el cambio efectivo y las pruebas posteriores.

**Estado final: versión activada; salud, circuitos funcionales seleccionados y recorrido de las 22 secciones visibles verificados en producción. Las dos cuentas sintéticas quedaron desactivadas y sus intentos de inicio de sesión fueron rechazados.** La revisión publicada es `ecc922196ae88da08b75ed5dcaeffb1fe1f7c772`.

## Versión y alternativa de instalación

El candidato funcional y visual quedó versionado localmente en `codex/validacion-produccion-20260925`: correcciones en `45e9c61` y propagación de revisión a los procesos aislados en `ecc922196ae88da08b75ed5dcaeffb1fe1f7c772`. Se construyó fuera del servidor compartido, con los orígenes HTTPS del programa y sin la configuración de staging. No se hizo push al repositorio público ni se instalaron claves SSH.

La imagen se trasladó por el bucket privado exclusivo `politica-sostenible-deployments`, mediante 37 partes de hasta 8 MiB y permisos de carga limitados a sus rutas. La vigencia observada de las firmas fue de 60 segundos; el helper temporal renovó las firmas de las partes pendientes sin cambiar la configuración compartida de Storage. Los intentos que recibieron un rechazo se conciliaron antes de continuar. Ninguna parte confirmada se sobrescribió.

El servidor descargó y comprobó cada parte antes de entregarla a Docker, y comprobó también el tamaño y SHA-256 completos. El archivo transportado contiene una sola imagen y un solo tag del programa.

| Identidad | Valor |
|---|---|
| Revisión candidata | `ecc922196ae88da08b75ed5dcaeffb1fe1f7c772` |
| Imagen | `politica-recovery:ecc922196ae88da08b75ed5dcaeffb1fe1f7c772` |
| Archivo comprimido | 303.792.347 bytes |
| SHA-256 del archivo | `7cc4d1d475a620f92ec3877bec12df6d75a088968d1008c2799382c68fb0a40e` |
| Configuración de la imagen | `sha256:adacbacef9f8092fc5041f6484a10fd4ddd2964688bf27aefcdd6339f12185c0` |
| Manifiesto OCI observado | `sha256:810db93ca340f76f1974f089c94dc0eb84101033d4891cd8b490d51ad678fa4c` |
| Imagen anterior conservada para reversión | `politica-recovery:fdd01bdc39f26cc48405711c3cd7af87cf052be3` |

El identificador informado por el motor del servidor corresponde al manifiesto OCI, mientras que el motor local informó el de la configuración. Se verificaron físicamente el hash del archivo completo, el del manifiesto, su referencia a la configuración y el hash de esta. También coincidieron las 25 capas, sus tamaños y sus hashes descomprimidos en el orden de `rootfs.diff_ids`. [Evidencia de identidad](../.artifacts/production-audit/image-oci-identity-verification.json). La diferencia de identificadores según el almacén está descrita por [containerd](https://github.com/containerd/nerdctl/blob/main/docs/command-reference.md#-nerdctl-images).

La copia de código recuperable es `.artifacts/production-audit/politica-release-ecc9221.bundle`, verificada con Git; requiere el commit base `48e14f7835ed2525ee27c0d32375cfec391edde2`. La imagen y sus partes también permanecen en los artefactos privados locales.

## Respaldo anterior al cambio

Se respaldó exclusivamente el esquema `politica-sostenible-crm` mediante `pg_dump`, con conexión de solo lectura, límite de espera y sin copiar otros esquemas. El resultado se cifró con AES-256-GCM y su clave se envolvió mediante RSA-OAEP-SHA256; la clave privada permaneció local.

El respaldo se descargó de nuevo, se autenticó y se restauró realmente en PostgreSQL 16 local, en un contenedor nuevo sin red ni puertos publicados. La restauración transaccional terminó con código cero.

- 119 de 119 tablas, con todas sus secciones de datos.
- 44 migraciones aplicadas y 44 checksums coincidentes con el candidato; ninguna pendiente o incompleta.
- Registro histórico de migración anulada conservado.
- 925 restricciones, incluidas 471 llaves foráneas, todas validadas.
- 667 índices válidos y disponibles.
- Un tenant, un administrador y cuatro planes en el snapshot.
- Extensiones `btree_gist 1.7` y `pg_trgm 1.6` preparadas en el destino local, tal como estaban en el esquema de origen. Solo se excluyó del índice de restauración el `CREATE SCHEMA` que ya había sido necesario para instalarlas.

Las funciones reales del migrador verificaron además que los cuatro planes del respaldo satisfacen sus comprobaciones previas y posteriores. La copia restaurada quedó detenida al terminar las inspecciones locales. No se restauró nada sobre producción.

Evidencia: [restauración](../.artifacts/production-audit/restore-verification.json), [compatibilidad de planes](../.artifacts/production-audit/restore-plan-verification.json). El respaldo refleja su snapshot: no incluye escrituras posteriores, roles globales ni los binarios preexistentes en Storage.

## Cambio acotado y protección de los demás programas

Se registraron, antes del cambio, ID, nombre, imagen, inicio, reinicios y estado de los 40 contenedores en ejecución. Esta lectura no incluyó sus variables, credenciales, registros de negocio ni logs.

El despliegue cambió únicamente `APP_REVISION` en la configuración de `crm-recuperacion`, y utilizó:

```text
docker compose -p politica-sostenible-crmrecuperacion-pe1dnh -f ./compose.recovery.yml up -d --no-build --no-deps app
```

El comando no compila en el servidor ni recrea Redis, otras dependencias o servicios ajenos. Conserva dominios, proxy, redes y autodeploy desactivado. La reversión de aplicación utiliza la imagen anterior y el mismo comando acotado. No implica restaurar la base compartida.

El despliegue se confirmó una sola vez a las **20:19:19 UTC (3:19:19 p. m. de Bogotá)**. Su salida mostró únicamente la recreación de `app`. El monitor público observó 404 durante dos muestras, a las 20:19:29 y 20:19:39, y recuperación con la revisión nueva a las **20:19:50**. Tres muestras consecutivas confirmaron interfaz, API viva y API lista con HTTP 200 y revisión idéntica. Esta frecuencia de muestreo no mide la duración exacta de la interrupción.

También aprobaron ocho rutas públicas: portada, inicio de sesión, las dos rutas de salud, manifiesto, service worker, página offline y lanzador de la aplicación. Evidencia: [observaciones del cambio](../.artifacts/production-audit/rollout-health-observations.json) y [verificación pública](../.artifacts/production-audit/public-release-verification.json).

La comparación posterior confirmó **40 contenedores antes y después; 39 idénticos en los seis campos y únicamente `app` de Política Sostenible cambiado**. El nuevo contenedor arrancó a las 20:19:23.765 UTC, con el manifiesto OCI esperado y cero reinicios. Redis del programa y todos los contenedores ajenos conservaron identidad, imagen, inicio, reinicios y estado. [Comparación de contenedores](../.artifacts/production-audit/production-containers-comparison.json). Esta evidencia acredita continuidad de esos contenedores; no es una auditoría funcional de los otros programas.

## Pruebas posteriores

Se aprovisionaron dos organizaciones y dos administradores sintéticos nuevos, exclusivamente en este esquema, sin registro público, aceptación de términos ni mensajes a terceros. Las contraseñas aleatorias se entregaron cifradas a la clave local. La organización y el usuario originales permanecieron intactos. Identificador de la prueba: `a613b283-4850-4f52-9e97-5ee65752871b`.

| Circuito | Estado comprobado en este corte |
|---|---|
| Salud y versión | Tres muestras consecutivas de interfaz/API viva/API lista con HTTP 200 y revisión idéntica; ocho rutas públicas aprobadas. |
| Identidad y alistamiento | Login real A/B, identidad y ausencia de perfil verificadas; sin JWT devuelve 401; el centro de comando corresponde a A. |
| Tarea | Alta, consulta posterior, actualización y nueva consulta aprobadas; B no puede leer ni modificar; tarea cerrada como CANCELLED y conservada. |
| Evento | **6 comprobaciones aprobadas, 19 peticiones HTTP en la continuación controlada**. Alta 201 anterior conciliada por marcador único, lectura, actualización y nueva lectura; B no puede consultar ni modificar. El borrador se eliminó y se comprobó su ausencia con 404. Ambas sesiones revocadas. |
| Archivos y worker | **9 comprobaciones aprobadas, 28 peticiones HTTP**. Dos CSV sintéticos menores de 1 KiB cargados directamente al bucket privado del programa; confirmación validada. El worker marcó VERIFIED al correcto y FAILED / SHA256_MISMATCH al de huella incorrecta. B recibió rechazo y las URLs públicas no permitieron leerlos. Ambas sesiones se revocaron. |
| Navegación y presentación | **22 de 22 secciones visibles recorridas**, sin caída global ni desbordamiento horizontal del documento en 2133 × 950 CSS px. Modales de tareas y eventos comprobados: apertura, foco, cierre/cancelación y retorno al botón. Los requisitos de perfil, aviso, etapa y plan siguen vigentes. |
| Cierre de cuentas | **Dos de dos desactivadas**, con incremento de versión de autenticación y auditoría; lectura posterior confirma `isActive=false`. Ambas contraseñas de prueba reciben 401 en un nuevo intento de login. Los otros usuarios y las tres organizaciones conservaron sus huellas; no se eliminaron registros en este cierre. |

El resultado de Storage corresponde a [`storage-smoke-journal.json`](../.artifacts/production-audit/a613b283-4850-4f52-9e97-5ee65752871b/storage-smoke-journal.json). Los dos objetos se conservan como evidencia en el tenant sintético. No se creó ningún movimiento financiero. El endpoint de integridad acredita la decisión del worker; no expone su hash calculado físicamente. La prueba no incluye una descarga firmada vinculada a un expediente de negocio.

El primer runner de eventos exigió `tenantId`, campo omitido deliberadamente por el contrato público, y se detuvo después del POST 201. Se corrigió el comprobador, con 19 pruebas locales de sus guardas y ejecución, sin cambiar la aplicación publicada. La continuación `--resume-event` concilió y reutilizó el único borrador por marcador exacto: no volvió a crear eventos ni tareas. El fallo inicial y su diario permanecen intactos; [`event-reconciliation.json`](../.artifacts/production-audit/a613b283-4850-4f52-9e97-5ee65752871b/event-reconciliation.json) conserva el resultado posterior aprobado. Este ajuste de herramientas está en el commit local `ce6c565`; la revisión en ejecución continúa siendo `ecc9221`.

El [informe de interfaz publicada](../.artifacts/production-audit/ui-final/README.md) conserva la matriz de rutas y medidas. Las 68 muestras adaptables de 320 a 1440 px pertenecen al candidato local real; no se presentan como mediciones móviles de producción. La captura de Chrome publicada devolvió un mosaico del compositor y se marcó como no entregable. La medición DOM y las interacciones se registraron por separado. No se guardaron datos ni se modificó configuración de la organización original durante el recorrido del navegador.

El [recibo de desactivación](../.artifacts/production-audit/synthetic-deactivation-receipt.json) confirma las dos cuentas inactivas, versión de autenticación 4 y preservación de los demás usuarios y organizaciones. La primera preparación de archivos recibió `EPERM` al intentar `chown` y se detuvo antes de ejecutar el cierre. Se crearon los archivos directamente con UID/GID 1001, sin cambiar capacidades ni permisos del contenedor, y se ejecutó una sola vez la transacción de desactivación. La [comprobación HTTP posterior](../.artifacts/production-audit/synthetic-login-closure.json), a las 20:39:56 UTC, recibió 401 para ambas cuentas con la revisión correcta. La sesión original quedó abierta en el cuadro de mando, sin diálogos.

Después de la desactivación se repitió una sola vez la comprobación de las ocho rutas públicas: **ocho respuestas 200 con la misma revisión**. El resultado inicial se conservó como `public-release-verification-after-cutover.json`; `public-release-verification.json` contiene el corte final.

El [plan de pruebas de producción](PRUEBAS_PRODUCCION_2026-09-25.md) detalla las guardas y límites. Las [pruebas funcionales](AUDITORIA_FUNCIONAL_2026-09-25.md) y la [revisión de presentación](AUDITORIA_PRESENTACION_2026-09-25.md) anteriores documentan cobertura local: no deben reinterpretarse como ejecuciones de producción.

## Configuración conservada y límites

La instalación compartida conserva su topología de compatibilidad, con API, worker y web en procesos de usuarios distintos dentro del contenedor del programa. También conserva el perfil de evaluación y la conexión interna a PostgreSQL sin TLS que se observaron antes del cambio. No se modificó la infraestructura compartida para resolver esos puntos; una certificación de endurecimiento de producción requiere tratarlos por separado.

Los datos de operación, responsables, consentimientos, fuentes territoriales y perfil de candidatura deben proceder de información verificable. La revisión no inventa estos datos para mostrar estados aprobados. Los flujos restringidos por esas condiciones no se certifican como habilitados. Tampoco se acreditan aquí todas las combinaciones de rol y plan, hardware móvil nativo, activación de bóveda, MFA, pagos o envío de comunicaciones externas.

La [revisión de datos heredados](REVISION_DATOS_HEREDADOS_2026-09-25.md) encontró 40 líderes en el respaldo: 25 coincidencias completas de seis campos con el cargador antiguo, 14 parciales y uno sin correspondencia. Cuatro entradas ubicadas bajo CALI en aquella fuente aparecen asociadas a SAN CALIXTO en el respaldo. Es evidencia de contenido y de una inconsistencia territorial; no prueba identidad, consentimiento ni falsedad de las personas. Se preservaron todos los registros. Los cargadores antiguos quedaron bloqueados para impedir nuevas inserciones de ejemplo o coordenadas aleatorias. La procedencia y ubicación requieren revisión de la responsable de los datos antes de usarlos operativamente; el sistema aún no tiene una cuarentena reversible para esos registros.

## Conservación y operación siguiente

El comando guardado de Dokploy conserva `--no-build --no-deps app`, comprobado mediante lectura posterior, y autodeploy continúa desactivado. El origen Git remoto y su rama no se cambiaron. Las siguientes entregas deberán construir y trasladar su imagen propia antes de actualizar `APP_REVISION`; el servidor no reconstruye automáticamente los cambios locales. La imagen anterior, el respaldo cifrado, sus comprobaciones y el bundle local se conservaron para recuperación.

Las dos organizaciones sintéticas, su tarea cancelada, auditoría y dos objetos de Storage quedan identificados por el UUID de esta prueba; no se mezclaron con la organización original. El borrador de evento sí se eliminó por su endpoint y se comprobó su ausencia. La conservación de objetos no es una garantía permanente: las reglas existentes de limpieza de archivos no asociados pueden aplicarse después.
