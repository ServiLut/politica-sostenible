# Protocolo de correcciones compensatorias de conteos de firmas

> Estado: control interno del expediente operativo. No modifica formularios
> oficiales, no valida apoyos, no reemplaza la revisión de la Registraduría y no
> constituye radicación, certificación ni decisión de una autoridad electoral.

## Cuándo se utiliza

Este flujo existe para corregir un error demostrado en los **conteos agregados**
de un lote. No es un editor. Antes de proponer una corrección, el lote debe estar
en `QUARANTINED` mediante el control de custodia existente. La propuesta y su
decisión no liberan la cuarentena; esa liberación sigue siendo una actuación
posterior, separada y sustentada.

No se admite identidad, cédula, dirección, firma, imagen del formulario ni otro
dato personal de quien brindó apoyo. Los originales y cualquier tratamiento
autorizado fuera de esta frontera se rigen por el procedimiento electoral y de
protección de datos aplicable.

## Fotografía completa, nunca deltas

Cada propuesta conserva, de forma append-only, la versión y el estado anterior
a la cuarentena, además del valor anterior y el valor absoluto propuesto de los
diez conteos:

1. formularios planificados;
2. formularios entregados;
3. formularios devueltos;
4. formularios anulados;
5. formularios faltantes;
6. formularios en custodia;
7. apoyos reportados;
8. apoyos aceptados internamente;
9. apoyos rechazados internamente;
10. posibles duplicados.

La interfaz calcula la diferencia para lectura humana, pero la API y PostgreSQL
aplican únicamente valores absolutos. Así se evita que un reintento, un orden
distinto o una interpretación ambigua duplique un ajuste.

Las dos fotografías deben cumplir exactamente:

- `devueltos + anulados + faltantes + en custodia = entregados`;
- `aceptados internos + rechazados internos = apoyos reportados`;
- `posibles duplicados <= rechazados internos`;
- `entregados <= planificados`;
- los conteos deben ser enteros no negativos y compatibles con el estado previo
  del lote.

## Evidencia y trazabilidad

Quien propone debe aportar una razón verificable y un archivo privado PDF o
imagen. El navegador calcula el SHA-256, solicita una URL firmada y sube el
binario directamente a Supabase Storage en
`/{tenantId}/signature-collection/{uuid}.{ext}`. NestJS sólo recibe la ruta y la
huella; nunca recibe multipart ni base64.

La propuesta sólo se crea si `StoredObject` está `CONFIRMED`, pertenece al mismo
tenant, módulo y solicitante, no fue consumido y las huellas esperada y reportada
en los metadatos de Storage coinciden. Ambas proceden del navegador: Storage no
calcula ni firma en este flujo un SHA-256 independiente del objeto. La asociación
cambia el recibo a `CONSUMED` en la misma transacción. La descarga posterior
exige autorización por recurso; la API no expone la ruta privada.

## Matriz de cuatro ojos

La persona solicitante no elige el control:

| Cambio observado | Control calculado | Único rol decisor |
| --- | --- | --- |
| Sólo inventario/custodia de formularios | `CUSTODY_COUNTS` | `COMPLIANCE_OFFICER` |
| Uno o más conteos de apoyos, incluso junto con formularios | `SUPPORT_CLASSIFICATION` | `AUDITOR` |

La decisión debe provenir de otro usuario activo. `APPROVE` reemplaza los diez
conteos en una sola operación, incrementa la versión exactamente una vez y deja
`status = QUARANTINED`. `REJECT` crea la decisión terminal, pero no modifica
ningún conteo ni la versión. No existe reapertura ni edición de una decisión; una
nueva situación exige otra cuarentena y otra propuesta compensatoria.

## Concurrencia, aislamiento y cierre

- El tenant procede exclusivamente del JWT validado.
- Todas las lecturas y escrituras filtran por tenant y las relaciones críticas
  usan llaves foráneas compuestas `(id, tenantId)`.
- `clientRequestId` UUID v4 y el SHA-256 canónico, ligado también al identificador
  de la ruta, hacen el comando idempotente. Reutilizar el UUID con otro actor,
  contenido, tipo o recurso falla.
- Propuesta y decisión usan transacciones `Serializable`, advisory locks por
  ciclo/recurso, row locks y `expectedVersion`.
- Comandos, propuestas y decisiones rechazan `UPDATE`, `DELETE` y `TRUNCATE`
  mediante triggers `ENABLE ALWAYS`.
- Una operación `CLOSED` falla tanto en guard de NestJS como en PostgreSQL. Una
  propuesta pendiente bloquea readiness, salida de la etapa y liberación de la
  cuarentena.

## Verificación exigida antes de desplegar

La migración `20260909290000_signature_count_corrections` es aditiva, está
envuelta en `BEGIN/COMMIT` y no modifica la migración histórica 240. El gate debe
probar en PostgreSQL 16 una cadena limpia de migraciones, rollback, aislamiento,
inmutabilidad, dos decisiones concurrentes, rechazo sin cambio, aprobación
atómica y permanencia en cuarentena. La interfaz se prueba con Chrome de
escritorio y Pixel con `retries: 0`.

## Límites residuales honestos

- El sistema no interpreta el contenido del archivo ni determina que el recuento
  sea verdadero; el revisor especializado conserva esa responsabilidad.
- El SHA-256 declarado enlaza el archivo escogido por el navegador con el
  comando y detecta corrupción accidental; no demuestra frente a un cliente
  malicioso identidad de bytes, autenticidad jurídica, autoría o suficiencia
  probatoria.
- No hay integración oficial con la Registraduría ni transmisión automática.
- Los umbrales, formularios y procedimientos deben validarse para la elección y
  acto concretos. La Registraduría describe el marco general en
  [inscripción mediante firmas](https://www.registraduria.gov.co/Como-se-realiza-la-inscripcion-mediante-firmas.html);
  esa referencia no convierte este control interno en una regla oficial.
