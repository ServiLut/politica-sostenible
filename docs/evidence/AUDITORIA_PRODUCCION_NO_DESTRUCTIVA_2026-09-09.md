# Auditoría autenticada no destructiva de producción

> Ejecución: 9 de septiembre de 2026, `America/Bogota`.
> Objetivo: comprobar navegación, carga y controles visibles del despliegue que
> seguía en producción. No se enviaron formularios, no se crearon registros, no
> se aprobaron comunicaciones, no se subieron archivos y no se inspeccionaron
> cookies, credenciales ni almacenamiento del navegador.

## Alcance y resultado

Se usó la sesión ya abierta por el propietario y se recorrieron 13 rutas
autenticadas. Todas terminaron en un módulo reconocible, sin página 404, error
de ejecución visible ni redirección inesperada:

| Ruta | Encabezado observado |
| --- | --- |
| `/dashboard` | Redirige al centro de comando autorizado |
| `/dashboard/executive` | Política Sostenible |
| `/dashboard/incidents` | Incidentes y respuesta de crisis |
| `/dashboard/tasks` | Tareas y compromisos |
| `/dashboard/events` | Eventos y territorio |
| `/dashboard/territory` | Organización territorial |
| `/dashboard/votantes` | Relacionamiento territorial |
| `/dashboard/communications` | Aprobación de comunicaciones |
| `/dashboard/audit` | Bitácora de auditoría |
| `/dashboard/finance` | Finanzas de campaña |
| `/dashboard/war-room` | Control de reportes E-14 |
| `/dashboard/team` | Equipo y accesos |
| `/dashboard/settings` | Aviso de privacidad de la organización |

Cuatro vistas necesitaron más tiempo que `DOMContentLoaded` para abandonar
«Cargando sistema…». Al esperar la hidratación y las consultas, mostraron su
módulo correcto. Esto no se clasificó como 404, pero sí debe vigilarse con una
métrica de tiempo hasta contenido útil.

## Controles comprobados sin mutación

- La solicitud de revisión de comunicaciones abre un diálogo real con título,
  contenido, canal, finalidad, sensibilidad y búsqueda de caso autorizado. La
  búsqueda terminó sin error visible y el diálogo se cerró con **Cancelar**;
  no se envió la solicitud.
- Los filtros, paginadores y acciones principales aparecen como controles
  semánticos, no como texto que simula un botón.
- Los botones deshabilitados observados tienen una condición operativa, no un
  enlace roto:
  - **Crear** territorio exige código, nombre y padre seleccionado.
  - **Nueva vinculación** está bloqueado porque no existe aviso de privacidad
    activo y ofrece el enlace **Configurar aviso**.
  - **Registrar E-14** está bloqueado porque producción tiene cero puestos de
    votación configurados.
- El módulo territorial reportó 1.122 municipios administrativos, pero el
  módulo electoral reportó `0 de 0` puestos parametrizados. Esta diferencia
  confirma que DIVIPOLA administrativa no puede presentarse como DIVIPOLE de
  una elección.

## Hallazgo operativo principal

La producción observada no estaba caída, pero tampoco estaba preparada para
una jornada electoral: no tenía puestos, mesas esperadas ni cobertura base para
E-14. El candidato local añade catálogo electoral versionado, validación,
proyección, diferencias y doble aprobación; su promoción continúa bloqueada
hasta demostrar respaldo restaurable, staging equivalente y autorización de la
fuente que realmente se cargará.

## Límite de la afirmación

Este recorrido demuestra que las vistas y controles consultados cargaban en la
versión observada. No demuestra que las mutaciones funcionen en producción,
porque probarlas habría alterado datos reales. Esos recorridos deben ejecutarse
contra un tenant desechable en staging y repetirse sobre el digest exacto que se
pretenda promover.

## Comprobacion HTTP de salud y PWA

A las 16:58 de `America/Bogota` se ejecutaron solicitudes de lectura, con
tiempo maximo acotado y sin descargar cuerpos ni enviar datos:

| Recurso de produccion | Resultado observado |
| --- | --- |
| `/` | `200`; `Cache-Control: s-maxage=31536000`, cache de Next en `HIT` y `X-Powered-By: Next.js` |
| `/api/health/live` | `200`; `Cache-Control: no-store`; aun expone `X-Powered-By: Express` |
| `/api/health/ready` | `200`; `Cache-Control: no-store`; aun expone `X-Powered-By: Express` |
| `/manifest.webmanifest` | `404` |
| `/sw.js` | `404` |
| `/offline.html` | `404` |
| `/aplicacion` | `404` |

Por tanto, la version productiva observada esta viva, pero **no es instalable ni
offline**. Las rutas PWA, la desactivacion de `powered-by` y las politicas de no
almacenamiento para el area autenticada existen solo en el candidato local y
deben validarse sobre su imagen final antes de cualquier promocion.

A las 21:07 del mismo día se repitió un smoke HTTP estrictamente de lectura.
La portada y `/api/health/ready` continuaban en `200`; tanto
`/manifest.webmanifest` como `/sw.js` continuaban en `404`. Esto confirma
disponibilidad en ese instante, no corrige las brechas de versión ni autoriza
una promoción del candidato local.

A las 23:33 del mismo día se repitió el mismo control público sin enviar
credenciales ni descargar cuerpos. La portada y `/api/health/ready` seguían en
`200`, mientras `/manifest.webmanifest` y `/sw.js` seguían en `404`. La
producción continuaba disponible, pero aún ejecutaba la versión anterior sin
instalación ni service worker.

El 10 de septiembre de 2026 a las 07:48, hora de Colombia, se repitió el smoke
público con tiempo máximo de 15 segundos por recurso. `/` respondió `200`
(`text/html`, 115.200 bytes) y `/api/health/ready` respondió `200`
(`application/json`, 84 bytes); `/manifest.webmanifest` y `/sw.js` continuaron
en `404`. Esta observación sólo acredita disponibilidad puntual de la versión
antigua: la instalación, el modo offline y el resto del candidato local siguen
sin estar promovidos a producción.

El 10 de septiembre de 2026, entre las 09:36 y 09:38 hora de Colombia, se
repitió el recorrido autenticado de las 13 rutas anteriores usando la sesión
abierta por el propietario. Todas conservaron `main`, título y encabezado
reconocible; `/dashboard` redirigió al centro de comando autorizado. No se
observaron errores de consola ni botones sin nombre accesible. Tras esperar las
consultas, los bloqueos transitorios de **Actualizar** desaparecieron. El único
bloqueo operativo persistente fue **Registrar E-14**, acompañado por el estado
honesto de `0` puestos y `0` mesas parametrizadas. Se restauró la pestaña a
`/dashboard/territory` y no se envió ni modificó ningún dato.
