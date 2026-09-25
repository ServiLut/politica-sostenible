# Segunda revisión de producción y dispositivos

Fecha: 25 de septiembre de 2026. Aplicación exclusiva: Política Sostenible.

Estado del documento: preparación y verificación del candidato. No representa aún un segundo despliegue. La versión de partida publicada es `ecc922196ae88da08b75ed5dcaeffb1fe1f7c772`.

## Correcciones de esta revisión

| Área | Problema identificado | Corrección y alcance |
| --- | --- | --- |
| Búsqueda | El acceso visible estaba limitado a la barra lateral de escritorio. | Botón de búsqueda en el encabezado de celular y tableta, conectado a la misma búsqueda autenticada; atajo y botón de escritorio conservados. |
| Menú de usuario | Al salir con Tab quedaba abierto sobre el contenido. | Cierre cuando el foco abandona el conjunto de botón y menú. Escape y navegación siguen disponibles. |
| Auditoría | El error de un rango de fechas inválido persistía después de limpiar o aplicar fechas válidas. | Se borra el error de validación al limpiar o aplicar un rango válido. Los errores de servidor conservan su tratamiento. |
| Logística y Testigos | El requisito de perfil aparecía como error rojo sin camino de configuración; Testigos podía ofrecer formularios sin haber recibido cobertura. | Pantalla de requisito con enlace al perfil. No se habilitan operaciones ni se inventa configuración; los formularios requieren respuesta de cobertura. |
| Lenguaje de Testigos | Se exponían etiquetas técnicas PRIMARY/BACKUP y explicaciones de mutaciones/API. | Principal/suplente y mensajes de uso. No se cambian los valores enviados al backend. |
| Controles táctiles | Había controles con texto pequeño, también en orientación horizontal. | Texto de edición de 16 px en pantallas táctiles estrechas; la configuración de viewport solicita reajuste del contenido ante teclado en navegadores compatibles. |
| Equipo | Los fallos de asignación territorial podían quedar detrás del modal; faltaban controles compartidos de foco. | Error dentro del diálogo, foco contenido, cierre y acciones protegidas durante guardado. |
| Propuestas | «Por asignar» no correspondía al comportamiento real del responsable; los estados terminales permitían intentar cambios rechazados por la API. | Selección y etiquetas alineadas al contrato existente; protección durante guardado y restricciones visibles. |
| Comunicaciones | Después de decidir, el cliente fabricaba fecha y actor locales. | Se utiliza la respuesta persistida de la API. |
| Incidentes | La asignación ofrecía únicamente los primeros 20 responsables sin búsqueda. | Selector con búsqueda en la API y presentación del responsable seleccionado. |
| Bandeja y Sellos | Mensajes de truncamiento sugerían que filtrar o firmar liberaría registros anteriores, sin soporte del endpoint. | Se explican los límites reales de los datos cargados y los caminos disponibles. |

La revisión separa hallazgos de código, comprobaciones de interacción y pruebas publicadas. No todos los estados de negocio existen en la organización original; no se crean datos ni se cambian roles, planes, avisos, etapas o MFA para aparentar cobertura.

## Evidencia y cierre

La evidencia nueva se conserva en `.artifacts/production-review-20260925/`. Las capturas, matrices de dispositivos, compilación, prueba del candidato y resultado del despliegue se incorporan al cierre de esta revisión.

La preparación de otra entrega conserva la versión `ecc9221` como reversión, verifica de nuevo el ámbito original y las dos cuentas sintéticas inactivas y mantiene la actualización limitada al servicio `app`, sin compilar ni reiniciar dependencias del servidor compartido.
