# Revisión de producto: Política Sostenible y Whatidea

Fecha de consulta: 17 de octubre de 2026. Responsable de ejecución: equipo de desarrollo de Política Sostenible. Este documento distingue observaciones públicas, defectos comprobados y criterios pendientes de validar. No afirma liderazgo de mercado ni superioridad demostrada de ninguno de los productos.

## Qué se pudo comprobar

El enlace facilitado corresponde a [Whatidea, cuenta whatidea.politics](https://www.instagram.com/whatidea.politics/p/DeHilJvsmWp/), publicación visible del 5 de octubre de 2026. Se verificaron la publicación y sus elementos visuales; no se obtuvo una transcripción completa del audio ni acceso a su aplicación privada.

La [página de Colombia](https://whatidea.io/colombia/) presenta prioridades territoriales, equipos de campo y seguimientos con acciones próximas. Identifica expresamente su vista como ilustrativa y con datos de demostración. Es evidencia de cómo comunica el producto, no de rendimiento real, integración o disponibilidad de cada función.

Su [descripción de organización territorial](https://whatidea.io/organizacion-de-lideres-territoriales-en-redes-organicas/) ofrece roles, tareas y seguimiento por responsable. Las guías de [testigos](https://whatidea.io/guia-de-testigos-electorales-app/) y [jornada electoral](https://whatidea.io/como-organizar-gestion-del-dia-d/) explican recorridos de campo. Una guía editorial no prueba que la aplicación ejecute íntegramente ese recorrido.

No se verificaron de forma independiente el número de campañas atendidas, aumentos de alcance, tasas de éxito, capacidad concurrente, ausencia de duplicados o certificaciones comerciales anunciadas. No deben usarse como hechos en una comparación de ventas.

## Diagnóstico de experiencia

La fortaleza observable de la presentación es conectar territorio, responsables y trabajo pendiente. Nuestra decisión de producto es reducir el tiempo necesario para entender una pantalla y completar una operación. Añadir módulos o métricas sin una decisión asociada perjudica ese objetivo.

La captura facilitada para la revisión muestra un mapa difícil de interpretar, con numerosos ceros y sin contexto geográfico reconocible. Es evidencia de esa experiencia en la versión y momento capturados; no demuestra por sí sola que todas las versiones actuales reproduzcan el fallo. La aceptación del mapa exige repetir el recorrido sobre el candidato publicado.

La comprobación de producción del 17 de octubre, a las 14:11 de Colombia, confirmó una mejora respecto de esa captura: la vista actual comienza por una lista de territorios, filtra por registros, muestra fecha de actualización y ofrece mapa opcional con leyenda y referencia cartográfica. Esto verifica ese estado y la apertura del mapa; no acredita todos los filtros, la exactitud de coordenadas o una revisión visual completa en celular. La captura del navegador de la aplicación falló y el cambio temporal de tamaño no mantuvo dimensiones estables; esa parte visual permanece pendiente. Los datos de la cuenta revisada no se incluyen en este informe público.

En el código candidato se comprobó un problema concreto de escala en propuestas: el listado y su filtrado necesitaban paginación coherente con el servidor. La corrección en preparación consulta páginas de 20, traslada búsqueda y filtros a NestJS, conserva el detalle por identificador y evita que una respuesta antigua reemplace una búsqueda reciente. Su prueba local no equivale a una instalación en producción.

## Cambios exigibles y forma de aprobarlos

Las filas siguientes son requisitos de aceptación, no una afirmación de que todas esas capacidades estén ausentes. Primero se contrasta la implementación existente; se corrige la diferencia demostrada y se conserva el recorrido que ya funciona.

| Prioridad | Cambio concreto | Criterio verificable |
| --- | --- | --- |
| P0 | Inicio con trabajo pendiente, responsable, vencimiento y siguiente acción; cada cifra debe abrir sus registros | Un usuario nuevo localiza su tarea y la abre sin explicación del operador. Cifra y listado coinciden bajo el mismo alcance y fecha. Los estados sin datos explican cómo empezar. |
| P0 | Una entrada «Agregar información» para archivos Excel/CSV, formularios y enlace/QR, con vista previa y errores por fila | Un archivo sintético de 10.000 filas reconcilia aceptadas, rechazadas y pendientes. Repetirlo o reintentar sólo fallos no duplica registros. El origen y la autorización se conservan. Es objetivo de prueba, no capacidad certificada. |
| P0 | Mapa de operación con leyenda, fecha de corte, filtros y alternativa de lista | Se muestran ubicaciones válidas de actividades, incidencias y equipos. Los registros sin ubicación se contabilizan aparte, sin coordenadas inventadas. Mapa y lista concilian. Si el proveedor cartográfico falla, la lista sigue siendo utilizable y se explica el problema. |
| P0 | Recorrido único de compromiso, tarea asignada, evidencia y revisión | El responsable recibe la tarea con el contexto ya registrado. No vuelve a escribir la misma información. Completar una tarea no cierra indebidamente todo el compromiso. Cambios y responsables quedan auditados. |
| P0 | Listas y búsqueda aptas para volumen | La búsqueda consulta el conjunto autorizado, no sólo los primeros registros descargados. Cambiar filtros vuelve a la primera página; borrar el último elemento recupera una página válida. Totales consistentes y ningún cruce entre organizaciones. |
| P1 | En celular, «Mi trabajo de hoy», formularios breves y borrador recuperable | Sin desplazamiento horizontal de la página a 360, 390 y 768 píxeles. El teclado no tapa la acción principal. Se distinguen borrador local, pendiente de envío, recibido y rechazado; cerrar y reabrir no pierde datos. |
| P1 | Simulacro completo de testigo y coordinador | Asignar, aceptar, consultar instrucciones, reportar, adjuntar evidencia, revisar y cerrar. Probar ausencia, reasignación, foto equivocada, envío repetido y desconexión. Los registros de prueba están marcados como simulación y nunca como resultado oficial. |
| P0 | Accesos por cliente y función demostrados | Dos organizaciones y roles distintos prueban lectura, edición, exportación, búsqueda y revocación. Un identificador ajeno no permite recuperar datos. La interfaz explica el rechazo sin exponer consultas, claves o trazas. |
| P1 | Presentación consistente y accesible | Un mismo patrón para filtros, tablas, formularios, confirmaciones y errores. Foco visible, etiquetas legibles, estados que no dependan sólo del color, cierre de modal previsible y retorno del foco al botón de origen. |
| P0 | Entrega verificable | Seguridad y fábrica aprobadas para el SHA exacto, respaldo restaurable, imagen identificable y pruebas posteriores en el dominio publicado. Un compilado local o una página de salud no sustituye estos resultados. |

P0 significa previo a la entrega que declare esa capacidad lista. P1 significa completar antes de ofrecerla como ventaja comercial. No se fija una fecha ficticia: la liberación depende de la evidencia de cada fila.

## WhatsApp: corregir la promesa comercial

La [política oficial de WhatsApp Business](https://whatsappbusiness.com/es-la/policy/?lang=es_LA), consultada con fecha de actualización 23 de septiembre de 2026, prohíbe el uso de la **Plataforma de WhatsApp Business** por partidos, políticos, candidatos, campañas y determinados proveedores de servicios políticos. Esta limitación afecta a la plataforma/API; no debe ampliarse automáticamente a cualquier uso personal de la aplicación.

Por tanto, Política Sostenible no debe anunciar bots o mensajería automática de campaña a través de esa API como una integración habilitada. Un botón que abre una conversación tampoco prueba que un mensaje haya sido enviado, entregado o respondido. Las entradas por web, formulario, enlace y QR pueden mantenerse como recorridos propios, con autorización y control de acceso. La publicidad de un competidor no acredita una excepción ni permite concluir, sin conocer su implementación, que está infringiendo la política.

## Orden de ejecución recomendado

1. Cerrar seguridad, historial y recuperación para poder publicar un candidato verificable.
2. Aprobar captura masiva, búsqueda, mapa y asignación de tareas con datos sintéticos reconciliados y roles separados.
3. Repetir móvil, desconexión y simulacro de campo, seguido de revisión visual por cada estado vacío, cargando, error y éxito.

La demostración comercial debe mostrar esos recorridos con datos claramente sintéticos y explicar sus límites. Sólo se debe afirmar una ventaja frente a otro producto cuando exista una comparación reproducible bajo las mismas condiciones. La decisión de diseño es hacer que cada pantalla conduzca a una acción comprensible, con menos duplicación y evidencia de que terminó correctamente.
