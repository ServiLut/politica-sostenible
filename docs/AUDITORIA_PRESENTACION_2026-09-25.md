# Presentación y uso de Política Sostenible

Fecha: 25 de septiembre de 2026. Entorno: evaluación local en `http://127.0.0.1:5310`, independiente de producción. Continuación de la [auditoría funcional](AUDITORIA_FUNCIONAL_2026-09-25.md).

Actualización posterior: el candidato visual de este informe se incluyó en la versión `ecc9221` instalada en producción. La activación y sus comprobaciones publicadas están en [Despliegue y validación](DESPLIEGUE_Y_VALIDACION_2026-09-25.md); las mediciones de este documento siguen siendo evidencia del entorno local.

## Criterio de esta revisión

La presentación debe permitir leer, localizar acciones, completar formularios y consultar datos con claridad. Una página cuyo ancho exterior cabe en pantalla puede contener botones o tarjetas recortados; por eso se midieron también los límites de los controles y qué elemento recibe el clic en cada acción.

Se mantuvieron las consultas, permisos, validaciones y datos del sistema. La revisión combina cambios en componentes compartidos con correcciones por pantalla. No se sustituyeron datos reales por valores de demostración ni se activaron servicios externos.

## Problemas reproducidos antes del cambio

La referencia inicial contiene 63 mediciones de 13 vistas, con anchos CSS de 320, 390, 768, 1280 y 1440 píxeles. Evidencia: [informe y capturas de referencia](../.artifacts/staging/visual-baseline/README.md). El trabajo por página abarcó 31 pantallas del dashboard y cuatro de autenticación, además del cuadro de mando, el layout, la navegación y componentes compartidos. El [inventario de páginas](../.artifacts/auditoria-presentacion-paginas-20260925.md) distingue la revisión estática de las pruebas de navegador.

| Área | Problema comprobado | Reparación aplicada y comprobada |
|---|---|---|
| Cuadro de mando | Botón Actualizar fuera de pantalla a 320 px; indicadores recortados a 390 px. | Encabezado flexible, tarjetas con ancho mínimo cero, cifras proporcionadas y un solo nivel de padding. |
| Tareas y eventos | Acciones de alta fuera de pantalla; los accesos flotantes cubrían Cancelar, Crear y Responsable. | Barras de acciones adaptables, controles de aplicación en una franja propia y diálogos por encima de la navegación. |
| Territorio | Pestaña Puestos fuera de pantalla a 320 px. | Distribución adaptable de controles. |
| Catálogo | Identificador largo desbordaba su contenedor. La tabla desplazable no estaba identificada para teclado. | Ajuste de palabras largas y región de tabla nombrada y enfocable. |
| Finanzas | Escape cerraba el expediente y dejaba el foco en el documento. | Referencia explícita al botón que abre el formulario. |
| Perfil | El formulario quedaba después de aproximadamente diez pantallas de requisitos. | Enlace directo al formulario, respetando el permiso de edición. |
| Navegación móvil | Riesgo de dejar un diálogo oculto capturando foco al cambiar al ancho de escritorio. | Pila compartida de diálogos y cierre al cruzar el punto de cambio de navegación. |

## Sistema visual aplicado

- Tipografía sans serif resuelta directamente desde la fuente cargada; encabezados, etiquetas y cifras con tamaños proporcionados.
- Fondo suave, tarjetas blancas, bordes discretos, esquinas coherentes y azul como acción principal. El estado se comunica mediante texto además del color.
- Botones sin saltos ni escalado al pasar el puntero; estados de foco, espera y deshabilitado reconocibles. Controles comunes con altura adecuada para interacción táctil.
- Encabezado y navegación estables; contenido con desplazamiento propio. Las áreas desplazables conservan su contenido, sin ocultar errores detrás de un recorte global.
- Controles de conexión, bóveda e instalación en un espacio reservado. Su acceso también se conserva en el lanzador de recuperación sin sesión.
- Diálogos con altura limitada por el viewport, desplazamiento interno, foco contenido, retorno al disparador y respeto por confirmaciones que no permiten Escape.
- Respeto de la preferencia del sistema para reducir movimiento y del área segura de pantallas móviles.
- Etapa actual siempre visible en el cuadro de mando; las nueve etapas completas pueden desplegarse a petición para dejar antes a la vista los indicadores.

## Comprobación del candidato

El criterio de aceptación es que los controles visibles quepan, no queden cubiertos, puedan alcanzarse por teclado y conserven su comportamiento al abrir, cerrar y cambiar de tamaño.

| Comprobación técnica | Resultado |
|---|---|
| Suite completa de interfaz | **301 de 301 pasan** en el corte final. |
| Lint completo de interfaz | **231 archivos, cero errores y cero advertencias**; los refinamientos posteriores pasaron también lint focal. |
| Compilación de la imagen web | **Aprobada**, incluyendo TypeScript y las 48 rutas generadas por Next.js. |
| Pruebas focales de páginas/catálogo | **24 de 24 pasan**. |
| Regresión de navegación circular con Tab | **5 de 5 pasan**; recorrido nativo que revela el botón, sin bloquear su desplazamiento al enfocarlo. |

Durante el primer recorrido del candidato se detectó otra regresión: Shift+Tab podía enfocar el botón final del formulario de Eventos sin desplazarlo hasta la zona visible en una pantalla de 320 × 568. La rama de navegación circular usa ahora el desplazamiento nativo de `focus()`. La última compilación pasó también la comprobación visual: «Crear borrador» queda entre y484 y y528, dentro de la pantalla; el diálogo desplaza 502 píxeles y el fondo conserva exactamente su posición (main: 183 → 183; body: 0 → 0). La política de entrada al diálogo y retorno al disparador conserva su posición.

Evidencia técnica: `.artifacts/staging/visual-web-unit-final.log`, `.artifacts/staging/visual-web-lint.json`, `.artifacts/staging/visual-web-build-final.log`, `.artifacts/staging/visual-final-refinement-lint.log` y `.artifacts/ui-dialog-tab-regression.log`.

## Resultado final en navegador

**Sin fallos pendientes detectados dentro de la cobertura realizada.** Se registraron 68 muestras DOM: diez vistas en 320, 390, 768, 1280 y 1440 × 900, más 320 × 568 (60 muestras); búsqueda y bóveda a 320 × 568 (dos); y cuadro de mando con sus etapas abiertas y cerradas a 320, 390 y 1440 (seis). Las diez vistas son cuadro de mando, tareas, diálogo de tarea, eventos, diálogo de evento, expediente financiero, territorio, perfil, catálogo y equipo con invitación.

| Interacción comprobada | Resultado final |
|---|---|
| Cuadro de mando | Botón Actualizar y tarjetas dentro de pantalla. Las nueve etapas se despliegan y se cierran sin recortar controles. |
| Tareas y eventos | Botones de alta dentro del ancho disponible; ningún control PWA intercepta las acciones. Tareas mantiene el pie visible a 320 × 568 y el cierre mide 44 × 44 px. |
| Ventanas y teclado | Tab/Mayús+Tab contenidos en el diálogo; Cancelar/Escape devuelven el foco; fondo bloqueado. Regresión de Eventos corregida y verificada. |
| Finanzas | Escape retorna al botón «Configurar expediente». |
| Perfil | «Configurar perfil» desplaza y enfoca el formulario permitido; este queda visible bajo el encabezado. |
| Territorio y catálogo | Pestaña Puestos dentro de pantalla; identificador largo ajustado; tabla con región nombrada y desplazamiento horizontal mediante teclado. |
| Navegación | Menú móvil se cierra y libera el fondo al cambiar de 390 a 1280 px. Menú de usuario contenido a 320 × 568. |
| Búsqueda y bóveda | Búsqueda encuentra la tarea sintética persistida; bóveda abre y cierra con retorno del foco, sin crear claves. |

El [informe de navegador](../.artifacts/staging/visual-final/README.md), el [resultado estructurado](../.artifacts/staging/visual-final/result.json) y las [mediciones](../.artifacts/staging/visual-final/metrics.json) conservan la evidencia y sus límites. Capturas de la última compilación:

- [Cuadro de mando en escritorio](../.artifacts/staging/visual-final/executive-desktop-native.png).
- [Cuadro de mando a 390 × 844](../.artifacts/staging/visual-final/executive-390x844.png).
- [Crear tarea a 390 × 844](../.artifacts/staging/visual-final/tasks-dialog-390x844.png).
- [Crear tarea a 320 × 568](../.artifacts/staging/visual-final/tasks-dialog-320x568.png).
- [Foco de Eventos corregido a 320 × 568](../.artifacts/staging/visual-final/events-focus-fixed-320x568.png).

La captura de escritorio utiliza el viewport nativo de 2133 × 950 píxeles CSS y conserva el margen producido por el zoom del navegador. La captura exacta a 1440 × 1000 falló en la herramienta y su artefacto está marcado como no entregable; la medición responsive a 1440 sí pasó. Las capturas no se editaron.

## Límites

La cuenta sintética es de Administración en una candidatura sin perfil ni territorio configurados. Las secciones restringidas por etapa, plan, MFA o alistamiento conservan esas condiciones; no se forzaron para obtener capturas. La revisión de navegador no acredita hardware móvil nativo ni todas las combinaciones de contenido y permisos. Al cerrar esta revisión visual, las modificaciones eran locales; el despliegue posterior se documenta por separado en el informe enlazado al inicio.
