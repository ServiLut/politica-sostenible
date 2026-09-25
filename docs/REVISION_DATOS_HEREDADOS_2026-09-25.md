# Revisión de datos heredados — 25 de septiembre de 2026

La copia restaurada contiene **40 registros de líderes territoriales**. Al compararlos con las 39 entradas del cargador heredado preservado, **25 coinciden en los seis campos comparados, 14 presentan una diferencia y uno no tiene correspondencia identificada**. Esto prueba correspondencias de contenido; no demuestra quién ejecutó la carga, si una persona existe, si sus datos son ciertos ni si autorizó su uso. **No se modificaron ni eliminaron registros.**

Este informe se refiere al respaldo autenticado previo al despliegue, restaurado localmente. No constituye una lectura del estado actual de producción.

## Alcance y evidencia preservada

- Fuente: `.artifacts/seed-leaders-pre-auditoria-20260925.txt`, conservada sin ejecutar. SHA-256: `01ecefaa8bfa9481b850f71962803ac1651c80a11b2816ca4c7210013151b5c4`.
- Respaldo: 1.252.076 bytes; SHA-256: `ef380657425f0c4866cbd0169bdbfc3aad523a1f4f4febce5707d8dea1c3bed0`. Restauración validada el `2026-09-25T19:57:20.289Z`, con 119 tablas, 44 migraciones válidas y un antecedente de migración revertida, según `.artifacts/production-audit/restore-verification.json`.
- Resultado privado: `.artifacts/production-audit/legacy-data-comparison.json`, generado el `2026-09-25T20:17:47.882Z`. SHA-256: `ee88a7d37c7ec8f8090812727caee779f96f6c9b4800781fe7df7333b010d42a`.
- Herramientas de reproducción: `.artifacts/production-audit/legacy-data-compare.mjs` y `legacy-data-source-fingerprints.ps1`. Las consultas ejecutadas se conservaron bajo el mismo prefijo `legacy-data-*.sql`.
- Cierre del entorno: `.artifacts/production-audit/legacy-data-closure.json`, verificado el `2026-09-25T20:21:23.1304648Z`.

La extracción de la fuente usa el árbol sintáctico de PowerShell y admite únicamente literales de texto. No ejecuta ni importa el cargador. El helper fija por nombre, imagen, etiqueta, volumen, base y esquema el contenedor restaurado propio, con red `none` y sin puertos publicados. Cada consulta corre dentro de `BEGIN READ ONLY`, con límite de 15 segundos y termina en `ROLLBACK`.

Los seis campos comparados son nombre, descripción del cargo, teléfono, correo, afinidad política y observaciones. Se calculó SHA-256 del contenido serializado dentro de PostgreSQL y del contenido fuente local. Se verificaron tanto la representación sin recorte ni normalización Unicode como la representación NFC con recorte de espacios; las 25 coincidencias completas se mantienen en ambas. Para campos opcionales, `null` y texto vacío representan ausencia de contenido y se tratan como equivalentes: la comparación no afirma igualdad binaria de la fila completa ni incluye IDs o fechas. Dos controles sintéticos de Unicode, espacios y caracteres especiales verificaron la equivalencia del cálculo en JavaScript y PostgreSQL, sin insertar datos.

Los resultados privados conservan huellas de IDs, tenant, división y contenido, además de fechas y clasificación. Este documento no publica nombres, teléfonos, correos, afiliaciones, IDs individuales ni huellas individuales. Las huellas y el archivo fuente siguen siendo evidencia sensible, no datos públicos ni garantía de anonimización.

## Resultado y grado de certeza

| Hallazgo | Cantidad | Conclusión permitida |
| --- | ---: | --- |
| Coincidencia completa del contenido de seis campos | 25 | Correspondencia exacta con una entrada de la fuente, con la salvedad de campos vacíos descrita arriba. No prueba procedencia ni falsedad de la identidad. |
| Correspondencia única en cinco de seis campos | 14 | Coincidencia parcial: 13 difieren en observaciones y uno en descripción del cargo. No deben presentarse como coincidencias completas. |
| Registro adicional sin correspondencia identificada | 1 | Procedencia y veracidad no verificadas. No se atribuye al cargador. |
| Total de líderes en el respaldo | 40 | Inventario observado de esta copia y este corte. |

En Medellín hay 16 registros: **11 coincidencias completas, cuatro parciales y uno sin correspondencia**. Por tanto, no se confirmó que los 15 señalados inicialmente fueran todos copias exactas.

Los 39 registros con correspondencia completa o parcial tienen fechas de creación entre `2026-09-21T22:23:38.044` y `2026-09-21T22:23:56.131`, un intervalo de 18,087 segundos. Se reproducen las marcas almacenadas, sin asignarles una zona horaria no acreditada por esa columna. El registro adicional tiene fecha `2026-09-22T16:24:00.505`. En los 40 registros, creación y última actualización son iguales; esto no sustituye un historial de cambios.

El commit `62d371dfe512d15ac88872332a66a0a20be5b2fa`, fechado `2026-09-21T17:24:19-05:00`, tiene el mensaje `chore: remove seed script after successful execution (39 leaders created)`. El intervalo de carga, el contenido y ese antecedente son compatibles con una carga en lote derivada del cargador. **El mensaje de Git no acredita por sí mismo ejecución en esta base ni identifica al ejecutor.** No apareció un evento de auditoría asociado por tenant y `resourceId` a ninguno de los 40 líderes. Esto limita la atribución; no permite afirmar ausencia de registros en sistemas externos o en otros formatos.

## Inconsistencia geográfica comprobada

Cuatro entradas que en la fuente están bajo **CALI** —tres coincidencias completas y una parcial— aparecen asociadas en el respaldo a **SAN CALIXTO**, código `54670`. La división **SANTIAGO DE CALI**, código `76001`, no tiene líderes en esa copia. Medellín, código `05001`, tiene los 16 descritos arriba. Los nombres y códigos aquí son los del catálogo del respaldo, no una certificación externa de su vigencia.

El buscador del cargador heredado podía tomar el primer resultado de una búsqueda cuando no encontraba el nombre exacto. Ese comportamiento ofrece una explicación técnica compatible con confundir `CALI` con `SAN CALIXTO` cuando el catálogo denomina la ciudad `SANTIAGO DE CALI`. Es una explicación inferida del código; no se conservó una traza de aquella petición que demuestre la selección histórica.

El hallazgo afecta la confiabilidad del directorio territorial y exige revisión de fuente y ubicación antes de usar esos contactos operativamente. La comparación no valida teléfonos, cargos, afiliaciones ni respaldo documental de ninguna persona.

## Dependencias y reversibilidad

La tabla `TerritoryLeader` no tiene claves foráneas entrantes en el respaldo. Tiene dos salientes validadas: tenant y división dentro del mismo tenant, ambas con restricción de borrado del padre. Se revisaron 29 columnas de referencias genéricas y JSON; no se encontraron referencias a los IDs de estos líderes en ellas. Esta búsqueda no descarta dependencias externas, texto libre no cubierto ni uso por operadores.

La revisión del modelo y los endpoints actuales confirmó:

- `apps/api/prisma/schema.prisma`, modelo `TerritoryLeader`, no ofrece campo `isActive`, archivado, estado de verificación ni indicador de procedencia.
- `apps/api/src/campaign/campaign.service.ts` lista por tenant y división. La eliminación elimina físicamente el registro y genera `TERRITORY_LEADER_DELETED`; no es un archivado reversible.
- No se encontró consumo directo de esta tabla en los servicios de mapa de calor o briefing. Otros usos de la palabra «líder» pueden referirse a roles de usuarios, por lo que no se afirma que apartar estos contactos corrija todos los indicadores del programa.

**No existe un mecanismo de cuarentena reversible ya implementado y probado para estos registros.** Cambiar observaciones no los excluye del listado; desactivar una división afectaría también territorio válido. Borrar y volver a crear no restaura exactamente identidad e historial. La ausencia de referencias detectadas no autoriza a borrar.

## Tratamiento propuesto, pendiente de diseño y revisión

Se conservaron las filas originales y el respaldo. El cargador `seed-leaders.ps1` ya está retirado mediante un bloqueo incondicional `SEED_HEREDADO_BLOQUEADO`; el helper de esta revisión no modifica ese bloqueo ni vuelve a ejecutar la fuente.

Antes de apartar registros, hace falta contrastar su procedencia y soporte con la responsable de los datos, conservando la clasificación completa/parcial/sin atribución. **La igualdad de una tupla con la fuente no basta para ordenar la eliminación de los 25 registros.** Los 14 parciales y el adicional tampoco deben clasificarse automáticamente como datos sintéticos.

Si se aprueba una futura cuarentena, debe diseñarse explícitamente: manifiesto acotado por tenant, ID, hash y versión de cada fila; razón y evidencia de revisión; exclusión consistente de listados, búsquedas y exportaciones aplicables; conservación de IDs e historial; y restauración comprobable con pruebas de permisos y aislamiento. Tendrá que revisarse el estado vigente de cada registro antes de actuar, porque este respaldo es anterior al despliegue. No se añadió ese mecanismo ni se alteró el esquema en esta tarea.

## Reproducción y cierre

El helper no inicia contenedores. Requiere que el contenedor restaurado exacto se haya iniciado de forma coordinada y que todas sus guardas coincidan. En tal caso, desde la raíz del repositorio:

```powershell
$env:POLITICA_LEGACY_READONLY = 'RESTORED_SNAPSHOT_ONLY'
node .artifacts/production-audit/legacy-data-compare.mjs
```

La ejecución realizada concluyó con 40 filas examinadas y los resultados anteriores. El contenedor `politica-backup-restore-20260925` quedó **detenido**, con estado `exited`, red `none` y cero puertos publicados. Los ocho servicios independientes de `politica-local-staging` —web, API, worker, gateway de Storage, Storage, sus dos bases y Redis— seguían `running/healthy` en la comprobación de cierre. No se ejecutaron consultas contra producción, mutaciones SQL, eliminación de archivos ni nuevas pruebas sobre cuentas de la aplicación durante esta revisión.
