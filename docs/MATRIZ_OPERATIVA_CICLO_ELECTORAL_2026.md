# Matriz operativa del ciclo electoral

> Corte: 10 de septiembre de 2026. Describe el candidato local, no la versión
> antigua que continúa en producción. No constituye concepto jurídico, contable
> ni electoral ni certifica una actuación ante autoridad.

## 1. Convenciones y gobierno

Estados:

- **Operativo en el candidato:** implementación local disponible; falta
  promoción y prueba en staging/producción.
- **Control preventivo:** el sistema bloquea o advierte porque no puede demostrar
  una condición.
- **Pendiente interno:** falta implementación, integración o prueba.
- **Pendiente externo:** depende de fuente autorizada, proveedor, configuración,
  validación profesional o actuación institucional.

La gobernanza de etapas no promete cuatro ojos universales. Una transición
ordinaria la realiza un actor autorizado y queda sujeta al grafo irreversible,
readiness, concurrencia y auditoría. La adopción de una operación con historia
previa y la terminación excepcional sí exigen solicitante y revisor distintos.
Finanzas, catálogo, firmas, escrutinio, retención y PQRSD aplican separaciones
adicionales donde el riesgo lo exige.

Cada indicador debe conducir a responsable, plazo, acción y evidencia. Un dato
privado no es resultado oficial; una exportación no es radicación; un contacto
no es consentimiento; un apoyo capturado no es firma válida; y el fin de una
campaña no autoriza transferir su base a una entidad pública.

## 2. Antes de la campaña

| Necesidad real | Respuesta del candidato | Evidencia exigida | Estado |
| --- | --- | --- | --- |
| Delimitar elección, organización y responsables | Perfil tenant-scoped con modo, elección, ronda, presupuesto, fecha y responsables | Versión y evento auditado | Operativo en el candidato |
| No inventar historia | Grafo de exploración, precampaña, firmas, campaña, preparación, simulación, jornada, poselección y cierre | Evento irreversible por transición | Operativo en el candidato |
| Incorporar una operación ya iniciada | Expediente de adopción con historia declarada y revisión independiente | Dos personas, justificación, fecha, hash y evidencia | Operativo en el candidato |
| Definir calendario real | Paquetes versionados con fuente, vigencia, zona IANA, responsables, suplentes e hitos | Activación de cuatro ojos y resultados por hito | Operativo como control interno; validación de fuente pendiente externo |
| Definir finalidad y privacidad | Aviso versionado, base, canales, derechos, revocación y retención | Una versión activa inequívoca y canal de derechos | Operativo; criterio del responsable pendiente externo |
| Configurar cumplimiento financiero | Elección, alcance, topes/códigos configurables, fecha límite, gerente, contador y cuenta | Fuente vigente y responsables distintos | Operativo como expediente interno; validación profesional pendiente |
| Construir equipo real | Roles para dirección, finanzas, cumplimiento, auditoría, comunicaciones, territorio y testigos | Cuenta activa, rol y ámbito | Operativo en el candidato |
| Distinguir administración de elección | DANE sólo inicializa departamentos/municipios; un release electoral proyecta zonas, puestos y mesas | Procedencia y corte separados | Operativo como distinción |
| Preparar catálogo electoral | Release inmutable, parser, worker, cuarentena, diff, cuatro ojos y proyección versionada | Fuente, licencia/autorización, SHA, elección y corte | Control preventivo: no activar fuente RNEC hasta acreditar reutilización y resolver ambigüedades |
| Recoger apoyos por GSC | Expediente, formularios/seriales, lotes, custodios, entregas, devoluciones y conteos | Cadena de custodia y conciliación | Operativo como control interno; no valida apoyos ni radicación |
| Corregir conteos sin borrar historia | Propuesta de fotografía completa y compensatoria | Evidencia privada, matriz de revisión y decisión append-only | Operativo; cuarentena no se libera por inferencia |

### Puerta de salida de “Antes”

No se declara lista la operación si falta perfil coherente, elección/fecha,
aviso activo, paquete de calendario, expediente financiero, equipo distinto de
una sola cuenta administradora, fuente de datos, procedimiento de derechos,
responsables suplentes o contingencia manual.

Para una operación GSC también deben resolverse formularios faltantes,
cuarentenas, conciliación, umbral configurado y resultado aplicable. El producto
no sustituye el procedimiento electoral.

## 3. Campaña y territorio

| Necesidad real | Respuesta del candidato | Evidencia exigida | Estado |
| --- | --- | --- | --- |
| Convertir estrategia en ejecución | Metas, tareas, eventos, casos, propuestas y bandeja | Responsable, vencimiento, avance y cierre | Operativo en el candidato |
| Ver vacíos territoriales | Mapa de calor por departamento, municipio, zona y puesto | Métrica, filtros, origen, supresión y contexto | Operativo sobre datos disponibles |
| Consultar mapas sin red | Snapshot mínimo de mapa de calor | Versión, momento de corte y aviso de posible obsolescencia | Operativo en alcance offline; no reemplaza la lectura viva |
| Capturar en campo sin red | PWA y bóveda AES-GCM para captura territorial | Preaprovisionamiento, clave sólo en memoria, pendiente cifrado y estado visible | Operativo en alcance definido; el resto del dashboard exige red |
| Evitar duplicados | Comando idempotente, HMAC tenant-scoped y recibo durable | Mismo UUID+contenido da el mismo resultado; contenido distinto falla | Operativo |
| Resolver conflicto al reconectar | Revalidación de rol, tenant, finalidad, territorio y recurso | Pendiente conservado y conflicto accionable | Operativo |
| Importar personas con prudencia | Previsualización, cuarentena y revalidación transaccional; código completo de puesto autoritativo | Evidencia confirmada y reporte de filas | Operativo |
| Comunicar con control | Solicitud, audiencia, fuente, segmentación, IA, derechos y aprobación | Hash, decisión y evidencia de entrega externa | Aprobación interna operativa; envío, baja y rebote pendientes de proveedor |
| Controlar incidentes | Incidente con severidad, responsable, escalamiento y resolución | Línea de tiempo y cierre | Operativo conectado y offline |
| Vigilar finanzas durante campaña | Libro, soporte privado, conciliación, revisión y alertas | Movimiento, tercero, código, cuenta y revisor | Operativo como control interno |

### Rutina mínima diaria

- Dirección resuelve bloqueantes de readiness y decisiones vencidas.
- Territorio revisa cobertura, metas, reemplazos e incidentes sin responsable.
- Cumplimiento revisa fuente, consentimiento, importaciones, derechos y
  comunicaciones.
- Finanzas concilia libro, extracto, soportes y pendientes todos los días.
- Auditoría revisa roles, exportaciones, evidencias, correcciones y operaciones
  de alto impacto.
- Cada responsable confirma suplente y canal manual de contingencia.

## 4. Preparación y simulación

| Necesidad real | Respuesta del candidato | Evidencia exigida | Estado |
| --- | --- | --- | --- |
| Congelar el universo electoral | Exactamente una proyección activa derivada de un release aprobado | Fuente, autorización/licencia, SHA, diff y revisores distintos | Pipeline operativo; activación real pendiente externo |
| Preparar mesas esperadas | Puestos y mesas asociados a elección/ronda | Conteos y jerarquía válidos | Operativo sólo con catálogo autorizado |
| Cubrir cada turno | Asignaciones temporales por puesto y mesa | Inicio/fin en zona IANA y ausencia de huecos | Operativo |
| Tener titular y respaldo | Cobertura completa de cada mesa esperada por principal y backup | Usuario activo, credencial, territorio y ventanas compatibles | Operativo |
| Evitar usar Día D como ensayo | Etapa `SIMULATION` y tenant/datos sintéticos | Evento, resultados y defectos | Operativo; simulacro humano pendiente |
| Provisionar offline | Grants acotados, shell, bóveda, mapas y calendario antes de la desconexión | Dispositivo, versión, expiración y revocación | Operativo en alcance definido |

### Puerta exacta para entrar a Día D

La transición falla sin modificar la etapa si falta una sola condición:

1. la fecha civil de Bogotá está dentro de la ventana electoral configurada;
2. existe exactamente una proyección activa para la elección y ronda;
3. la proyección contiene al menos un puesto;
4. cada puesto tiene un número válido de mesas esperadas;
5. la ventana operativa de cada puesto queda cubierta por completo;
6. cada mesa esperada tiene cobertura principal completa;
7. cada mesa esperada tiene cobertura de respaldo completa.

Un promedio, un porcentaje global o “al menos un testigo activo” no sustituye
esta comprobación.

## 5. Jornada electoral

| Necesidad real | Respuesta del candidato | Evidencia exigida | Estado |
| --- | --- | --- | --- |
| Confirmar presencia | Check-in ligado a credencial E-15/E-16, puesto, mesa, hora y asignación | Usuario/grant vigente y ventana autorizada | Operativo |
| Capturar E-14 conectado | Tipo, desglose, observaciones y archivo privado subido directo | StoredObject confirmado, tamaño, tipo y asociación transaccional; el flujo conectado no recalcula SHA de bytes | Operativo como reporte interno con integridad de contenido no verificada independientemente |
| Capturar E-14 sin red | Bóveda AES-GCM, grant acotado, archivo cifrado y comando idempotente | Pendiente durable, recibo y conflicto visible | Operativo en el candidato |
| Reportar incidentes sin red | Captura cifrada y sincronización durable | UUID, hash, receipt y revalidación viva | Operativo |
| Detectar capturas incompatibles | Divergencias visibles y revisión humana | Comparación por mesa y decisión auditada | Operativo |
| Formular reclamación interna | Causal, texto, documento y seguimiento | Revisión jurídica/electoral | Operativo como expediente; actuación oficial pendiente externo |
| Ver cobertura | Mapa de calor agregado con supresión de baja muestra | Métrica y origen explícitos | Operativo online y como snapshot offline |
| Mantener límites | Etiquetas de reporte privado y fuente | Ninguna inferencia de ganador/oficialidad | Control preventivo |

La contingencia humana sigue siendo obligatoria: responsables de escalamiento,
formatos alternos, verificación de identidad, custodia física, transporte,
priorización, reingreso y deduplicación, canal real de reclamación y criterio de
suspensión.

## 6. Escrutinio y poselección

| Necesidad real | Respuesta del candidato | Evidencia exigida | Estado |
| --- | --- | --- | --- |
| Seguir comisiones y sesiones | Expediente de comisión, sesión y cobertura | Responsables, fechas y estado | Operativo como control interno |
| Conservar documentos E-24/E-26 y otros | Versiones, hash, custodia y revisión | Objeto privado confirmado y eventos append-only | Operativo |
| Gestionar discrepancias y reclamaciones | Hallazgo, reclamación, corrección, referencia externa y decisión | Revisión independiente y evidencia | Operativo internamente; radicación/decisión externa no automatizada |
| No declarar con evidencia débil | Gate sobre aplicabilidad, revisión y estado externo | Código resoluble por bloqueante | Operativo |
| Conciliar cierre financiero | Readiness único para tablero, cierre y empalme | Mismos códigos y misma fotografía de bloqueantes | Operativo en el candidato |
| Evitar movimientos sin reportar | Bloqueo de pendientes y aprobados aún no reportados | Versión del informe y asignación de movimientos | Operativo |
| Completar expediente financiero | Configuración/plazo, dossier/version, extracto, conciliación, cuentas por pagar, tres controles independientes y evidencia externa revisada | Historia inmutable y revisores distintos | Operativo como control interno; presentación oficial pendiente |
| Cerrar incidentes críticos | Bloqueo por pendientes urgentes | Responsable, resolución y auditoría | Operativo |
| Generar expediente de cierre/empalme | Snapshot con pendientes, política de transición y SHA-256 | Evento y descarga | Operativo como expediente interno |

El cierre financiero, el expediente de empalme y la pantalla de estado no pueden
usar evaluadores distintos: deben devolver los mismos bloqueantes ante la misma
fotografía.

## 7. Retención, cierre y ejercicio del cargo

| Necesidad real | Respuesta del candidato | Evidencia exigida | Estado |
| --- | --- | --- | --- |
| Cerrar de forma ordinaria | Actor autorizado + grafo irreversible + readiness integral | Evento y códigos de bloqueante | Operativo; no es un flujo universal de cuatro ojos |
| Terminar excepcionalmente | Solicitud, revisión independiente y justificación | Dos personas, snapshot y auditoría | Operativo |
| Retener o disponer con control | Política, inventario, propuesta, revisión, legal hold y estado `APPROVED_NOT_EXECUTED` | Decisiones y recursos afectados | Operativo hasta aprobación; no ejecuta borrado |
| Evitar falsa eliminación | Ausencia deliberada de worker destructivo | Ningún claim de borrado material | Control preventivo |
| Separar campaña y cargo | Tenant `PUBLIC_OFFICE`, finalidad, roles y aviso propios | Nuevo objeto y procedencia compatible | Separación técnica operativa |
| Atender PQRSD | Reglas versionadas, PII separada, competencia, suplencia, traslados, prórrogas, respuestas, revisión, entrega y reapertura | Expediente y alertas | Operativo local; sin radicación, firma o notificación institucional |
| Dar seguimiento a compromisos públicos | Indicadores, línea base, meta, fuente, corte, evidencia y agenda legislativa | Aprobación y soporte por resultado | Pendiente interno |
| Transferir información al cargo | Evaluación formal registro por registro | Base compatible, autorización, minimización y nueva procedencia | Pendiente interno/externo; nunca automático |

El expediente poselectoral y PQRSD son registros internos hasta que una actuación
externa real quede aportada y revisada. No prueban cumplimiento contable,
declaratoria, radicación, firma o notificación.

## 8. Bloqueos de producción

No debe promoverse este candidato mientras falte:

1. respaldo externo cifrado y restauración ensayada de PostgreSQL y Storage;
2. inventario real de `_prisma_migrations` y ensayo por schema;
3. staging equivalente con tenant, roles y datos sintéticos;
4. ejecución final de todos los gates sobre un commit/digest inmutable;
5. conexión PostgreSQL directa compatible con `search_path`; los poolers de
   transacción no están permitidos para el runtime;
6. Redis, Supabase, secretos, límites, alertas y runbooks por ambiente;
7. autorización/licencia verificable del catálogo electoral;
8. simulacro humano completo, incluidos offline, carga, reemplazo, conflicto,
   escrutinio, finanzas, PQRSD y recuperación;
9. validación profesional de reglas y responsables;
10. smoke posterior al despliegue y ventana de observación.

La producción actual continúa sin PWA ni puestos electorales cargados. Ninguna
capacidad local debe anunciarse allí antes de completar estos pasos.
