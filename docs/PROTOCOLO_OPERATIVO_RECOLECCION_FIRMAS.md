# Protocolo operativo de recolección de firmas

> Estado: contrato de producto para el candidato local. No sustituye los
> formularios, la revisión, la radicación ni la certificación de la autoridad
> electoral. Debe validarse para la elección y el acto particular aplicables.

## Propósito y límite de datos

La plataforma controla el plan, los lotes físicos, los conteos agregados, la
cadena de custodia, las incidencias y las constancias externas. No captura ni
digitaliza el nombre, documento, dirección, firma o imagen del firmante. Una
persona registrada como contacto tampoco se contabiliza como apoyo electoral.

Los formularios oficiales permanecen fuera de la base de datos. Si se conserva
una evidencia documental autorizada, debe utilizar el flujo de subida directa a
Storage, una ruta privada por `tenantId` y una referencia opaca; nunca se envía
el archivo a NestJS ni se publica su ruta física.

## Expediente mínimo antes de recolectar

Para una operación `SIGNATURE_COMMITTEE`, el sistema debe bloquear el inicio si
falta uno de estos elementos:

1. perfil de operación, elección, circunscripción y calendario aplicable;
2. registro del comité y constancia de sus tres integrantes;
3. fecha de registro anterior al inicio de recolección y compatible con el
   cierre de inscripciones configurado;
4. umbral requerido, meta interna superior o igual al umbral y fuente HTTPS;
5. responsable del expediente y responsables de custodia activos;
6. reglas escritas para formularios anulados, incompletos, duplicados,
   fotocopiados, impresos o intervenidos;
7. plan de entrega, fecha límite y contingencia física.

Los números legales no se codifican como constantes universales. El umbral se
registra con la fuente y la vigencia exactas porque depende de la elección. La
interfaz distingue siempre `revisión interna` de `validación de la autoridad`.

## Estados y cadena de custodia

Cada lote usa un código interno único y, si existe, una referencia opaca del
formulario o sello físico. Sus estados son:

`PLANNED → ISSUED → PARTIALLY_RETURNED → RETURNED → INTERNAL_REVIEWED →`
`DELIVERED_TO_COMMITTEE → SUBMITTED_TO_AUTHORITY → AUTHORITY_RESULT_RECORDED`.

`QUARANTINED` puede interrumpir la secuencia por pérdida, alteración,
inconsistencia o riesgo. Cerrar una cuarentena exige decisión separada y deja la
incidencia original inmutable.

Cada entrega o devolución registra actor, receptor, fecha del servidor,
territorio, cantidades físicas, sello o referencia, observación, evidencia y
SHA-256 del comando. Los comandos son idempotentes por `tenantId` y UUID; el
mismo UUID con otro contenido falla. Los saldos no pueden ser negativos y se
actualizan en una transacción `Serializable` con bloqueo de concurrencia.

## Conteos sin identidad del firmante

Por lote se admiten únicamente agregados:

- formularios entregados, devueltos, anulados, faltantes y en cuarentena;
- apoyos reportados físicamente;
- apoyos aceptados o rechazados durante revisión interna;
- posibles duplicados internos, sin conservar la identidad usada para
  detectarlos fuera del proceso autorizado;
- apoyos válidos e inválidos certificados por la autoridad, sólo después de
  registrar fuente, fecha y referencia de la constancia.

Se exige la conservación matemática:

- devueltos + anulados + faltantes + aún en custodia = entregados;
- aceptados internos + rechazados internos = revisados internos;
- ningún conteo puede disminuir mediante edición; una corrección es un evento
  compensatorio con motivo y aprobación.

El procedimiento técnico y la matriz independiente se detallan en
[`PROTOCOLO_CORRECCIONES_COMPENSATORIAS_CONTEOS_FIRMAS.md`](./PROTOCOLO_CORRECCIONES_COMPENSATORIAS_CONTEOS_FIRMAS.md).

## Puertas de etapa

- `PRE_CAMPAIGN → SIGNATURE_COLLECTION`: expediente mínimo completo.
- Permanecer en `SIGNATURE_COLLECTION`: tablero de ritmo, lotes vencidos,
  faltantes, cuarentenas y proyección conservadora hacia la meta.
- `SIGNATURE_COLLECTION → CAMPAIGN`: constancia de entrega y resultado de la
  autoridad registrados; apoyos válidos certificados mayores o iguales al
  umbral. La plataforma nunca certifica ese resultado por sí misma.
- Umbral no alcanzado, inscripción denegada o retiro: cierre excepcional con
  cuatro ojos; no se fuerza una transición ficticia a campaña.

## Indicadores accionables

El tablero muestra umbral, meta, apoyos físicos reportados, revisados internos,
válidos certificados, margen, ritmo diario requerido, lotes vencidos,
formularios faltantes, cuarentenas y responsable de cada pendiente. Cada alerta
debe enlazar a una acción real; ninguna cifra se presenta como resultado oficial
sin la constancia registrada.

## Evidencia oficial de referencia

La Registraduría indica como regla general que el comité tiene tres integrantes,
debe registrarse antes de iniciar la recolección y al menos un mes antes del
cierre de inscripciones. También publica una regla general de umbral, pero hay
regímenes especiales —por ejemplo, presidencia—, de modo que cada expediente
debe conservar su acto y cálculo particulares.

Los ingresos y gastos del comité pertenecen al expediente financiero y a
Cuentas Claras; este módulo no duplica el libro contable ni afirma radicación.

Referencias primarias consultadas:

- Registraduría, [inscripción mediante firmas](https://www.registraduria.gov.co/Como-se-realiza-la-inscripcion-mediante-firmas.html).
- Registraduría, [resultado de verificación presidencial 2026](https://www.registraduria.gov.co/15-comites-inscriptores-de-candidaturas-por-firmas-a-la-presidencia-cumplieron.html).
- Consejo Nacional Electoral, [Cuentas Claras](https://www.cne.gov.co/cuentas-claras).
