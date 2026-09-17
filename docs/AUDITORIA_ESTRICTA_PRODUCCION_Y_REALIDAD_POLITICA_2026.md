# Auditoría estricta de producción y realidad política colombiana 2026

> Corte documental: 10 de septiembre de 2026. La evidencia productiva citada
> corresponde al despliegue observado hasta el 9 de septiembre de 2026.
>
> Veredicto: **la versión que continúa en producción no está lista para una
> operación política crítica y el candidato local aún no está autorizado para
> reemplazarla**. El candidato local resuelve una parte sustancial de los
> hallazgos, pero todavía no ha pasado por restauración ensayada, staging
> equivalente ni despliegue controlado. Este documento no certifica cumplimiento
> jurídico, electoral, contable, de seguridad o de protección de datos.

## 1. Cómo leer el estado

Esta auditoría separa estados que no pueden usarse como sinónimos:

- **Producción observada:** comportamiento comprobado de forma no destructiva
  sobre la versión antigua.
- **Candidato local:** código y controles presentes en el monorepo. No implica
  que estén desplegados, configurados con servicios reales ni aceptados por una
  autoridad.
- **Pendiente de verificación:** existe una implementación, pero falta cerrar
  los gates finales sobre un commit y digest inmutables.
- **Pendiente externo:** exige autorización de fuente, proveedor, credenciales,
  decisión institucional o validación profesional.
- **No probado por seguridad:** se evitó mutar datos reales, enviar mensajes,
  mover dinero, radicar actuaciones o ejecutar pruebas destructivas.

La evidencia saneada está en:

- [auditoría productiva inicial](./evidence/AUDITORIA_PRODUCCION_2026-09-07.md);
- [auditoría autenticada no destructiva](./evidence/AUDITORIA_PRODUCCION_NO_DESTRUCTIVA_2026-09-09.md);
- [exposición externa observada](./evidence/INFRAESTRUCTURA_EXTERNA_2026-09-08.md);
- [infraestructura Dokploy observada](./evidence/INFRAESTRUCTURA_DOKPLOY_2026-09-09.md).

Los recorridos por ciclo y el criterio de aceptación están en la
[matriz operativa](./MATRIZ_OPERATIVA_CICLO_ELECTORAL_2026.md) y el
[simulacro integral](./SIMULACRO_INTEGRAL_CICLO_ELECTORAL.md).

## 2. Diagnóstico ejecutivo

Un dirigente experimentado no evalúa el producto por la cantidad de pantallas,
sino por continuidad, responsabilidad, evidencia, control territorial y
capacidad de responder después. Bajo ese estándar:

- **Producción está rezagada.** Varias rutas y contratos del candidato local no
  existen en el despliegue actual. El manifest y el service worker respondieron
  404, por lo que allí no hay PWA instalable ni continuidad offline.
- **Producción no tiene universo electoral operativo.** El inventario
  autenticado encontró geografía administrativa, pero cero puestos electorales.
  Por tanto, zonas, puestos, mesas, asignaciones y cobertura real de Día D no
  pueden considerarse habilitados.
- **La carga electoral no puede improvisarse.** El candidato local ya tiene
  releases inmutables, parser, worker, cuarentena, diferencias y aprobación de
  cuatro ojos. Sin embargo, ninguna fuente RNEC debe descargarse, almacenarse o
  activarse para el SaaS hasta acreditar autorización o licencia de
  reutilización y resolver las ambigüedades del archivo.
- **La continuidad offline es acotada, no universal.** El candidato local
  ofrece shell PWA, bóveda AES-GCM y comandos idempotentes para captura
  territorial, E-14 e incidentes, además de snapshots de mapa de calor y
  calendario. El resto del dashboard exige conectividad y el dispositivo debe
  preaprovisionarse antes de perder la red.
- **La integridad de archivos estaba sobreafirmada.** Salvo el importador del
  catálogo electoral, Nest no descarga ni recalcula los bytes subidos
  directamente a Storage. Los SHA esperado y reportado proceden del cliente;
  sirven para continuidad e idempotencia, no como atestación independiente. La
  interfaz y los contratos locales ahora lo declaran, pero la verificación de
  contenido sigue siendo un bloqueo P0 de salida.
- **La operación completa existe como controles internos.** Firmas GSC,
  calendario, cobertura de testigos, E-14, incidentes, escrutinio, cierre
  financiero, retención y PQRSD tienen contratos locales más estrictos. Ninguno
  sustituye una radicación, certificación, firma, notificación o decisión
  externa.
- **No existe todavía una salida segura.** Falta demostrar restauración de
  PostgreSQL y Storage desde un respaldo externo, levantar staging equivalente,
  ejecutar el simulacro humano y promover exactamente el artefacto aprobado.
- **La VPS sigue siendo un riesgo de concentración.** La indisponibilidad
  simultánea reportada de cuatro sitios no tiene causa raíz demostrada. El
  candidato de software no corrige por sí mismo firewall, capacidad,
  observabilidad, aislamiento ni recuperación de la infraestructura.

## 3. Hallazgos exigentes y respuesta real

| Severidad | Riesgo real | Producción observada | Candidato local | Cierre requerido |
| --- | --- | --- | --- | --- |
| **P0** | Desfase entre frontend, API y esquema | Rutas nuevas ausentes y contratos no atribuibles a un commit/digest visible | Guardas de contrato, esquema y revisión disponibles | Restaurar copia, migrar en staging, ejecutar todos los gates y desplegar una sola versión compatible |
| **P0** | Universo de zonas, puestos y mesas vacío | No hay puestos electorales operativos | Catálogo versionado, importación en worker, cuarentena, diff, proyección y doble aprobación | Obtener autorización/licencia, cargar una fuente apta, resolver ambigüedades y verificar una única proyección activa |
| **P0** | Cierre de operación con obligaciones abiertas | La versión vieja no demuestra cierre integral | Readiness financiero compartido por tablero, cierre y empalme; escrutinio e incidentes también bloquean | Ensayo sintético completo y validación profesional de criterios |
| **P0** | Cadena de evidencia de Día D | Una entrada inválida llegó a exponer un error técnico | Cobertura temporal exacta, E-14 conectado/offline, hash, revisión y divergencias | Simulacro con actas ficticias, red intermitente, reemplazos y revisión jurídica/electoral |
| **P0** | Falsa seguridad sobre integridad de archivos | No se probó una suma independiente de los binarios | Claims corregidos; respuestas de sellado exponen `contentIntegrity: UNVERIFIED`; sólo el importador electoral recalcula bytes | Incorporar un verificador independiente compatible con la arquitectura o aceptar formalmente el límite con controles humanos; no anunciar huella documental verificada |
| **P0** | Pérdida o corrupción durante migración | No se inventarió la historia real de `_prisma_migrations` ni se restauró un respaldo externo | Migración fail-closed, identidad de base y marca exacta de esquema | Inventario por schema, restauración física ensayada, deriva cero y plan de reversión |
| **P0** | Caída compartida de la VPS | Incidente de cuatro sitios y exposición observada de superficies administrativas | Contenedores y health checks endurecidos en configuración local | RCA, firewall, límites, alertas, aislamiento, backup externo y prueba de desastre |
| **P0** | Datos políticos y contacto no autorizado | No se probó propagación de bajas a proveedores | Finalidad, fuente, segmentación, IA, consentimiento y revisión interna | Integrar proveedores reales y demostrar supresión antes del siguiente envío |
| **P1** | Operación rural o congestionada sin red | PWA ausente | PWA instalable y bóveda cifrada sólo para flujos definidos | Prueba prolongada en dispositivos reales, capacidad, expiración, revocación y canal manual |
| **P1** | Finanzas presentadas como “oficiales” | Sólo se observó un borrador interno | Expediente versionado, extracto, conciliación, cuentas por pagar, controles independientes y evidencia externa revisada | Validar reglas vigentes y ejecutar la presentación fuera del sistema; nunca inferir radicación |
| **P1** | GSC confundido con CRM | La versión antigua podía inducir una lectura ambigua | Expediente de formularios/lotes/custodia y correcciones compensatorias auditadas | Validación del procedimiento aplicable y actuación real ante la autoridad |
| **P1** | PQRSD ficticia | El módulo antiguo de casos no demostró términos ni entrega | Expediente PQRSD separado para `PUBLIC_OFFICE`, reglas versionadas, ACL y workflow completo | Validación escrita de la entidad e integración real de radicación, firma y notificación |
| **P1** | XSS y robo de sesión | La política observada permitía scripts inline | CSP con nonce y `strict-dynamic`; sólo estilos conservan `unsafe-inline` | El JWT sigue en `sessionStorage`: se requiere hardening adicional y prueba de penetración |
| **P1** | Fuerza bruta distribuida | No había evidencia de coordinación entre réplicas | Throttle distribuido con Redis en el candidato local | Configurar Redis productivo, alertas y degradación segura |
| **P1** | Recuperación de cuenta | Depende de intervención administrativa | Revocación de JWT, MFA y control de TOTP reforzados | Falta recuperación autoservicio/proveedor de correo y procedimiento de doble control para pérdida del único administrador |
| **P1** | Retención entendida como borrado ejecutado | No se demostró disposición | Planes, holds, revisiones y estado terminal `APPROVED_NOT_EXECUTED` | No hay borrado destructivo de PostgreSQL/Storage; sólo habilitarlo tras política, backup y ensayo irreversible |
| **P1** | Gestión pública incompleta | No existe operación institucional demostrada | Separación de tenant y PQRSD local segura | Faltan expediente de compromisos públicos, agenda legislativa y transferencia formal registro por registro |
| **P2** | Botones o promesas sin efecto | Se observaron rutas ausentes y funciones incompletas | Navegación y mensajes honestos mejorados | Cada control debe conservar endpoint, autorización, resultado visible, auditoría y recuperación |

## 4. Qué funciona y qué no en la producción antigua

La inspección productiva fue de solo lectura. Funcionaron autenticación,
navegación básica y las rutas detalladas en la evidencia enlazada. También se
observaron razones visibles en controles deshabilitados, lo cual es preferible a
un botón silencioso.

No quedó demostrado en producción:

- instalación PWA, service worker o acceso offline;
- catálogo de zonas, puestos y mesas, pues no hay puestos cargados;
- cobertura completa de testigos o entrada válida a Día D;
- bóveda offline de territorio, E-14 o incidentes;
- calendario electoral versionado;
- circuito GSC de formularios, custodia y correcciones;
- expediente de escrutinio;
- cierre financiero integral;
- retención gobernada;
- expediente PQRSD institucional;
- throttle distribuido, CSP con nonce o contrato nuevo de esquema;
- restauración, staging, carga sostenida o recuperación de desastre.

La prueba de humo posterior confirmó que el sitio y readiness volvían a
responder, pero los recursos PWA seguían ausentes. Disponibilidad puntual no
equivale a corrección funcional.

## 5. Estado cualitativo del candidato local

### Ciclo, autoridad y separación de funciones

El perfil modela exploración, precampaña, firmas, campaña, preparación,
simulación, jornada, poselección y cierre. El avance ordinario **no tiene cuatro
ojos universales**: lo ejecuta un actor autorizado, sujeto al grafo irreversible,
al readiness y a auditoría. La adopción de una operación ya iniciada y la
terminación excepcional sí requieren solicitud y revisión por una persona
distinta. Los subprocesos de alto riesgo conservan sus propias matrices de
revisión.

### Calendario, territorio y catálogo

El calendario usa paquetes versionados, responsables, suplentes, vigencia,
fuente y snapshots offline. La geografía administrativa DANE no se confunde con
DIVIPOLE. El catálogo electoral admite staging, parser, worker, cuarentena,
diferencias, cuatro ojos y proyección versionada, pero permanece deliberadamente
sin una fuente RNEC activada mientras no exista autorización/licencia.

La puerta a Día D exige, como conjunto:

1. fecha dentro de la ventana electoral aplicable;
2. exactamente una proyección electoral activa;
3. al menos un puesto proyectado;
4. mesas esperadas válidas por puesto;
5. ventana de cobertura completa para cada puesto;
6. cobertura de cada mesa esperada por testigo principal y respaldo.

Un conteo global de testigos no satisface esa puerta.

### PWA, offline y mapas de calor

El candidato es instalable como PWA, pero no replica todo el sistema. El shell y
los flujos explícitos de captura territorial, E-14 e incidentes pueden trabajar
con una bóveda local AES-GCM. Los comandos conservan identidad, hash, recibos y
conflictos; al sincronizar se revalidan tenant, rol, grant y estado vivo.

Los mapas de calor agregan actividad/cobertura con supresión de muestras pequeñas
y proyección geográfica. También existe snapshot offline de mapa y calendario.
El snapshot es informativo, puede quedar obsoleto y no autoriza una captura si el
grant no está vigente. El usuario debe instalar, provisionar y desbloquear el
dispositivo con red antes de salir a campo.

### GSC, testigos, E-14 y escrutinio

GSC dispone de expediente, formularios/seriales, entregas, devoluciones, lotes,
conteos y custodia. Las correcciones nunca reescriben el pasado: proponen una
fotografía compensatoria completa, exigen controles independientes según el
riesgo y mantienen cuarentena cuando corresponde. Ninguna cifra local convierte
un apoyo en válido ni prueba radicación.

Testigos y E-14 registran credencial, asignación, ventana, mesa, desglose,
archivo privado, SHA declarado cuando aplica, revisión y divergencias. La
captura offline usa un grant acotado y sincronización idempotente, pero el SHA
de evidencia continúa siendo una declaración del mismo cliente. Escrutinio
conserva comisiones, sesiones,
documentos, discrepancias, reclamaciones, versiones y evidencia externa revisada;
no calcula ganadores ni ejecuta una reclamación ante la autoridad.

### Finanzas y cierre

El mismo evaluador de readiness debe alimentar el tablero financiero, el cierre
ordinario y el expediente de empalme. Debe bloquear, con los mismos códigos
resolubles, cuando falte:

- configuración de cumplimiento o fecha límite;
- versión válida del dossier/informe;
- movimientos pendientes **o aprobados todavía no reportados**;
- extracto bancario y conciliación;
- resolución de cuentas por pagar;
- los tres controles independientes exigidos;
- evidencia externa confirmada y revisada por otra persona.

Las correcciones son compensatorias y versionadas. Una referencia externa y un
archivo prueban sólo lo que el operador registró; no demuestran presentación,
aceptación o cumplimiento ante el CNE.

### Retención y gestión pública

Retención permite inventariar, proponer, revisar, aplicar legal holds y llegar a
`APPROVED_NOT_EXECUTED`. Ese nombre es intencional: no existe un worker que
destruya datos u objetos y el producto no debe afirmar que ya eliminó.

El expediente PQRSD opera localmente sólo para `PUBLIC_OFFICE` con reglas
versionadas, datos personales separados y enmascarados, competencia, asignación,
suplencia, traslado, prórroga, respuestas versionadas, revisión, autorización,
intentos de entrega, cierre y reapertura. No radica, firma, notifica ni consulta
un sistema institucional. Véanse
[arquitectura PQRSD segura](./PQRSD_GESTION_PUBLICA_SEGURA.md) y
[protocolo PQRSD](./PROTOCOLO_PQRSD_GESTION_PUBLICA.md).

### Seguridad, multitenancy y base

Nest mantiene Prisma y lógica de negocio; el frontend consume la API. Los
recursos operativos se aíslan por tenant derivado del JWT y Storage usa rutas
por tenant con subida directa firmada.

El runtime de base exige conexión directa con estado de sesión para fijar
`search_path` al schema de la aplicación y `pg_catalog`. Se rechazan poolers de
transacción —incluido el puerto convencional 6543— porque no conservan esa
garantía. Readiness comprueba identidad y versión exacta del esquema. Esto no
sustituye el inventario de la base productiva.

La CSP usa nonce y `strict-dynamic` para scripts. `style-src 'unsafe-inline'` y
el JWT en `sessionStorage` siguen siendo riesgos residuales explícitos. El
throttle distribuido depende de Redis configurado y saludable en el ambiente.

## 6. Evidencia histórica y gates del candidato actual

Las cifras antiguas de suites, pruebas, recorridos Playwright, migraciones,
imágenes y la corrida CI #30 corresponden a un candidato anterior. Sirven como
**evidencia histórica**, no como resultado del árbol actual, porque después se
incorporaron módulos y migraciones. No deben reutilizarse en un acta de salida.

### Resultados exactos del candidato actual — completar después de los gates

Esta sección se llena sólo con salidas reproducibles del commit/digest final:

| Gate | Resultado actual | Evidencia que debe registrarse |
| --- | --- | --- |
| Prisma generate/validate y deriva | **Pendiente de registro final** | versión de esquema, schema físico y deriva |
| Integración PostgreSQL 16 | **Pendiente de registro final** | suites/pruebas y base desechable |
| API unit/integration/e2e | **Pendiente de registro final** | suites/pruebas, omitidas y causa |
| Web unitarias y TypeScript/lint/build | **Pendiente de registro final** | conteos y artefacto |
| Playwright escritorio/móvil | **Pendiente de registro final** | proyectos, recorridos y retries |
| Contrato de despliegue | **Pendiente de registro final** | pruebas y commit |
| Dependencias | **Pendiente de registro final** | severidad mínima y resultado |
| Imagen/Compose/runtime | **Pendiente de registro final** | digest, UIDs, health y cierre |
| CI remoto | **Pendiente de nueva corrida** | URL, SHA y jobs |

Aunque todos queden verdes, seguirán faltando staging, restauración y smoke
productivo hasta que se ejecuten expresamente.

## 7. Exigencia operativa por dominio

### Finanzas electorales

El [CNE presenta Cuentas Claras](https://www.cne.gov.co/cuentas-claras) como el
mecanismo oficial para registrar ingresos y gastos, y publica
[orientación sobre informes de campaña](https://www.cne.gov.co/informes-de-ingresos-y-gastos-de-campana).
Topes, códigos, plazos y responsables deben configurarse desde la fuente vigente
para la elección concreta y validarse profesionalmente.

El software prepara y controla un expediente interno. No presenta el informe, no
certifica aceptación y no reemplaza a gerente, contador, organización política
ni autoridad.

### Datos y comunicaciones políticas

La [SIC publicó instrucciones específicas para el contexto electoral](https://sedeelectronica.sic.gov.co/comunicado/la-sic-expidio-instrucciones-sobre-proteccion-de-datos-personales-en-el-contexto-electoral).
El producto debe conservar finalidad, fuente, autorización, segmentación, uso de
IA, derechos y revocación. Sin webhook o conciliación del proveedor, una baja
local no prueba que el siguiente mensaje haya sido suprimido.

### Testigos, formularios y catálogo

La [Registraduría describe las funciones de los testigos electorales](https://www.registraduria.gov.co/-Testigos-Electorales-articles-1036-.html).
Credenciales, formularios, reclamaciones y escrutinio tienen alcances distintos.
Una foto, transcripción o consolidado privado nunca debe etiquetarse como
resultado oficial.

La procedencia y los límites de uso del catálogo se documentan en el
[protocolo de catálogo electoral](./PROTOCOLO_CATALOGO_ELECTORAL_RNEC.md).
El pipeline técnico listo no concede una licencia.

### PQRSD

La [Ley 1755 de 2015](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=65334)
es un marco general; no autoriza hardcodear 10, 15 o 30 días como respuesta
universal. La entidad usuaria debe validar clasificación, competencia,
calendario, excepciones, firma y notificación. Hasta entonces las referencias
son internas y el módulo no debe anunciarse como canal oficial.

## 8. Capacidades externas que no deben simularse

- recuperación autoservicio y verificación de correo sin proveedor configurado;
- entrega real de WhatsApp, SMS o correo, incluidas bajas y rebotes;
- cobros, aportes, donaciones o pasarela;
- radicación o consulta automática ante CNE, Registraduría u otra autoridad;
- firma y notificación institucional de PQRSD;
- eliminación física de datos/Storage por política de retención;
- transferencia automática de bases de campaña a función pública;
- fuente electoral vigente sin autorización/licencia acreditada;
- alta disponibilidad, observabilidad y recuperación de la VPS sin operación
  real de infraestructura.

## 9. No probado por seguridad

No se hicieron mutaciones productivas de personas, finanzas, roles, testigos,
formularios, actas, PQRSD o configuración; tampoco envíos, cobros, cargas reales,
radicaciones, pruebas de intrusión, carga, caos ni restauración. No se probó fuga
entre dos tenants productivos.

Estas omisiones protegen información y operación reales; no prueban que los
flujos funcionen.

## 10. Bloqueos de salida a producción

No hay `GO` mientras falte cualquiera de estos puntos:

1. respaldo externo cifrado y restauración ensayada de PostgreSQL y Storage;
2. inventario de `_prisma_migrations` por schema y ensayo sobre una copia;
3. staging equivalente con tenant, roles y datos sintéticos;
4. una fuente electoral con autorización/licencia y única proyección aprobada;
5. secretos, Supabase, Redis y proveedores separados y validados por ambiente;
6. gates finales registrados sobre un commit/digest inmutable;
7. simulacro integral de escritorio, móvil, offline, concurrencia y Día D;
8. validación profesional de finanzas, GSC, privacidad, testigos y PQRSD;
9. RCA de la caída compartida, firewall, límites, alertas y contingencia manual;
10. smoke posterior al despliegue y decisión documentada de avance o recuperación.
11. decisión formal sobre verificación independiente de bytes y eliminación de
    cualquier claim comercial o jurídico que exceda el control implementado.

La recomendación sigue siendo **no desplegar directamente sobre producción**.
Primero se restaura, después se ensaya en staging, luego se congela el artefacto
y finalmente se corta con una ventana y responsables definidos. Una aplicación
política útil no es la que promete más: es la que falla cerrado, muestra el
pendiente exacto y conserva evidencia suficiente para que una persona competente
tome la decisión.

Este documento complementa la
[estrategia de producto](./ESTRATEGIA_PRODUCTO_2026.md) y no reemplaza asesoría
jurídica, electoral, contable, de protección de datos o seguridad.
