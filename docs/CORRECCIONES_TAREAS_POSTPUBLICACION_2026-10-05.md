# Tareas: correcciones encontradas después de publicar la integración de GitHub

Fecha: 5 de octubre de 2026. Base publicada: `ed0ca8114ef730a3c428ea324ff3107240b069c1`.

La revisión autenticada de esa versión creó una sola tarea claramente marcada
como QA, comprobó su persistencia, cambió su estado a En progreso y finalmente
la canceló, con una recarga después de cada cambio. La fila y su auditoría se
conservan. No se presenta una cancelación como eliminación: la API no ofrece
DELETE para tareas.

La comprobación del contrato encontró dos defectos y una función disponible en
API que todavía faltaba en la pantalla:

- El cambio de estado sustituía una tarjeta en memoria sin actualizar el
  resultado de los filtros ni su total. Una tarea cancelada podía permanecer
  bajo otro estado hasta recargar. Ahora se consulta nuevamente la API con los
  filtros vigentes y se vuelve a la primera página; las consultas anteriores
  se cancelan mediante el mecanismo existente de la página.
- La consulta de candidatos a recordatorio excluía únicamente las completadas.
  Ahora incluye sólo TODO, IN_PROGRESS y BLOCKED, conservando el filtro de
  organización, ventana de fechas, asignación y cursor. Ese servicio no tiene
  un canal de envío operativo conectado; este cambio no activa mensajes.
- Se conecta Editar detalles al PATCH de tareas existente. La visibilidad
  respeta los roles y modos admitidos por Nest. Un usuario autorizado sólo para
  cambiar estado no recibe un editor completo. Nest conserva la autorización
  efectiva, el alcance territorial y el aislamiento por organización.

El editor utiliza un borrador separado del alta. Cancelar no guarda cambios.
Sólo se envían los campos modificados: una edición de título no reescribe la
hora del vencimiento, el responsable, el estado ni los vínculos con casos o
compromisos. El nombre del responsable se conserva aunque esté fuera de la
página cargada. Los errores permiten corregir o reintentar el mismo borrador.
Se reutiliza el diálogo accesible, su desplazamiento interno y el retorno del
foco; la pestaña Tareas sirve de respaldo si el elemento que lo abrió deja de
existir después de actualizar un resultado filtrado.

Validación previa a empaquetar:

- API: nueve pruebas focales aprobadas en dos suites y lint sin incidencias.
- Web: 33 pruebas focales aprobadas, incluidas ocho nuevas; tipos y lint del
  área aprobados. La suite web completa posterior aprobó 328 pruebas, sin
  omisiones ni reintentos inestables.
- Se ampliaron los casos de navegador con respuestas simuladas para edición,
  error de permisos, cancelación del borrador, foco, Enter y cambio de estado
  bajo filtro. Su descubrimiento se comprobó, pero esa ejecución de navegador
  no se presenta como realizada.

La revisión de ED0 registró 132 lecturas de las 22 secciones visibles en seis
anchos efectivos sin desbordes detectados. Es evidencia de esa versión y de
esa cuenta, no una prueba de capacidad concurrente ni de hardware táctil. La
publicación de este parche requiere nueva imagen identificada, respaldo y
restauración verificados, controles previos al corte y regresión focal real de
Tareas. Sus recibos se guardan por separado; este documento no acredita por
sí mismo que el parche esté instalado.

No cambian dependencias, esquema, migraciones, conexiones, recursos del
servidor ni los otros programas. Los registros preexistentes de líderes cuya
procedencia está pendiente de cotejo permanecen identificados como una revisión
de datos aparte; no se validan como auténticos por abrir correctamente su lista.
