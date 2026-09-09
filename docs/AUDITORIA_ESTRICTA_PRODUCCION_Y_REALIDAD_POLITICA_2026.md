# Auditoría estricta de producción y realidad política colombiana 2026

> Corte de evidencia: 8 de septiembre de 2026.
> Alcance: aplicación web, API, operación política colombiana y riesgos de salida a producción.
> Veredicto: **el despliegue observado no está listo para una operación política crítica**. El candidato de código superó los gates locales y una corrida CI remota completa y verde en la rama pública saneada, pero todavía no fue promovido ni probado en staging o producción. Exige inventario de la base real, restauración ensayada, staging equivalente y pruebas con un tenant desechable antes de reemplazar producción.

## 1. Límites de esta auditoría

Este documento distingue cuatro estados que no deben mezclarse:

- **Observado en producción:** comportamiento comprobado de forma no destructiva en el despliegue viejo.
- **Corregido en candidato local:** existe implementación en el monorepo local; no significa que esté desplegada ni que la autoridad la haya certificado.
- **Pendiente externo:** exige una decisión del dueño del producto, asesoría especializada, credenciales, contrato o integración con un tercero.
- **No probado por seguridad:** se evitó alterar datos reales, enviar mensajes, mover dinero o ejecutar actuaciones electorales.

El recorrido productivo quedó resumido, sin credenciales ni datos personales, en
[Evidencia no destructiva de producción](./evidence/AUDITORIA_PRODUCCION_2026-09-07.md).
La comprobación posterior de puertos y superficies administrativas está en
[Evidencia de exposición externa](./evidence/INFRAESTRUCTURA_EXTERNA_2026-09-08.md).
Los conteos son evidencia de una sesión contra una versión cuyo commit/digest no
estaba publicado; no sustituyen una corrida reproducible posterior al despliegue.

No es un concepto jurídico, contable ni electoral. Tampoco certifica cumplimiento de la SIC, el CNE, la Registraduría o la Ley 1755. Las reglas deben ser validadas por responsables competentes para cada elección y mantenerse versionadas.

## 2. Diagnóstico ejecutivo

La aplicación ya tiene una base útil de CRM, territorio, casos, finanzas y día electoral, pero un político experimentado no la evaluaría por la cantidad de botones. La evaluaría por cinco preguntas: ¿funciona bajo presión?, ¿deja evidencia?, ¿respeta quién puede hacer qué?, ¿sobrevive sin conectividad?, ¿permite responder ante una autoridad?

Hoy la respuesta en el despliegue viejo es insuficiente:

- Hay una **brecha de versión**: producción no contiene varias rutas y contratos que sí existen localmente.
- El flujo de **mesa electoral** falla ante una entrada inválida y expone un error técnico en inglés.
- La **PWA no está desplegada** y no existe todavía una cola transaccional offline para el trabajo de campo.
- Finanzas, testigos, comunicaciones, consentimiento y atención ciudadana necesitan expedientes completos; una etiqueta o un formulario no crean por sí solos una actuación oficial.
- Recuperación de cuenta, verificación de email y protección distribuida contra abuso siguen incompletas en producción; el candidato local ya invalida JWT al cerrar sesión y evita reutilizar un TOTP aceptado.
- El incidente reportado en el que cuatro sitios de la VPS quedaron indisponibles no tiene análisis de causa raíz verificable. Compartir capacidad sin límites, aislamiento y observabilidad es un riesgo P0 en campaña y, con mayor razón, el día electoral.

## 3. Matriz estricta de severidad y realidad política

| Severidad | Hallazgo y realidad colombiana                                                                                                                     | Producción observada                                                                                                                                                           | Candidato local                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Cierre exigido                                                                                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P0**    | **Desfase entre código y despliegue.** Un equipo político no puede operar con menús que apuntan a contratos ausentes.                              | 18 de 47 endpoints GET esperados por el candidato respondieron 404; perfil operativo, bandeja, facturación y propuestas quedaron restringidos.                                 | Las rutas, API y controles existen localmente.                                                                                                                                                                                                                                                                                                                                                                                                                       | Desplegar como una sola versión compatible, verificar migraciones y ejecutar smoke tests autenticados por rol.                                                                             |
| **P0**    | **Cadena de suministro no atribuible en producción.** No se puede reproducir un binario político crítico desde un árbol mutable.                   | El remoto visible en [GitHub](https://github.com/ServiLut/politica-sostenible) continúa público, `main` no está protegido y producción no expone commit ni digest verificable. | La rama pública saneada del candidato aprobó la [corrida #30](https://github.com/ServiLut/politica-sostenible/actions/runs/34292792376). Acciones e imágenes base están fijadas por SHA/digest; pnpm usa una especificación con integridad en Docker y una lista cerrada de scripts. Dependabot quedó configurado, pero no opera hasta que el archivo llegue a la rama predeterminada. La rama completa de auditoría todavía requiere un remoto privado y protegido. | Volver privado el remoto, proteger `main`, verificar el proyecto Supabase histórico, rotar preventivamente credenciales y registrar el commit y digest exactos promovidos a cada ambiente. |
| **P0**    | **Linaje de migraciones ambiguo.** Una migración reescrita puede detener el servicio o, peor, dejar código y esquema creyendo historias distintas. | No se obtuvo el inventario de solo lectura de `_prisma_migrations` de la base real.                                                                                            | El guard compara bytes/checksums, identidad física, catálogo de planes, invariantes y deriva; dos archivos históricos conocidos exigen reconciliación previa.                                                                                                                                                                                                                                                                                                        | Inventariar cada base por schema, restaurar backup, ensayar el mismo commit y hacer un corte sin convivencia de binarios viejos/nuevos.                                                    |
| **P0**    | **Radio de impacto de la VPS.** Una caída simultánea de cuatro sitios puede paralizar comunicaciones, territorio y escrutinio.                     | Incidente reportado por el operador; causa exacta no fue comprobada durante esta auditoría.                                                                                    | No es una corrección de código demostrada.                                                                                                                                                                                                                                                                                                                                                                                                                           | RCA, límites de CPU/RAM, reinicios supervisados, health checks, alertas, aislamiento por servicio y simulacro de recuperación.                                                             |
| **P0**    | **Servicios administrativos y base expuestos.** Un panel o PostgreSQL alcanzable desde Internet aumenta innecesariamente la superficie de ataque.  | El 8 de septiembre se observó Dokploy por HTTP en 3000 y PostgreSQL aceptando conexiones TCP en 5432; no se intentó autenticar ni acceder a datos.                             | La topología Compose propuesta publica web sólo en loopback y mantiene API interna, pero el código no puede corregir el firewall real de la VPS.                                                                                                                                                                                                                                                                                                                     | Inventariar consumidores; restringir 5432 a red privada/orígenes mínimos, proteger Dokploy por HTTPS+MFA/VPN/IP y validar las cuatro aplicaciones después de cada regla.                   |
| **P0**    | **Identidad privilegiada.** Una invitación o cuenta administrativa mal protegida equivale a entregar la campaña.                                   | El despliegue viejo no demuestra las defensas nuevas.                                                                                                                          | Se bloquean invitaciones con rol ADMIN, se protegen las identidades SaaS permitidas por ID inmutable y se exige MFA al administrador SaaS.                                                                                                                                                                                                                                                                                                                           | Probar todos los roles en staging, rotar secretos y establecer recuperación administrativa de doble control.                                                                               |
| **P0**    | **Datos políticos y comunicaciones directas.** Una base de simpatizantes no autoriza perfilar ni contactar indiscriminadamente.                    | Personas sin aviso activo quedan bloqueadas, pero el flujo desplegado no muestra el expediente de base, fuente, segmentación y derechos.                                       | Solicitudes de comunicación registran base de destinatario, audiencia, fuente, segmentación, uso de IA, mecanismo de derechos y referencia de evidencia; se bloquean combinaciones incoherentes.                                                                                                                                                                                                                                                                     | Integrar supresión/bajas con cada proveedor y demostrar que una revocación se propaga antes de enviar.                                                                                     |
| **P0**    | **Día electoral y cadena de evidencia.** Un número en pantalla no sustituye el formulario, la credencial ni la reclamación escrita.                | Una mesa 999999 produjo error crudo, pérdida de filtros y reintento persistente.                                                                                               | Mesa acotada, errores en español, recuperación; reporte de testigo incorpora credencial E-15/E-16, tipo de E-14, detalle de votos y reclamación trazable.                                                                                                                                                                                                                                                                                                            | Probar con actas ficticias, revisión independiente, conflictos, sincronización repetida y caída de red; validar el procedimiento con dirección jurídica/electoral.                         |
| **P0**    | **Finanzas electorales.** Un “exportar CNE” o una referencia sobre un movimiento no prueba una rendición oficial.                                  | Solo se generó de forma no destructiva un borrador interno; quedó un evento de auditoría.                                                                                      | Expediente local con elección, alcance, fuente de topes, fecha límite, gerente, contador, cuenta única y código; la UI sólo permite anotar una referencia externa declarada y soporte privado, sin presentarla como radicación.                                                                                                                                                                                                                                      | Crear un expediente de informe/consolidado, conciliar banco-soportes-libro, validar códigos/topes vigentes, controlar cierre y probar con contador y gerente.                              |
| **P1**    | **Trabajo territorial sin conectividad.** En veredas y puestos congestionados, “recargue la página” no es una estrategia.                          | Recursos PWA devolvieron 404.                                                                                                                                                  | Hay manifest, service worker y página offline para el shell.                                                                                                                                                                                                                                                                                                                                                                                                         | Implementar cola cifrada de mutaciones, reanudación, deduplicación, conflictos visibles, borrado remoto y pruebas prolongadas offline.                                                     |
| **P1**    | **PQRSD y atención ciudadana.** Un caso interno sin radicación, término legal, competencia y notificación no puede llamarse PQRSD oficial.         | Módulo de casos accesible según modo, sin demostración de cómputo legal de términos.                                                                                           | Se presenta honestamente como registro interno (`CAS-GP`), sin prometer radicación, respuesta o notificación jurídica.                                                                                                                                                                                                                                                                                                                                               | Si el producto asumirá PQRSD: clasificación, calendario oficial, acuse, traslados, prórrogas, respuesta firmada, entrega, ACL y tablero de vencimientos.                                   |
| **P1**    | **GSC.** Capturar contactos no equivale a recoger apoyos válidos.                                                                                  | El despliegue viejo podía inducir una lectura ambigua del módulo.                                                                                                              | La interfaz aclara que captura territorial y contexto de firmas no sustituyen formularios, validación, radicación ni certificación de la Registraduría.                                                                                                                                                                                                                                                                                                              | Definir, con fuente vigente, comité, formularios, seriales, custodia, responsables, validaciones, rechazos y recibos para cada elección.                                                   |
| **P1**    | **JWT en el navegador y CSP.** Un XSS podría leer la sesión guardada en `sessionStorage`.                                                          | La CSP observada permite scripts inline.                                                                                                                                       | Se redujo exposición general y no se registran tokens, pero `script-src 'unsafe-inline'` sigue presente por la integración actual con Next.js.                                                                                                                                                                                                                                                                                                                       | Adoptar nonces/hashes compatibles con Next.js o un diseño de cookie `HttpOnly` con CSRF explícito; someter el cambio a pruebas de penetración antes de afirmar cierre.                     |
| **P1**    | **Sesiones y recuperación.** El coordinador que pierde el teléfono no puede quedar por fuera; el exempleado no puede conservar acceso.             | Recuperación de contraseña es informativa y depende de un administrador.                                                                                                       | MFA está cifrado y exige reautenticación; `authVersion` invalida JWT al cerrar sesión y el último contador TOTP aceptado se persiste con control de concurrencia.                                                                                                                                                                                                                                                                                                    | Proveedor de identidad/correo, verificación de email, recuperación con doble control, códigos de recuperación y simulacro de revocación en todas las réplicas.                             |
| **P1**    | **Promesas y compromisos sin expediente de cumplimiento.** Marcar 100 % no demuestra ejecutar una política pública.                                | No se comprobó evidencia ni aprobación independiente del resultado.                                                                                                            | Estado sólo avanza, contenido publicado queda inmutable, cambios de responsable/progreso se auditan y una propuesta sólo se borra como borrador; existe snapshot al comprometerla.                                                                                                                                                                                                                                                                                   | Exigir entregables, indicadores, fuente, corte, evidencia, responsable y cuatro ojos antes de declarar completado un compromiso o propuesta.                                               |
| **P1**    | **Abuso y fuerza bruta distribuidos.** Un límite por proceso/IP no resiste botnets ni réplicas.                                                    | Rate limit observado, sin evidencia de coordinación distribuida.                                                                                                               | Validación y controles locales reforzados.                                                                                                                                                                                                                                                                                                                                                                                                                           | Redis compartido, límites por cuenta/tenant/IP, backoff, alertas y playbook de desbloqueo.                                                                                                 |
| **P2**    | **Controles decorativos o promesas prematuras.** Una función anunciada sin backend mina la confianza del equipo.                                   | Ctrl+K no hacía nada; PWA y varias rutas estaban ausentes; la recuperación prometía un proceso manual.                                                                         | Paleta, enlaces profundos, rutas, PWA y mensajes honestos se incorporaron; se retiró la promesa de API de planes que no la incluyen.                                                                                                                                                                                                                                                                                                                                 | Ninguna función debe anunciarse antes de tener endpoint, autorización, observabilidad, prueba y responsable operativo.                                                                     |

## 4. Lo observado en producción: despliegue viejo

### Funciona

- Las doce entradas principales de la barra lateral navegaron y las rutas base cargaron sin errores de consola en el recorrido normal.
- La vista móvil de 390 × 844 no mostró desbordamiento horizontal en el muestreo.
- Las rutas privadas redirigieron al inicio de sesión cuando se consultaron anónimamente.
- HTTPS, activos básicos, CORS y limitación general de peticiones respondieron en las pruebas no destructivas.
- Formularios de incidentes, tareas, eventos, comunicaciones, ajustes y equipo rechazaron datos vacíos sin crear registros.
- Territorio permitió búsqueda, paginación y consulta del catálogo cargado.
- Personas quedó correctamente cerrado cuando no había aviso de privacidad activo.

### Falla o no está conectado

- Perfil operativo, bandeja, facturación y propuestas devolvieron acceso restringido porque el despliegue no contiene los contratos actuales.
- Dieciocho endpoints esperados por el candidato local no existen en producción, entre ellos MFA, planes/suscripción/uso, perfil operativo, bandeja, propuestas, exportación/importación, firma electrónica y administración SaaS.
- La ruta de nueva persona redirigió al listado en lugar de ofrecer un alta utilizable.
- La paleta Ctrl+K no produjo acción.
- Manifest, service worker, página offline e icono PWA devolvieron 404.
- El filtro de mesa aceptó un valor fuera de contrato, mostró el mensaje técnico “mesa must not be greater than 99999”, desmontó los filtros y quedó reintentando hasta recargar.
- La recuperación de cuenta no recupera una cuenta: solo explica que se contacte a un administrador.
- El endpoint de readiness revelaba el estado de conexión de base de datos; la raíz API respondía “Hello World”; se exponían cabeceras de tecnología y una CSP permisiva con unsafe-inline.

### No hace nada útil en la realidad si se deja así

- Un borrador financiero sin conciliación ni expediente de soportes no sirve como prueba de reporte al CNE.
- Un registro de “firma” o contacto GSC sin formulario oficial, serial y custodia no sirve como apoyo electoral.
- Un reporte de mesa sin credencial, tipo de formulario, desglose y reclamación no basta para defender una inconsistencia.
- Una PWA que solo abre una pantalla offline, sin guardar trabajo pendiente, no resuelve la operación territorial.
- Un caso ciudadano sin término legal y alertas de vencimiento no permite dirigir una PQRSD seria.

## 5. Corregido en el candidato local

Estas correcciones están en el candidato y superaron la validación técnica local y la validación CI remota del árbol de código equivalente descritas abajo. Esto no significa que estén desplegadas ni que se hayan probado con credenciales, proveedores y datos reales:

- **Navegación:** enlaces profundos conservan ruta y consulta después del login sin aceptar redirecciones externas; paleta de comandos, rutas faltantes, páginas de no encontrado y skip links.
- **War room:** mesa limitada a 1–99999, mensajes en español, filtros estables y recuperación del error; el tablero electoral queda reservado a candidaturas porque su métrica escalar no representa partidos, listas o GSC.
- **Personas y privacidad:** aviso activo obligatorio, consentimiento vigente/reconsentimiento, máximo controlado e importación CSV cuya vista previa y ejecución comparten validador; la ejecución vuelve a validar el estado vivo, por lo que no es un snapshot byte a byte de la vista previa. La importación exige evidencia confirmada subida directamente por URL firmada. El alta individual conserva por ahora una atestación del operador, no un objeto probatorio emitido por el titular ni una manifestación demostrada por canal/OTP.
- **Comunicaciones:** expediente mínimo de autorización, fuente, segmentación, IA, mecanismo de derechos y referencia verificable para opt-in directo; los mensajes que el operador declara sensibles no pueden disfrazarse de audiencia pública. La clasificación de sensibilidad sigue siendo humana: no existe un detector semántico que permita omitir revisión.
- **Finanzas:** expediente de configuración electoral y bloqueo de hitos si faltan datos críticos; se diferencia el borrador interno de una referencia externa declarada, que exige soporte privado confirmado y se advierte expresamente que no constituye ni demuestra rendición o radicación oficial.
- **Testigos:** credencial, check-in, tipo de E-14, votos válidos/blancos/nulos/no marcados, causal y descripción de reclamación; revisión separada y un acta aceptada por mesa.
- **GSC:** texto y métricas corregidos para no confundir contactos con apoyos o firmas válidas ni presentar la plataforma como sustituto de la Registraduría.
- **Campaña vs. función pública:** los incidentes internos generan referencias `INC-CAM`; los registros de atención en gestión pública usan `CAS-GP` y se declaran internos, evitando fingir una PQRSD oficial.
- **Seguridad:** MFA cifrado con AES-256-GCM, rotación y reautenticación; `authVersion` revoca JWT y el control persistente impide repetir TOTP; firma electrónica ligada a tenant, usuario, recurso y evidencia de almacenamiento; administrador SaaS por ID inmutable; invitaciones no pueden crear otro ADMIN; seeds de demostración fallan cerrados.
- **Multitenancy:** la revisión enfocada no encontró una consulta operativa HTTP concreta que omitiera el tenant del JWT; las relaciones compuestas y el almacenamiento canónico incluyen aislamiento. Esto es evidencia de revisión, no una certificación de ausencia de fallas.
- **Producto:** perfil operativo, bandeja, propuestas, plan/suscripción interna, cuotas de uso, importación, PWA y búsqueda global están conectados localmente; no existe todavía pasarela, cobro ni factura y la interfaz no debe insinuarlos. No se anuncia acceso API cuando el plan no lo incluye y sólo se borran propuestas en borrador.
- **Código huérfano:** se retiraron un asistente de onboarding obsoleto, un cascarón y un diálogo sin consumidores; el falso módulo de empalme no se carga y el motor de retención no se conecta hasta tener una política aprobada y ejecución segura.
- **Despliegue:** guard de entorno y migraciones fail-closed, identidad física de base, readiness estructural, contenedores de solo lectura, usuarios separados, límites de recursos/logs y cierre ordenado. La topología separada de Compose sigue siendo la recomendada.
- **Exposición:** health check mínimo, raíz API adecuada y cabeceras de tecnología desactivadas en el candidato.
- **Cadena de suministro:** Next.js 16.3.4, sharp 0.35.4 y Turbo 2.9.14 incorporan las correcciones de seguridad revisadas; las GitHub Actions y las imágenes Node/PostgreSQL están fijadas por SHA o digest; Corepack usa la especificación de pnpm con integridad en Docker; los scripts de instalación tienen aprobación explícita y cerrada; Dependabot quedó configurado para npm, Docker y Actions cuando el archivo se promueva a la rama predeterminada.
- **Riesgo residual de suministro:** `apk add` todavía resuelve paquetes desde índices Alpine mutables, `pnpm dlx` resuelve una versión exacta fuera del lockfile y los paquetes de sistema de Playwright dependen de los repositorios del runner. El digest PostgreSQL usado como servicio de Actions exige además renovación manual verificable. Por ello el build está endurecido, pero no debe describirse como completamente hermético.

### Evidencia técnica del candidato local

- API: 105 suites y 1.094 pruebas aprobadas; 1 suite y 10 pruebas PostgreSQL omitidas deliberadamente en esa corrida. La suite PostgreSQL se ejecutó aparte contra PostgreSQL 16 desechable y aprobó 10 de 10, para impedir que una prueba mal clasificada toque una base real.
- Web: 89 de 89 pruebas unitarias y 172 de 172 recorridos Playwright aprobados en escritorio y móvil, sin reintentos y ejecutando el servidor standalone equivalente al artefacto de producción.
- HTTP: 3 de 3 pruebas e2e de API aprobadas.
- Despliegue: 84 de 84 pruebas del contrato de migración, entorno, imágenes, procedencia del artefacto, seguridad del repositorio y supervisor; TypeScript, lint y builds de API/web aprobados; auditorías de todas las dependencias y de producción, desde severidad baja, sin vulnerabilidades conocidas.
- Migración: 18 migraciones aplicadas en una base desechable, deriva cero, invariantes críticas presentes e idempotencia comprobada. Las migraciones multisentencia nuevas están delimitadas por transacción explícita; una inyección de fallo después del DDL y antes del `COMMIT` dejó en cero los objetos, el trigger y el registro de migración, demostrando el rollback atómico.
- Contenedor combinado: la primera prueba física detectó que faltaba el binario `schema-engine` de Prisma en la imagen final; se corrigió y la imagen final encontró las 18 migraciones sin pendientes, alcanzó readiness y respondió 200/401/404 según contrato. API y web corrieron como UID 1001/1002, sin capacidades efectivas, con `NoNewPrivs=1`, raíz de solo lectura, límites y rotación de logs; el proceso web recibió cero variables protegidas del servidor y el supervisor cerró con código 0.
- Topología separada recomendada: migrador con salida 0; API y web saludables; respuestas 200/401/404 esperadas; procesos UID 1001, `NoNewPrivs=1`, capacidades efectivas en cero, raíz de solo lectura, límites y rotación de logs; API cerró con código 0 y Next.js con 143 al recibir `SIGTERM`.
- Observabilidad: 401/404 esperados ya no se registran como fallos internos; quedan en advertencia y los 5xx conservan nivel de error y traza.
- CI remoto: la [corrida #30](https://github.com/ServiLut/politica-sostenible/actions/runs/34292792376) sobre `d10e8db48ee806a4200ac541147ead42eca4bc70` terminó verde en `test-and-build` y `compose-runtime-smoke`. Se verificó que su árbol de código y configuración equivale al commit privado `4d47956de16aa4f0175fa27639efd88692ce5408`, con diferencias limitadas a los tres documentos privados de auditoría. El commit documental que contiene este informe es posterior y no altera código ni configuración.

Estas cifras corresponden al candidato identificado por los SHA anteriores, no a la versión vieja actualmente desplegada. Los gates se repitieron en CI remoto, pero todavía deben ejecutarse en staging equivalente y mediante smoke tests posteriores al despliegue antes del corte.

## 6. Exigencia regulatoria y operativa por dominio

### Finanzas, CNE y Cuentas Claras

El CNE presenta [Cuentas Claras](https://www.cne.gov.co/cuentas-claras) como mecanismo oficial y obligatorio para el registro de ingresos y gastos. Su guía de [informes de ingresos y gastos de campaña](https://www.cne.gov.co/informes-de-ingresos-y-gastos-de-campana) exige soportes, libro, formularios y responsabilidades distintas para candidaturas y organizaciones; describe, como regla general, un mes para que la candidatura reporte a la organización y dos meses para que esta presente el consolidado después de la elección. La [Ley 1475 de 2011](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=43332) da el marco general. El calendario concreto siempre debe confirmarse para la elección aplicable.

Por tanto:

- Los topes, códigos, elección, alcance y plazos no deben quedar hardcodeados como una regla universal; cambian por elección y acto vigente.
- “Exportado” debe significar borrador producido por el sistema. Una referencia y su soporte aportados sobre un movimiento son sólo una anotación interna: la rendición oficial ocurre sobre informes y consolidados cuya granularidad y responsables define el CNE.
- Faltan el modelo de informe/consolidado y sus versiones, conciliación bancaria, donaciones en especie, cuentas por pagar, consecutivos/documentos soporte, control de correcciones y cierre contable completo.
- La plataforma ayuda a preparar evidencia; no reemplaza al gerente, contador, organización política ni aplicativo oficial.

### Protección de datos y comunicaciones políticas

La SIC, en su [Circular Externa 002 de 2026 y comunicado oficial](https://sedeelectronica.sic.gov.co/comunicado/la-sic-expidio-instrucciones-sobre-proteccion-de-datos-personales-en-el-contexto-electoral), exige especial cuidado con autorización previa e informada, avisos en cada canal, datos sensibles, perfilamiento político, transparencia de fuente/segmentación/IA y mecanismos efectivos para ejercer derechos. También advierte contra incorporar personas a listas o grupos sin autorización.

Por tanto:

- Una lista comprada, un número obtenido de un grupo o la pertenencia supuesta a una comunidad no equivalen a opt-in.
- La revocatoria debe bloquear futuras campañas en todos los proveedores, no solo cambiar un campo local.
- Deben existir retención, eliminación, exportación, corrección y trazabilidad de la fuente por tenant y finalidad.
- El candidato local mejora la autorización de solicitudes; aún falta demostrar supresión efectiva end-to-end con proveedores reales.

### Testigos y día electoral

La [Registraduría explica las funciones de testigos electorales](https://www.registraduria.gov.co/-Testigos-Electorales-articles-1036-.html): acreditación, presencia por mesa o comisión, observación, reclamaciones escritas y límites de actuación. Los formularios E-15, E-16, E-11, E-14 y E-24 tienen funciones distintas.

Por tanto:

- El sistema debe identificar quién estaba acreditado, dónde, cuándo y sobre qué documento reportó.
- Una foto debe conservar hash, origen, versión, acceso y revisión; OCR o transcripción nunca deben presentarse como resultado oficial.
- La operación necesita cuatro ojos, divergencias visibles, supersesión trazable y capacidad offline real.
- Falta un simulacro completo desde check-in hasta consolidación y reclamación, con pérdida de red y reintentos.

### PQRSD y ejercicio del cargo

La [Ley 1755 de 2015](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=65334) contempla, como punto de partida general, 15 días para peticiones, 10 para información o documentos y 30 para consultas, además del manejo de la imposibilidad excepcional de responder dentro del término. La clasificación, las excepciones y el cómputo de días hábiles deben validarse; un contador simple de días calendario puede ser jurídicamente engañoso.

Por tanto:

- Se requiere clasificación, calendario de días hábiles, reglas versionadas, vencimiento, prórroga motivada, traslado por competencia y constancia de notificación.
- Debe mantenerse separación estricta entre datos y finalidades de campaña y de función pública.
- Casos y compromisos actuales son una base operativa, no un sistema PQRSD completo.

### Grupos significativos de ciudadanos

El producto ya evita afirmar que la captura territorial recoge apoyos electorales. Falta un módulo especializado solo si el dueño decide competir en este dominio y una revisión por elección confirma el procedimiento aplicable. Como mínimo necesitaría inventario de formularios/seriales, responsables, entregas y devoluciones, custodia, novedades, validación, lotes de radicación y recibos. No debe reutilizar consentimiento de CRM como supuesto apoyo ni copiar datos a campaña sin finalidad válida.

### Operación territorial y offline

El shell PWA es una mejora de disponibilidad, pero no alcanza. La realidad exige:

- almacenamiento local cifrado y mínimo;
- cola de operaciones idempotentes con estado visible;
- reanudación de archivos y sincronización por lotes;
- resolución explícita de conflictos y duplicados;
- borrado al cerrar sesión o revocar el dispositivo;
- mapas/catálogos disponibles sin conexión y pruebas en dispositivos de gama baja;
- canal alterno y protocolo manual cuando la tecnología falle.

## 7. Pendiente por decisión o proveedor externo

No debe simularse ninguna de estas capacidades:

- Proveedor de correo/identidad para verificación de email, recuperación segura y alertas.
- Redis compartido y política de seguridad para rate limiting distribuido, sesiones/revocación y trabajos en segundo plano.
- Proveedores de WhatsApp, SMS y correo, con webhooks, bajas, rebotes, plantillas, costos y conciliación de entrega.
- Pasarela de pagos y flujo legal/contable para aportes o donaciones.
- Integraciones oficiales con Cuentas Claras, Registraduría u otras autoridades; hoy no existen y no deben anunciarse.
- Modelo y flujo de informe financiero consolidado, versiones/correcciones, firmas y aceptación separada de gerente y contador; la anotación actual por movimiento no lo sustituye.
- Fuente y responsable de actualizar topes, códigos, calendarios electorales, DIVIPOLA/DIVIPOLE y días festivos/hábiles.
- Política aprobada de retención, incidentes de datos, atención de derechos y transferencia a proveedores.
- Evidencia de autorización emitida por el titular (canal, desafío/OTP o documento, contenido/versionado, fecha y revocación); una atestación del operador no basta para disputas de alto riesgo.
- Expediente de cumplimiento para propuestas y compromisos con indicador, línea base, meta, fuente, corte, soporte y aprobación independiente.
- Responsable jurídico/electoral, contador, gerente de campaña y dueño de PQRSD que firmen criterios de aceptación. Si no se decide construir PQRSD, el producto debe conservar siempre la denominación de atención interna.
- Arquitectura de alta disponibilidad, observabilidad y aislamiento para la VPS o su reemplazo.

## 8. No probado por seguridad

La auditoría de producción fue deliberadamente no destructiva. No se realizaron:

- altas, cambios o eliminaciones reales de personas, finanzas, testigos, casos, equipo o configuración;
- invitaciones, restablecimientos de terceros, cambios de rol ni bloqueos de cuentas reales;
- envíos de WhatsApp/SMS/email, cobros, pagos, donaciones o firmas externas;
- cargas de evidencia real ni validación de archivos con información personal;
- aprobación de comunicaciones o actas, salvo la generación de un borrador interno CNE ya auditado;
- pruebas de intrusión, carga sostenida, caos, corte de red, pérdida de nodo o restauración de backup;
- presentación ante Cuentas Claras, radicación ante Registraduría o respuesta formal a una PQRSD;
- prueba de fuga entre dos tenants reales de producción.

Estas pruebas deben hacerse con datos sintéticos, cuentas controladas y un tenant desechable. Omitirlas fue una medida de seguridad, no evidencia de que los flujos funcionen.

## 9. Criterios obligatorios de salida a producción

No hay “go” mientras falte uno de los siguientes puntos:

1. **Versión única:** frontend, API y migraciones identificables por commit; cero 404 para contratos publicados y cero rutas antiguas incompatibles.
2. **Gates verdes:** pruebas unitarias, integración PostgreSQL, HTTP e2e, Playwright desktop/móvil, builds y escaneo de dependencias repetidos sobre el commit de código candidato; cualquier diferencia posterior debe ser exclusivamente documental y quedar demostrada.
3. **Migración segura:** inventario de checksums por schema, backup restaurado, ensayo sobre copia desechable, tiempo medido y recuperación documentada; ningún binario viejo convive con la base migrada.
4. **Configuración:** JWT y claves MFA rotadas, secretos fuera del repositorio, IDs SaaS reales, Supabase/Redis/proveedores separados por ambiente y validación fail-closed al arrancar.
5. **Tenant de prueba:** recorridos por CANDIDACY, PARTY, GSC y PUBLIC_OFFICE y por cada rol, verificando tanto capacidades permitidas como denegaciones por dominio; incluir lecturas y mutaciones reversibles.
6. **Seguridad crítica:** invitaciones, cambios de rol, MFA, recuperación, cierre/revocación de sesión, TOTP no reutilizable, rotación de claves, archivos privados y aislamiento tenant probados con concurrencia.
7. **Operación electoral:** simulacro con mesa, credencial, E-14 ficticio, doble revisión, divergencia, reclamación, offline, reintento y consolidación sin duplicados.
8. **Finanzas:** informe/consolidado sintético conciliado de inicio a cierre; fuente vigente de topes/códigos/plazo; el resultado se etiqueta como borrador y una referencia por movimiento nunca como radicación automática.
9. **Datos y mensajes:** aviso versionado, prueba de autorización, fuente, segmentación, IA, baja y derechos; la revocación debe llegar al proveedor antes de un nuevo envío.
10. **PQRSD:** si entra al alcance, calendario validado, alertas, prórrogas/traslados, respuesta firmada, constancia de entrega y separación campaña–función pública; hasta entonces sólo atención interna.
11. **Disponibilidad:** monitoreo, alertas, límites de recursos, backups, restauración ensayada, runbooks, responsables y canal manual de contingencia.
12. **Prueba posterior al despliegue:** smoke autenticado y anónimo, cabeceras/health, errores sin trazas, métricas, colas y navegación; ventana de observación y decisión de corrección hacia adelante o restauración con RPO explícito.

## 10. Decisión recomendada

La decisión responsable es **no desplegar directamente sobre producción ni declarar terminado el producto**. Deben conservarse inmutables el commit de código candidato y su evidencia CI; cualquier cambio de código, configuración o lockfile obliga a repetir todos los gates. Antes del corte aún se debe inventariar la base real, restaurar y ensayar su backup, desplegar el mismo digest en un ambiente equivalente con tenant desechable y completar los escenarios críticos. El corte posterior debe hacerse en mantenimiento, drenando la versión anterior e iniciando únicamente el mismo commit que migró la base; no mediante rollout gradual de binarios incompatibles.

La plataforma puede convertirse en una herramienta seria si mantiene una regla: cada botón debe producir un resultado comprobable, cada resultado debe tener responsable y evidencia, y ninguna etiqueta debe prometer una actuación oficial que ocurrió fuera del sistema.

Este documento complementa [Estrategia de producto 2026](./ESTRATEGIA_PRODUCTO_2026.md); no reemplaza la validación jurídica, electoral, contable, de protección de datos ni de seguridad previa a cada elección.
