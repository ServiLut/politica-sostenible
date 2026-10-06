# Revisión de experiencia y presentación — 6 de octubre de 2026

## Alcance y estado

Revisión de la versión publicada `426cdd52709c89a84847be334d6d301d8cd1fa06`
y mejora de su frontend. Este documento describe el candidato: no constituye
por sí mismo evidencia de publicación, de capacidad comercial ni de cobertura
de todos los formularios y roles.

El baseline observado en producción comprende las 22 rutas visibles para
Administración a 1440 y 390 píxeles CSS, tres accesos complementarios y estados
de diálogo. Se conservaron 64 capturas y la matriz que distingue capturas
transitorias. Esa fase fue de lectura; no creó registros ni modificó planes,
etapas, invitaciones o configuración productiva.

El inventario de código comprende 35 páginas del panel y 41 componentes,
además de autenticación y archivos relacionados. Los 115 sitios de formulario
identificados por sintaxis **no equivalen a 115 formularios probados**.

## Criterios aplicados

- Azul para acciones principales, azul oscuro para navegación y superficies
  claras para lectura. Los colores de estado conservan un significado propio.
- Un encabezado compartido: título, explicación breve, contexto y acciones.
  Se reduce el uso de grandes bloques oscuros dentro de las páginas.
- Datos y trabajo pendiente antes de herramientas de configuración poco usadas.
  Los detalles se pueden desplegar sin eliminar requisitos ni información.
- Controles de cierre de al menos 44 píxeles, cuerpo desplazable y acciones
  visibles en los modales largos corregidos.
- Etiquetas asociadas, foco de teclado, mensajes de error persistentes y
  confirmación del servidor para las operaciones que cambian estado.

## Cambios principales

| Área                        | Comportamiento del candidato                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navegación                  | Jerarquía, colores, búsqueda y contexto de organización consistentes; se elimina información repetida.                                              |
| Perfil de operación         | El alta inicial precede al diagnóstico; los requisitos se agrupan por etapa conservando conteos y enlaces autorizados.                              |
| Primeros pasos              | Pendientes prioritarios y pasos completados consultables.                                                                                           |
| Equipo                      | Invitación desplegable y resultado privado sólo cuando existe un enlace; miembros y accesos ganan prioridad.                                        |
| Personas                    | El aviso de privacidad pendiente precede a las acciones bloqueadas; se conserva la exigencia de consentimiento.                                     |
| Tareas                      | Encabezado compacto y filtros móviles en dos columnas, con etiquetas legibles.                                                                      |
| Bandeja                     | Una barra de categorías con conteos sustituye los controles duplicados.                                                                             |
| Territorio                  | Creación y mapa complementario desplegables; consulta del directorio prioritaria.                                                                   |
| Agenda                      | Encabezado claro y formulario con cierre, campos desplazables y pie de acciones.                                                                    |
| Finanzas                    | Balance y libro antes del cierre especializado; textos de negocio y corrección del contraste de avisos.                                             |
| Incidentes y comunicaciones | Modales con estructura consistente; seguimiento del incidente desplegable conservando resumen y controles.                                          |
| Programa político           | Estado confirmado por API, bloqueo de la operación por registro y explicación persistente del fallo. El selector no abre accidentalmente el editor. |
| PQRSD y casos               | Menos instrucciones técnicas, actualización explícita y aclaración de que la fecha interna de seguimiento no calcula un plazo legal.                |
| Auditoría                   | Nombres humanos para acciones conocidas y filtros orientados al usuario; los códigos desconocidos se conservan sin interpretarlos.                  |
| Catálogo                    | Se distinguen DANE administrativo y RNEC electoral. DANE no ofrece una activación que la API rechaza; RNEC conserva sus controles.                  |
| Sellos                      | Pasos y requisitos claros sin prometer selección automática de documentos.                                                                          |
| Exportación y MFA           | Mensajes asociados a su control, contraste y etiquetas; se conservan permisos y restricciones del plan.                                             |

No se cambian API, esquema de datos, migraciones, dependencias, almacenamiento,
aislamiento de organizaciones ni reglas de autorización en esta revisión.

## Evidencia y límites

Evidencias locales, excluidas de Git por contener nombres de cuentas de prueba:

- `.artifacts/ux-ui-profesional-20261006/baseline`: matriz de producción.
- `.artifacts/ux-ui-profesional-20261006/local-review`: revisión integrada en
  navegador con cuentas sintéticas de campaña y despacho público.
- `.artifacts/ux-ui-profesional-20261006/root-visual`: modales de agenda y
  finanzas a 320 × 568; edición de lugar de un evento sintético guardada y
  consultada de nuevo después de recargar.
- `.artifacts/usabilidad-escala-20261006/verificacion/ux-source-audit`:
  inventario, contraste y pruebas de exportación y cambios de estado.

Las comprobaciones usan tamaños de navegador. No certifican Safari, teléfonos
físicos, teclado virtual o funcionamiento táctil. La prueba de edición del
evento conserva fecha, horario, responsable y estado; no equivale a probar el
alta completa ni convoca a personas reales.

La suite del frontend terminó con 447 pruebas aprobadas, sin omitidas. El
análisis de tipos y ESLint del frontend finalizaron sin errores. De los 14
controles de contrato, entorno y seguridad del repositorio, 13 aprobaron:
el inventario estático de rutas falla también en el checkout limpio B426c
porque transforma `${jobPath(id)}/execute` y `${jobPath(id)}/retry` en
`:value/execute` y `:value/retry`. Los archivos implicados no cambian en esta
revisión. La prueba unitaria de `import-api` verifica las URL reales
`/api/import/personas/jobs/job%2F1/execute` y `/retry`, y el controlador Nest
declara ambas rutas. Se conserva el fallo del analizador como limitación
preexistente, sin silenciar la aserción ni presentarlo como control aprobado.

## Hallazgos que requieren trabajo funcional separado

1. **Afinidad política de líderes:** el campo se captura, persiste y muestra,
   sin una comprobación de consentimiento individual en esa cadena. No se
   cambia su nombre para disimular el problema ni se elimina información
   histórica en esta revisión de presentación. Requiere cerrar el contrato
   de datos y sus escrituras en backend.
2. **Sellos:** la verificación sigue necesitando identificadores; no se agregó
   un selector de documentos inexistente en el contrato actual.
3. **Entrada masiva y multicanal:** esta revisión no incorpora importación XLSX
   nativa, mapeo automático de columnas, formulario público, QR o integración
   automática de WhatsApp. No deben anunciarse como funcionalidades activas.

La publicación debe identificar una imagen nueva, verificar los tres procesos
del servicio conjunto y conservar como reversa la versión B426c, compatible
con el mismo esquema de 46 migraciones. Los recibos de una publicación anterior
no autorizan ni prueban este candidato.
