# Protocolo de calendario electoral versionado

> Corte de diseño: 9 de septiembre de 2026. Este protocolo define un control
> interno de fechas y responsables. No reemplaza el calendario ni las
> notificaciones de la Registraduría, el CNE, un tribunal u otra autoridad.

## 1. Problema operativo

Una sola `electionDate` no permite dirigir una campaña real. Antes, durante y
después de la jornada existen hitos distintos: inscripción, apoyos, propaganda,
acreditaciones, simulacros, entrega de informes, escrutinios, reclamaciones y
cierre. Una fecha copiada sin fuente, versión o ámbito puede ser peor que no
tener calendario porque genera una falsa certeza.

El módulo debe conservar para cada hito:

- elección, ronda, circunscripción y perfil operativo exactos;
- autoridad emisora, URL HTTPS, referencia, fecha de publicación y SHA-256 del
  artefacto usado;
- fecha/hora civil, zona IANA, regla de aplicabilidad y texto original resumido;
- responsable interno, suplente, estado, evidencia y fecha real de cierre;
- historial inmutable de correcciones, activación y sustitución.

La página oficial de [fechas importantes de la elección presidencial 2026](https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica/fechas-importantes.html)
es una referencia primaria, pero no debe convertirse en una tabla universal ni
copiarse a otra elección sin una revisión expresa.

## 2. Estados y cuatro ojos

Un paquete de calendario pasa por `STAGED → VALIDATED → ACTIVE → SUPERSEDED`.
Quien lo crea no puede validarlo ni activarlo. Sólo puede existir un paquete
activo por tenant, perfil, elección y ronda. La activación exige:

1. perfil operativo compatible;
2. al menos un hito y ninguna fecha inválida;
3. fuente HTTPS, referencia, corte y hash;
4. zona horaria IANA explícita para cada hito con hora;
5. revisor diferente del cargador;
6. comparación visible frente al paquete activo anterior;
7. confirmación de que el operador revisó la fuente aplicable.

Una versión nueva nunca sobrescribe la anterior. Debe mostrar fechas añadidas,
retiradas y movidas, y exigir resolución de tareas afectadas.

## 3. Hitos y semántica

Las categorías mínimas son:

- `REGISTRATION`: inscripción de comité, candidatura, lista o testigos;
- `SIGNATURES`: entrega de formularios, recolección y radicación de apoyos;
- `CAMPAIGN`: propaganda, financiación, encuestas y restricciones aplicables;
- `ELECTION_PREPARATION`: acreditación, capacitación, logística y simulacro;
- `ELECTION_DAY`: apertura, cierre, reportes y contingencia;
- `SCRUTINY`: comisión, reclamación, recurso, decisión y declaratoria;
- `FINANCE`: cortes, informes de candidatura y consolidados;
- `DATA_GOVERNANCE`: terminación de finalidad, retención y derechos;
- `INTERNAL`: decisión operativa no atribuida a una autoridad.

Cada registro debe declarar si es `INFORMATIONAL`, `INTERNAL_TARGET` o
`EXTERNAL_DEADLINE`. La interfaz nunca debe llamar “plazo legal” a una meta
interna. Tampoco debe calcular días hábiles o prórrogas si no existe una regla
versionada y aprobada para esa elección.

## 4. Responsabilidad y alertas

Un hito externo activo requiere responsable y suplente diferentes. El sistema
genera alertas configurables en T-30, T-15, T-7, T-3, T-1 y al vencimiento, sin
inventar que un correo o una notificación fue entregado. El cierre exige:

- resultado (`COMPLETED`, `NOT_APPLICABLE`, `MISSED` o `CANCELLED`);
- explicación;
- referencia de evidencia y hash cuando aplique;
- segundo control para hitos de finanzas, escrutinio, inscripción o apoyos.

Un vencimiento no puede desaparecer al cambiar el responsable. Debe permanecer
en la bandeja y en el centro de comando hasta resolverse.

## 5. Integración con el ciclo

- `EXPLORATION/PRE_CAMPAIGN`: cargar y validar el primer calendario.
- `SIGNATURE_COLLECTION`: bloquear la salida si quedan hitos obligatorios de
  apoyos sin resultado.
- `CAMPAIGN`: mostrar próximos 30 días y conflictos de responsable.
- `ELECTION_PREPARATION/SIMULATION`: exigir hitos de logística y testigos.
- `ELECTION_DAY`: usar únicamente el paquete activo y una copia offline
  cifrada; no permitir editar fechas.
- `POST_ELECTION`: priorizar escrutinio, reclamaciones y finanzas.
- `CLOSED`: sólo lectura; cualquier corrección requiere un expediente de
  reapertura o una anotación inmutable, no una edición silenciosa.

Los hitos pueden enlazar tareas o eventos existentes, pero no se consideran
cumplidos sólo porque una tarea esté en `COMPLETED`: el resultado y la evidencia
del hito deben validarse por separado.

## 6. Seguridad y arquitectura

- Todas las tablas operativas incluyen `tenantId` obligatorio y relaciones
  compuestas tenant-scoped.
- El tenant siempre proviene del JWT revalidado; ningún DTO acepta `tenantId`.
- Las mutaciones usan `clientRequestId`, transacción serializable y bloqueo de
  fila para idempotencia y concurrencia.
- Carga de documentos exclusivamente mediante `StoredObject` ya confirmado por
  el flujo de URL firmada de Storage.
- Los paquetes activados, decisiones y resultados son append-only mediante
  trigger; no se borran en cascada para ocultar historia.
- El snapshot offline es mínimo, cifrado, ligado a tenant+usuario+versión y
  muestra siempre su antigüedad.

## 7. Pruebas de aceptación

1. dos usuarios no pueden activar simultáneamente versiones distintas;
2. creador y revisor no pueden ser la misma persona;
3. una elección/ronda distinta no acepta hitos del paquete activo;
4. cambiar un paquete produce diff y conserva historia;
5. un reintento idéntico devuelve el mismo recibo y uno alterado falla;
6. `CLOSED` rechaza mutaciones;
7. ningún rol o tenant ajeno puede observar fechas, responsables o evidencia;
8. hora de Colombia se interpreta con `America/Bogota`, sin depender de la zona
   del navegador;
9. vencidos y próximos aparecen en centro de comando y bandeja;
10. escritorio, Pixel, offline y PostgreSQL con concurrencia real pasan sin
    reintentos ocultos.

