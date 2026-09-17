# Protocolo PQRSD para gestión pública

> Corte: 10 de septiembre de 2026.
>
> Estado honesto: existe un expediente PQRSD seguro en el candidato local para
> tenants `PUBLIC_OFFICE`. No está desplegado ni validado por una entidad y no
> integra radicación, firma o notificación institucional. Por tanto, sólo puede
> describirse como control interno hasta superar la puerta de aceptación de este
> documento.

La implementación y sus límites técnicos se detallan en
[PQRSD de gestión pública segura](./PQRSD_GESTION_PUBLICA_SEGURA.md). El registro
liviano `CAS-GP` es otro flujo y no debe confundirse con el expediente PQRSD.

## 1. Límite jurídico y de producto

La [Ley 1755 de 2015](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=65334)
establece un marco general para el derecho de petición. Clasificación,
excepciones, competencia, días hábiles, traslados, prórrogas, firma y
notificación dependen del caso, la entidad y las reglas vigentes. El software no
convierte “10, 15 o 30 días” en una regla jurídica universal.

Hasta que la entidad apruebe por escrito configuración, responsabilidades y
criterios:

- `PQRSD-INT-*` es una referencia interna, no un radicado externo;
- un acuse interno no demuestra recepción por un canal institucional;
- `AUTHORIZED` no equivale a firma;
- `DELIVERED` sólo expresa una entrega documentada dentro del expediente y no
  crea una notificación jurídica por sí sola;
- `CLOSED` no certifica respuesta o cumplimiento ante autoridad de control.

## 2. Garantías disponibles en el candidato local

| Área | Control interno implementado | Límite explícito |
| --- | --- | --- |
| Ámbito | Sólo tenant `PUBLIC_OFFICE`; modo y tenant derivados del JWT | No hereda personas, finalidades ni permisos de campaña |
| Reglas | Paquetes versionados por tenant/ámbito, fuente HTTPS, referencia, SHA-256, vigencia, zona IANA, días no laborables, excepciones y método | La entidad debe validar el contenido |
| Activación | Borrador y revisión independiente; un solo paquete activo | No publica ni homologa la regla |
| Recepción | Fecha/hora, canal, datos mínimos y radicado externo sólo cuando se aporta | No se conecta a ventanilla o sede electrónica |
| Privacidad | PII separada, listados enmascarados y acceso de alto impacto auditado | No sustituye política, registro de bases ni atención real de derechos |
| Plazo | Congela la regla aplicable, conserva cálculo, original/vigente y casos que requieren revisión | No resuelve ambigüedad jurídica |
| Competencia | Clasificación, análisis, responsable, suplente e historia de asignación | La decisión material sigue siendo humana |
| Traslado/prórroga | Propuesta, justificación y decisión independiente | No envía el traslado ni notifica la prórroga |
| Respuesta | Versiones inmutables, devolución, revisión y autorización | No aplica firma institucional |
| Entrega | Intentos, canal, resultado, referencia y evidencia | No existe proveedor institucional ni validación jurídica de notificación |
| Evidencia | URL firmada, subida directa, StoredObject confirmado y SHA esperado/reportado | Ambos SHA proceden del cliente; prueban continuidad declarada, no identidad de bytes verificada ni autenticidad jurídica |
| Cierre/reapertura | Causal, evento append-only y controles de estado | No impide actuaciones que ocurran fuera del sistema |
| Alertas | Vencimientos, competencia, suplencia, traslados, devueltos, autorizados sin entrega y reabiertos | Dependen de reglas válidas y operación diaria |

## 3. Expediente mínimo

Cada actuación debe conservar:

- canal y momento de recepción, zona IANA y evidencia de acuse;
- radicado externo sólo si fue emitido realmente;
- identidad y contacto mínimos del peticionario con ACL reforzada;
- paquete/regla congelados, clasificación, asunto y competencia;
- dependencia, titular, suplente e historia de asignación;
- cálculo reproducible, vencimiento original y vigente;
- traslados, solicitudes de información y prórrogas con motivo y decisión;
- versiones inmutables de respuesta y devoluciones;
- revisión y autorización separadas cuando el riesgo lo exige;
- intentos de entrega, resultado, evidencia y revisión;
- causal de cierre, reaperturas y recursos;
- auditoría sin contenido sensible en logs o listados generales.

Los anexos se cargan directamente a Storage mediante URL firmada. Nest no recibe
binarios. Un documento de dominio sólo puede consumir un `StoredObject` PQRSD
confirmado del mismo tenant y expediente cuyo tipo, tamaño y SHA declarado sean
coherentes. Storage no calcula ni firma en este flujo un SHA-256 independiente
del objeto.

## 4. Reglas y términos

Cada paquete declara fuente, referencia, vigencia, SHA-256, zona horaria,
calendario no laborable, excepciones y método de cómputo. La activación exige
creador y revisor distintos.

El cálculo conserva:

- fecha de inicio y explicación del día desde el cual cuenta;
- días incluidos y excluidos;
- vencimiento original y vigente;
- razón y autoridad declarada de cada cambio;
- indicador `CALCULATION_REQUIRES_REVIEW` si una regla no puede resolverse.

Nunca se mueve silenciosamente una fecha por fin de semana o festivo. Activar
otro paquete no reescribe expedientes existentes. La comparación masiva entre
versiones y la resolución humana de casos afectados aún no tienen una consola
dedicada y deben tratarse como límite operativo.

## 5. Flujo implementado

La ruta principal de estados del expediente es:

`RECEIVED → CLASSIFICATION_PENDING → CLASSIFIED → ASSIGNED → IN_PROGRESS →
DRAFT_RESPONSE → REVIEWED → AUTHORIZED → DELIVERY_PENDING → DELIVERED →
CLOSED`.

El acuse y la revisión de competencia son registros/decisiones con evidencia,
no estados ficticios adicionales del expediente.

También existen ramas explícitas para falta de competencia, traslado, espera del
peticionario, propuesta de prórroga, devolución de respuesta, cancelación y
reapertura.

Reglas:

1. recepción congela el paquete aplicable y crea referencia interna;
2. el acuse registra el hecho y su evidencia, no inventa un radicado;
3. clasificación y competencia preceden la asignación;
4. titular y suplente son distintos y un cambio no reinicia términos;
5. traslado exige destino, motivo, plazo e intento de entrega;
6. prórroga conserva vencimiento original, cálculo y motivación;
7. cada edición de respuesta crea otra versión;
8. quien redacta no autoriza su propia respuesta cuando la matriz exige
   separación;
9. `DELIVERED` exige un intento exitoso, referencia/evidencia del mismo
   expediente y revisión independiente;
10. cerrar exige entrega documentada, traslado concluido o causal explícita;
11. corregir después del cierre requiere reapertura, nunca reescritura.

Esta separación no significa que cada transición de toda la plataforma tenga
cuatro ojos; aplica al subproceso y nivel de riesgo indicados.

## 6. Privacidad y separación campaña–cargo

- No existe búsqueda cruzada desde PQRSD hacia el CRM electoral.
- No se copian automáticamente consentimiento, afinidad, etiquetas,
  interacciones ni contactos de campaña.
- Una transferencia futura necesita evaluación formal registro por registro,
  base compatible, minimización, autorización/evidencia y un objeto nuevo en el
  tenant destino con procedencia propia.
- Listados enmascaran documento, teléfono y correo.
- El acceso al detalle y las exportaciones quedan auditados; exportar exige
  finalidad, justificación y alcance.

La interfaz técnica separa ambos mundos, pero el flujo formal de transferencia
registro por registro sigue pendiente y no debe simularse con una importación
manual.

## 7. Alertas y operación diaria

La bandeja distingue:

- vencidos, vencen hoy y ventanas configuradas de próximos vencimientos;
- sin clasificación, competencia, responsable o suplente;
- traslado o prórroga pendientes;
- en espera de tercero o peticionario;
- borradores devueltos;
- autorizados sin evidencia de entrega;
- intentos fallidos, reabiertos y alto riesgo.

Cada alerta abre el expediente exacto. Un cambio de responsable no borra historia
ni reinicia el plazo. El tablero no reemplaza valores ausentes por cero y no
puede presentarse como prueba de monitoreo institucional sin operación y alertas
reales.

## 8. Concurrencia, aislamiento y auditoría

- `tenantId` es obligatorio en modelos operativos y las relaciones sensibles
  usan aislamiento por tenant.
- Tenant y modo provienen del JWT revalidado; el cliente no los elige.
- Los comandos críticos son idempotentes.
- Las transiciones sensibles usan transacción serializable, bloqueo y
  comprobación de versión.
- Dos decisiones incompatibles no pueden ganar.
- Acuses, versiones, revisiones, traslados, intentos de entrega y reaperturas son
  append-only.
- Una operación institucional cerrada bloquea mutaciones ordinarias; cualquier
  excepción necesita un flujo explícito.

Estas garantías locales no sustituyen pruebas contra PostgreSQL restaurado,
staging equivalente, concurrencia real ni revisión de seguridad.

## 9. Lo que todavía no existe

El candidato no:

- recibe directamente desde la sede electrónica o ventanilla de la entidad;
- genera o reconcilia por sí mismo el radicado oficial;
- firma una respuesta con mecanismo institucional;
- envía email, SMS, correo certificado u otra notificación;
- consulta rebotes, acuses jurídicos o estados de un proveedor;
- decide competencia, excepción o suficiencia jurídica;
- valida automáticamente la identidad del peticionario;
- presenta reportes a una autoridad de control;
- transfiere automáticamente información desde campaña;
- demuestra restauración, staging o operación productiva.

## 10. Puerta para denominarlo canal PQRSD

No debe anunciarse como canal formal hasta demostrar en staging y obtener
aceptación escrita de la entidad para:

1. paquete de reglas, calendario, responsables y suplentes;
2. recepción, acuse y reconciliación del radicado externo;
3. clasificación, competencia, traslado y prórroga;
4. cálculo reproducible y casos ambiguos fail-closed;
5. respuesta versionada, revisión, autorización y firma institucional;
6. entrega/notificación real, rebote, reintento y evidencia;
7. ACL, enmascaramiento, auditoría, exportación y aislamiento entre tenants;
8. concurrencia PostgreSQL, escritorio y móvil sin retries ocultos;
9. contingencia, backup externo y restauración ensayada;
10. validación jurídica, funcional, seguridad y aceptación formal de la entidad;
11. smoke posterior al despliegue del mismo commit/digest aprobado.

Hasta entonces puede usarse sólo como expediente interno asistido. El lenguaje
de producto debe mantener esa limitación visible en cada pantalla, descarga y
reporte.
