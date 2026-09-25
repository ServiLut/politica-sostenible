# Auditoría funcional de Política Sostenible

Fecha: 25 de septiembre de 2026. Repositorio: `politica-sostenible`.

**Actualización posterior:** la revisión `ecc9221` fue instalada en producción a las 3:19 p. m. de Bogotá, con respaldo restaurado previamente y cambio exclusivo del contenedor de Política Sostenible. El estado de sus comprobaciones posteriores está en [Despliegue y validación](DESPLIEGUE_Y_VALIDACION_2026-09-25.md).

**Dictamen del corte previo al despliegue:** se encontraron y corrigieron defectos reales en el código local; la aplicación publicada de ese momento no podía certificarse como completamente operativa. Las correcciones aún no se habían desplegado cuando se cerró este informe funcional. El cierre local incorporó PostgreSQL 16 y Redis reales, protección de migraciones y correcciones de carga de la interfaz. Se distinguen esas pruebas locales de los recorridos publicados y de las integraciones externas pendientes.

## Alcance y evidencia

- Navegación autenticada de las **22 secciones visibles** para Administración en una organización de candidatura, además del perfil personal, buscador, formularios seleccionados y bóveda offline.
- Inventario estático inicial de **44 rutas**, con **300 declaraciones de botones y 94 formularios directamente en páginas**. Los controles compartidos se revisaron adicionalmente. Estos números no representan 300 clics, ni escrituras comprobadas en producción.
- **43 controladores y 245 rutas HTTP de NestJS**. Se rastrearon **233 llamadas del frontend, 69 mediante wrappers**, sin destinos no resueltos ni rutas incompatibles en el análisis estático.
- Pruebas de dominio, permisos, contratos, compilación y persistencia física en una base local desechable. Se aplicaron allí las **44 migraciones** disponibles.
- La suite de navegador inventariada tiene 159 escenarios en dos tamaños, es decir, 318 ejecuciones. **44 de sus 46 archivos interceptan respuestas**. No se ejecutó como sustituto de pruebas completas con servicios reales.

La inspección de producción fue de lectura y navegación. Se abrieron y cancelaron formularios; no se guardaron registros, no se cambiaron etapas, no se enviaron invitaciones/comunicaciones, no se habilitó la bóveda y no se ejecutaron pagos, cargas ni purgas. La pestaña se devolvió al centro de comando y se retiró la emulación de pantalla.

## Hallazgos principales y reparación

| Prioridad | Hallazgo | Cambio local | Estado publicado / límite |
|---|---|---|---|
| Crítica | El backend devolvía alistamiento `READY` con valores fijos y sin consultar la base. La pantalla esperaba secciones inexistentes y fallaba. | Cálculo transaccional desde datos reales, validación de identidad/rol, contrato completo y validación defensiva en la UI. Se restauraron controles de cambio de etapa y cierre. | La caída se reprodujo en producción. La corrección se validó localmente, incluido PostgreSQL. |
| Crítica | Un cargador heredado apuntaba a producción e insertaba 39 líderes sin fuentes, 15 de Medellín. En el directorio publicado se observó un grupo compatible con ese bloque. | Cargador retirado de ejecución: falla antes de red o base. Original preservado con huella. | Datos existentes conservados. Falta cotejo de IDs/eventos y decisión de depuración; no se afirma que las 39 filas estén publicadas. |
| Crítica | Otro cargador generaba coordenadas con `Math.random()` y escribía sin aislamiento por organización. | Script bloqueado antes de importar Prisma o conectar una base. | No se demostró que se hubiera ejecutado en producción. Las coordenadas existentes requieren fuente verificable. |
| Alta | El mapa recibía HTTP 200 pero rechazaba el contrato; el agregado incluía nombres y teléfonos de líderes. | API entrega sólo agregados; cliente tolera y descarta el campo heredado para no guardarlo en snapshots offline. | Error visible reproducido. Ningún HTTP 200 se tomó como prueba de funcionamiento. |
| Alta | Jornada y líderes necesitaban controles consistentes de rol actual, organización, territorio y ciclo de operación. | DTOs, filtros, consentimiento, transacciones y auditoría mínima. Menú de seguimiento de participación limitado a `ELECTION_DAY`, igual que la API. | No se alteraron roles ni etapas productivas para forzar acceso. |
| Alta | Una caída de base se trataba como sesión inválida. | Fallo de dependencia devuelve 503; tokens inválidos mantienen 401. | Verificado con pruebas de guard; no se provocó una caída productiva. |
| Alta | Auditoría copiaba textos libres con información personal innecesaria. | Snapshots mínimos y huellas en casos, eventos y comunicaciones. | Los eventos históricos permanecen intactos. |
| Media | Líderes: consultas antiguas podían sobrescribir filtros nuevos; errores/carga se mezclaban entre divisiones; teléfono `+57` podía duplicar prefijo. | Cancelación, estado por división, normalización de contacto y URL pública segura. Modal con validación y protección frente a doble envío. | Probado localmente; formulario publicado inspeccionado sin guardar. |
| Media | Seguimiento de jornada hablaba de votos asegurados/tiempo real para estados manuales. | Participación reportada, corte explícito, aviso de información anterior y recálculo del servidor después de guardar. | Sin inferir intención o resultado electoral. |
| Media | Error de una página podía persistir al cambiar de sección; búsqueda podía mostrar una respuesta anterior. | Boundary por ruta y descarte/cancelación de consultas obsoletas. | Reparación local. |
| Media | La landing ofrecía cumplimiento automático, seguro jurídico, ahorro de tiempo, precios y comparación universal con CRM sin sustento conectado. | Descripciones ligadas a capacidades existentes; eliminada tabla comparativa inventada y precios duplicados. Consulta de plan enlazada a la cuenta. | No cambia contratos, precios de base ni sitio publicado. |
| Alta | Configuración de Compose/CI no reflejaba dependencias y worker existentes. | Conexiones de Redis, worker, HMAC, esquema correcto y verificaciones de compilación/HTTP/lint. Revisión de artefacto ya no acepta `unknown` en producción. | Se construyeron y arrancaron los contenedores reales en un Docker local aislado. No se desplegó en producción. |
| Alta | Dos migraciones publicadas dejaban DDL persistido al inyectar un fallo final con Prisma real. | Ejecutor limitado a dos nombres/SHA-256: SQL original y nueva fila de historial se confirman en una misma transacción; conserva registros previos y rechaza historias incompatibles. | Se comprobaron rollback, fallo después de insertar historial, reintento y compatibilidad posterior con Prisma. No se editaron los archivos SQL publicados. |
| Alta | El seed histórico podía sobrescribir términos comerciales; comparar sólo precios por código no detectaba IDs intercambiados ni textos personalizados. | Validación completa más barrera PostgreSQL antes del seed. Se mantiene tras fallo y se retira sólo tras verificaciones finales. | Catorce pruebas con PostgreSQL real, incluyendo carrera entre conexiones y bootstrap completo, aprobadas. |
| Media | Las cargas en numerosas páginas/componentes podían conservar datos de otra consulta o aceptar respuestas tardías. | Estado asociado a la consulta, cancelación real y sincronización de sesión con comprobación del token vigente. | Comprobaciones locales; el recorrido visual del candidato sigue siendo una evidencia separada. |
| Media | Los accesos flotantes de instalación y bóveda se superponían al registro en pantalla móvil. | Controles operativos visibles sólo en el dashboard y el lanzador `/aplicacion`; el service worker conserva registro global y se mantiene acceso de recuperación sin sesión. | Corregido en el candidato local; regresión de rutas y compilación aprobadas. |

## Recorrido de las 22 secciones visibles

“Consulta operativa” significa que la pantalla abrió y presentó datos o un estado vacío coherente. No implica alta/edición/exportación comprobada contra producción.

| Sección | Observación en la aplicación publicada | Qué falta para uso real |
|---|---|---|
| Centro de comando | Tarjetas, cortes y enlaces visibles. Sin movimientos ni metas; equipo activo calculado sobre un solo integrante. | Datos de operación y alistamiento; 100% de un usuario no prueba cobertura territorial. |
| Equipo y accesos | Un integrante. Formulario de invitación con roles disponible. | Invitar responsables reales mediante flujo autorizado; envío no probado. |
| Perfil de operación | Error de renderizado reproducido. | Publicar corrección validada y completar el perfil con datos reales. |
| Programa político | Consulta de una propuesta existente y controles de gestión. | Verificar contenido/responsables; no se certificó el origen del registro. |
| Incidentes y crisis | Lista vacía, filtros y acción de reporte. | Ensayo completo de alta/seguimiento/soportes en entorno de pruebas. |
| Bandeja operativa | Estado vacío y filtros coherentes. | Comprobar pendientes cruzados con registros reales controlados. |
| Territorio | 1.122 municipios, paginación y acciones de configuración. | Zonas, puestos, responsables y georreferencias con fuente. No se ejecutó sincronización DANE. |
| Mapa de calor | Mensaje de error pese a respuesta HTTP exitosa. | Desplegar API/UI compatibles; geografía y métricas deben reflejar fuentes reales. |
| Líderes territoriales | Municipio expandible, 16 filas observadas en Medellín y formulario de alta. | Cotejar el bloque de ejemplo y depurar con autorización; no contactar números para validarlos. |
| Personas | Cero personas. Registro/importación bloqueados por ausencia de aviso activo. | Aprobar aviso y finalidad antes de capturas reales. Exportación depende del plan. |
| Tareas y compromisos | Listas vacías; modal de tarea con responsable, prioridad y fecha; pestaña de compromisos funciona. | Crear, leer, editar y cerrar tareas en entorno de pruebas. Modal cancelado en producción. |
| Agenda y eventos | Un evento finalizado visible y acción de alta. | Confirmar datos auténticos y probar ciclo de convocatoria/seguimiento sin enviar mensajes reales. |
| Logística electoral | Bloqueada por perfil no configurado. | Resolver perfil y luego probar reservas, entregas y conciliación. |
| Planificación de testigos | Aviso de perfil pendiente; asignaciones/ventanas restringidas. | Perfil, etapa y puestos reales; no eludir restricciones. |
| Catálogo electoral | Consola de versiones/importaciones vacía. | Archivo de fuente autorizada, upload firmado, worker y lectura posterior. |
| Gobierno de retención | Consola sin configuración; conserva separación entre aprobaciones y ejecución. | Configurar política; el módulo no implementa un ejecutor general de eliminación. |
| Aviso de privacidad | Formulario disponible, sin aviso activo. | Contenido y responsable aprobados por la organización. No se activó texto de ejemplo. |
| Aprobación de comunicaciones | Cola vacía; decisiones de revisión humana. | Flujo de aprobación; no confundir con envío, programación ni publicación. |
| Auditoría | Historial visible con eventos existentes. | Contrastar futuros ensayos con eventos y actor/fecha; no se exportó información privada. |
| Finanzas | Bloqueo de alistamiento; expediente con campos pendientes, sin movimientos. | Fuente de topes, responsables, cuenta y demás datos auténticos; luego ensayar soportes y cierre. |
| Sellos de metadatos | MFA requerido y no habilitado por plan Piloto. | Decisión de capacidades/plan; no equivale a firma o certificación oficial. |
| Plan y uso | Piloto, uso de usuarios/personas/almacenamiento y capacidades visibles. | No se compró ni cambió plan. Condiciones efectivas se consultan aquí, no en cifras duplicadas de marketing. |

Controles adicionales: buscador con consulta sin coincidencias, menú de usuario y cuenta personal, modal de líder, modal de tarea, pestañas de compromisos y panel de bóveda. No se estableció contraseña/frase offline ni se modificó la cuenta.

Diseño adaptable: se comprobó la vista de 390 × 844 y el menú ampliado por teclado y clic en viewport estrecho. El clic bajo emulación `mobile=true` fue inconcluso; con teclado y `mobile=false` abrió correctamente. Esto no reemplaza una prueba táctil en un teléfono real.

## Pruebas y límites de liberación

Los resultados finales se incorporan al cierre de este documento. Los logs y JSON de evidencia están en `.artifacts` y no contienen una exportación de datos productivos.

| Control | Resultado comprobado |
|---|---|
| API global con PostgreSQL 16 y Redis | **2.483 de 2.483 pasan**, 236 suites; sin pruebas omitidas en esta corrida. |
| RBAC | 297 pruebas pasan. |
| HTTP Nest con aplicación completa y servicios reales | **25 de 25 pasan**, sin sustituir Prisma, guards, JWT, bcrypt ni Redis. Incluye consultas, alta/cambio/lectura posterior, aislamiento, revocación de sesión y cierre sin conexiones PostgreSQL residuales. |
| PostgreSQL 16.14 y Redis 7.4.11 reales | **45 de 45 pasan**, en 15 suites. Reemplaza el primer ensayo con PostgreSQL 17, incompatible con el guard de versión. |
| Perfil operativo con PostgreSQL | Incluido arriba: organización vacía bloqueada, guardado/lectura posterior y rechazo de otro tenant. |
| Atomicidad histórica | **6 de 6 pasan**: guard ante error después del DDL y después de insertar historial; control Prisma sin guard detecta restos; reintento con SHA-256 canónico. |
| Protección de planes | **14 de 14 pasan** contra PostgreSQL real; incluye bootstrap completo, reintento y catálogo personalizado tras prefijo interrumpido. |
| Instalador completo | **44 migraciones**, historial vigente, diferencia de esquema cero y postcondiciones aprobadas desde base vacía. |
| TypeScript API / compilación Nest | Aprobados. |
| Web unit | **299 de 299 pasan** en el corte final, incluyendo la visibilidad de controles móviles, sin abrir navegador. |
| TypeScript web / build Next.js | **Aprobados**; 48 rutas compiladas, incluyendo las rutas especiales del framework. |
| Lint web | **0 errores, 0 advertencias** en 229 archivos, con `--max-warnings 0`. |
| Lint API | **0 errores, 0 advertencias** en 555 archivos en el corte agregado; verificaciones focalizadas posteriores también aprobadas. |
| Deploy/configuración | **127 pruebas pasan**; las 20 físicas se ejecutaron aparte: 6 de atomicidad y 14 de planes, todas aprobadas. |
| Imágenes y arranque local | Migrador, API, worker y web construidos con sus Dockerfiles reales; PostgreSQL, Redis, Storage y gateway aislados. API y worker saludables. |
| Supabase Storage real | Bucket privado, acceso anónimo rechazado, PUT firmado directo y descarga SHA-256 idéntica; objeto sintético de humo eliminado y ausencia comprobada. |
| Flujo completo API → Storage → BullMQ → PostgreSQL | **8 de 8 comprobaciones pasan**, sin mocks. Incluye archivo válido verificado, archivo con SHA-256 falso rechazado por lectura real del worker, aislamiento entre dos organizaciones, catálogo de cuatro entradas importado e idempotencia. |
| Infraestructura de evaluación | **5 de 5 pruebas pasan**: credenciales independientes, transmisión de archivos, CORS con el SDK real y separación de servicios/puertos. Incorporadas al CI. |
| Navegador contra servicios locales reales | Sesión y redirección al destino solicitado; perfil sin caída y alistamiento calculado; mapa vacío sin error falso; tarea creada y terminada con lectura posterior tras recargar; catálogo procesado por worker visible en preparación. Sin respuestas de API interceptadas en este recorrido. |
| Navegación local completa de la cuenta | **22 secciones visibles visitadas sin caída de renderizado**. Los bloqueos por falta de perfil y por MFA/plan se presentan explícitamente. Auditoría muestra creación y actualización de la tarea de prueba. Esto acredita consulta/navegación y los recorridos detallados, no cada escritura posible de las 22 secciones. |
| Auditoría de dependencias | `corepack pnpm audit --audit-level low`: **0 vulnerabilidades reportadas**, 1.194 dependencias en este corte. No equivale a ausencia garantizada de vulnerabilidades. |

**Tratamiento de los bloqueos y límites de liberación:**

1. El SQL histórico de planes se conservó. Su ejecución pendiente queda protegida por validación previa y una barrera de base de datos, comprobadas físicamente. Un catálogo personalizado incompatible se detiene para reconciliación; no se sobrescribe.
2. Las migraciones históricas de empalme y seguimiento de jornada mantienen sus checksums. El instalador aplica únicamente esos dos archivos mediante una transacción PostgreSQL que incluye el registro nuevo de ejecución. Se demostró que Prisma directo deja restos ante fallo y que el ejecutor protegido revierte ambos cambios.
3. Las pruebas específicas de PostgreSQL 16 y Redis ya se ejecutaron satisfactoriamente en servicios locales aislados, sin datos productivos. Se incorporaron a CI.
4. Se corrigió la deuda de lint del backend y de la interfaz. No se desactivaron reglas para aparentar aprobación. El ensayo HTTP detectó además un pool PostgreSQL que no se cerraba; se corrigió su disposición y se comprobó desde otra conexión que no quedaban sesiones de la prueba.
5. Se construyó el entorno local autorizado después de confirmar que no existía staging. El recorrido completo Next → Nest → PostgreSQL → Storage → worker se documenta con sus resultados concretos, sin trasladar credenciales productivas ni interpretar disponibilidad como éxito de todas las operaciones.

En el primer corte, el intento de iniciar una vista previa en `127.0.0.1:3109` fue rechazado por la revisión automática con “blocked by policy”, sin otro motivo indicado. Ese intento no se repitió. Posteriormente la usuaria confirmó que no existía entorno de pruebas y autorizó preparar uno: se creó una topología Docker propia, con datos y claves locales independientes, accesible únicamente por loopback. Sus comandos de arranque fueron aceptados y se comprobaron servicios reales. El entorno no sustituye un despliegue público aprobado.

Preparación, límites y comandos: [entorno de evaluación local](../deploy/staging/README.md). Las claves generadas están excluidas de Git y del contexto Docker; el informe no contiene sus valores. Los datos sintéticos conservados en ese entorno no deben trasladarse a producción.

### Recorrido integrado de archivos e importación

El candidato se ejecuta en `http://127.0.0.1:5310`, con un aviso persistente de entorno local y datos sintéticos. API, worker, PostgreSQL 16, Redis y Supabase Storage son procesos reales en contenedores propios. La base operativa sigue siendo PostgreSQL administrado por NestJS; no se usa Supabase Auth ni Supabase Database para la aplicación.

La prueba solicita permiso a NestJS, carga directamente a la URL firmada de Storage, confirma el objeto y espera la comprobación de integridad del worker. Una huella declarada correcta termina en `VERIFIED`; una falsa termina en `FAILED / SHA256_MISMATCH`, aunque los metadatos de carga declaren esa misma huella falsa. Así se comprueba lectura y cálculo sobre el binario, no confianza ciega en metadatos.

El importador procesa cuatro entradas de jerarquía electoral sintética y conserva su hash y resultado `SUCCEEDED / STAGED`. Una solicitud repetida devuelve el mismo trabajo. **El catálogo sintético no se activó**, ni sus entradas se presentan como datos oficiales. La segunda organización recibe rechazo al consultar o confirmar objetos ajenos y listas vacías de catálogos de la primera. Las dos sesiones del ensayo se revocaron y dieron 401 al volver a usarlas. Posteriormente se abrió una sesión nueva de la cuenta sintética A exclusivamente para las pruebas visuales.

El cierre de navegador cubrió las 22 secciones de esa cuenta sin caída de página y sin errores inesperados capturados. La tarea creada y terminada desde la interfaz conservó su estado después de dos recargas; el historial registró `TASK_CREATED` y `TASK_UPDATED` para el mismo ID. El menú móvil a 390 px abrió por teclado, navegó a tareas y se cerró, sin desbordamiento horizontal. La última imagen web incluye además el enlace de recuperación de acceso con contraste y tamaño legibles. Se conserva la pestaña local autenticada para revisión. Matriz y límites completos: [recorrido visual real](../.artifacts/staging/UI_BROWSER_REPORT.md).

La evidencia se conserva en `.artifacts/staging/storage-workflow.log`. El script repetible es `deploy/staging/test-storage-workflow.mjs`; exige autorización explícita por variable y comprueba la identidad exacta del motor, contenedores, bases, bucket y credenciales locales. Los intentos previos dejaron únicamente fixtures sintéticos en esos volúmenes locales. El ensayo no verifica envío de correo/WhatsApp, pagos, firma oficial ni integración con una fuente electoral externa.

Las pruebas de interfaz con respuestas interceptadas, los checks estáticos de rutas y las pruebas de servicio con PostgreSQL son evidencias complementarias, pero no sustituyen ese recorrido completo.

## Qué conviene mantener y priorizar

El núcleo útil ya existe: personas autorizadas, territorio, equipo, tareas/compromisos, agenda, incidencias, finanzas con soportes y revisión electoral. La prioridad es completar cada recorrido con responsable, fecha, estado, fuente y resultado persistido, y permitir abrir el detalle desde su indicador. No hace falta aumentar el número de secciones para conseguirlo.

Se consultaron funciones documentadas por [HubSpot](https://www.hubspot.es/products/crm/crm-for-account-executives), [Zoho](https://www.zoho.com/es-xl/crm/account-management.html) y [Siigo](https://siigonube.portaldeclientes.siigo.com/generar-informe-valoracion-de-inventarios/). Se tomaron como referencias de trabajo útil: seguimiento vinculado a contactos, historial conjunto, responsables y reportes con corte/filtros. **No se verificó un ranking independiente de uso en Colombia**, ni se recomienda comprar/migrar a esas herramientas.

| Orden | Trabajo siguiente | Responsable | Evidencia de cierre |
|---|---|---|---|
| 1 | **Completado:** levantar entorno aislado y cerrar pruebas del candidato integrado. | Desarrollo / operación técnica. | 8/8 comprobaciones de archivos/importación, 25/25 HTTP con servicios reales y recorrido visual de flujos críticos aprobados. |
| 2 | Cotejar y preparar depuración del dataset de líderes y procedencia de coordenadas. | Desarrollo en lectura; propietaria decide tratamiento. | Conjunto exacto de IDs, dependencias e historial; cambio autorizado y verificable. |
| 3 | Completar perfil, aviso, responsables y territorio con información real. | Administración de la organización. | Alistamiento calculado desde registros y roles efectivos. |
| 4 | Despliegue controlado de API y web compatibles, seguido de comprobación de las pantallas hoy fallidas. | Operación técnica con autorización de publicación. | Revisión de artefacto identificable, salud de dependencias y lectura posterior en el entorno publicado. |

## Evidencia complementaria

- `docs/auditoria-funcional-2026-09-25-pruebas.md`: inventario de pruebas, contratos y referencias.
- `.artifacts/auditoria-ui-2026-09-25.md` y `.artifacts/auditoria-ui-rutas-2026-09-25.json`: matriz inicial de las 44 rutas.
- `.artifacts/auditoria-seed-realidad-20260925.md`: origen del dataset, huellas y cargadores bloqueados.
- `.artifacts/auditoria-api-unit-final.json`: resultados globales API.
- `.artifacts/auditoria-postgres-final-20260925.json`: persistencia física y límite de versión.
- `.artifacts/auditoria-deploy-cierre-20260925.log`: gates de despliegue.
- `.artifacts/auditoria-web-cierre-20260925.log`: 281 pruebas web aprobadas.
- `.artifacts/auditoria-web-build-final-20260925.log`: compilación Next final.
- `.artifacts/auditoria-api-nest-build.log`: compilación Nest final.
- `.artifacts/auditoria-web-lint-final-clasificado-20260925.md`: deuda frontend comparada con HEAD.
- `.artifacts/auditoria-api-lint-summary.md`: deuda backend por archivo y regla.

El corte posterior prevalece sobre los inventarios iniciales: `.artifacts/cierre-api-completo-con-servicios.json` (2.483 pruebas API), `.artifacts/staging/ui-web-unit-final.log` (299 pruebas web), `.artifacts/staging/web-build-final.log` (imagen web), `.artifacts/staging/storage-workflow.log` (8 comprobaciones integradas), `.artifacts/staging/ci-unit.log` (5 de infraestructura), `.artifacts/staging/health-final.json` y `.artifacts/staging/containers-final.json` (estado del entorno). El informe [HTTP real](AUDITORIA_HTTP_REAL_2026-09-25.md) explica los fixtures conservados y los límites de cada ensayo.

`.artifacts/staging/candidate-source-manifest.json` conserva las huellas SHA-256 de los 210 archivos de código y pruebas modificados/nuevos del candidato local, junto con el commit de base. Identifica el árbol de trabajo evaluado; no lo presenta como un commit ni un artefacto de release publicado. El acceso local está documentado aparte en `.artifacts/staging/ACCESO_LOCAL.md`, excluido de Git, con credenciales exclusivamente sintéticas.

La última pasada también corrigió cancelación efectiva en el selector de responsables, búsquedas que podían mostrar resultados anteriores, control de doble envío del importador y semántica accesible de los enlaces de alistamiento. La regresión verifica abortar consultas, ignorar resultados tardíos y conservar el resultado de la consulta vigente.

Las instancias auxiliares de PostgreSQL de esta auditoría en puertos 55439 y 55440 se detuvieron al finalizar sus respectivas pruebas, y se conservaron sus archivos de evidencia. También se detuvo el Redis auxiliar de 56380. El entorno Docker de evaluación permanece separado y en funcionamiento para su revisión. No se detuvo ningún servicio productivo.

No se hizo commit, push, publicación, cambio de plan ni modificación de los datos de la organización durante esta revisión.

## Continuación: presentación y accesibilidad

A petición de la usuaria se revisaron después la presentación, los controles y los diálogos. Se corrigieron desbordamientos móviles comprobados, superposiciones de controles PWA sobre formularios, retorno de foco y navegación por teclado. El corte posterior de la interfaz tiene **301 pruebas aprobadas**, compilación de 48 rutas y lint global sin errores ni advertencias; se verificaron además 95 archivos API contra el manifiesto de esta auditoría sin cambios durante esa fase. Los resultados y límites visuales se documentan en [auditoría de presentación](AUDITORIA_PRESENTACION_2026-09-25.md). Esta continuación tampoco se publicó en producción.
