# Protocolo operativo de escrutinios y defensa poselectoral

> Corte de diseño: 9 de septiembre de 2026. Este protocolo define un control
> interno verificable; no sustituye la audiencia, la reclamación escrita, la
> notificación en estrados, los recursos ni la declaratoria de la autoridad.

## 1. Problema que debe resolver

La conciliación de E-14 termina en la mesa. La defensa electoral continúa en
comisiones auxiliares, municipales, distritales, departamentales y, cuando
corresponda, ante el CNE. La plataforma debe permitir que dirección, apoderados
y testigos sepan qué documento llegó, qué cambió, qué término corre, quién debe
actuar y cuál es la evidencia externa de que realmente actuó.

Nunca se usarán como sinónimos:

- **captura interna:** dato transcrito o documento aportado por el equipo;
- **borrador:** escrito que todavía no se ha presentado;
- **presentado externamente:** actuación con autoridad, fecha, medio, referencia
  y soporte verificables;
- **decidido externamente:** resolución o acta incorporada con evidencia;
- **resultado declarado:** dato tomado del documento final identificado, no una
  suma o predicción propia.

## 2. Expedientes mínimos

### Comisión y audiencia

Cada comisión debe quedar ligada al tenant, perfil electoral, release RNEC,
nivel territorial y ámbito exacto. Debe conservar código, sede, zona IANA,
apertura/cierre previstos, estado de la audiencia y fuente del calendario. Una
sesión registra inicio, suspensión, reanudación y cierre como eventos
append-only, con actor y hora recibida por el servidor.

Un testigo de mesa no se presume habilitado para escrutinio. La asignación a la
comisión requiere persona activa, credencial E-16, referencia de acreditación,
vigencia y franja horaria. La cobertura se calcula por comisión y tiempo; un
nombre asociado al municipio no equivale a presencia durante toda la audiencia.

### Documento electoral

Los tipos deben ser explícitos y extensibles: E-14 de claveros, E-23, E-24,
E-25, E-26, acta general, resolución, recurso, constancia de notificación y
credencial/declaratoria. El archivo se carga directamente a Storage mediante
URL firmada y el registro conserva objeto confirmado, SHA-256, tamaño, tipo de
contenido, emisor declarado, instancia, versión, corte y relación de
supersesión. Nunca se sobrescribe una versión anterior.

Una transcripción debe identificar documento, página, ámbito, candidatura/lista
y responsable. OCR solo puede producir un borrador marcado como no verificado.
Dos personas distintas deben aprobar cualquier dato usado para una
conciliación o declaratoria interna.

### Diferencia y trazabilidad de resultados

La comparación conserva ambos valores y sus fuentes, no solo la diferencia:

1. E-14 aceptado por mesa;
2. E-24 por mesa/ámbito y versión;
3. E-26 parcial o final y versión;
4. acto posterior que explique una modificación, recuento o exclusión.

Cada diferencia tiene clasificación humana, severidad, responsable, plazo,
estado y resolución. Una divergencia sin explicación permanece bloqueante. El
tablero debe separar cobertura documental, diferencias abiertas, cambios
explicados y datos declarados oficialmente; no debe proyectar ganadores.

### Reclamación, petición y recurso

El expediente interno debe incluir como mínimo:

- instancia y comisión competente declaradas;
- legitimación del actor (candidatura, apoderado o testigo acreditado);
- causal normativa versionada y referencia de la fuente;
- hechos de tiempo, modo y lugar;
- mesas/documentos afectados;
- texto versionado, anexos privados y aprobación de cuatro ojos;
- fecha límite calculada con regla y zona horaria documentadas;
- estado `DRAFT`, `APPROVED_INTERNAL`, `FILED_EXTERNAL`, `DECIDED_EXTERNAL`,
  `APPEALED_EXTERNAL`, `CLOSED` o `WITHDRAWN`;
- para estados externos: autoridad, fecha/hora, canal, número o referencia,
  soporte confirmado y hash;
- decisión, notificación, recurso y vínculo a la versión que resuelve.

El sistema no debe cambiar a `FILED_EXTERNAL`, `DECIDED_EXTERNAL` o
`APPEALED_EXTERNAL` por pulsar un botón sin soporte. Un aprobador no puede ser
quien redactó ni quien registró la supuesta radicación. Las causales y términos
no se codifican como universales: se configuran por elección, instancia y acto
vigente.

## 3. Integridad y concurrencia

Todas las tablas operativas incluyen `tenantId` y relaciones compuestas por
tenant. Los comandos mutantes usan UUID v4, hash canónico, transacción
`Serializable`, bloqueo asesor por tenant/expediente y versión optimista. La
misma solicitud con el mismo contenido devuelve el mismo resultado; reutilizar
el UUID con contenido distinto falla.

Los eventos de audiencia, custodia, radicación, decisión y notificación son
append-only. PostgreSQL debe impedir borrado, truncado, regresiones de estado,
dos versiones finales activas y relaciones cruzadas entre tenants. El cierre
de la operación comparte el mismo bloqueo transaccional con cualquier mutación
del expediente.

## 4. Operación con y sin conectividad

Durante una audiencia debe existir una cola cifrada para notas, incidentes y
borradores, con identidad, comisión, franja y release provisionados previamente.
Un registro local nunca se etiqueta como presentado. Los archivos permanecen
cifrados hasta reconexión, subida directa confirmada y recibo durable. Los
conflictos de versión, credencial, horario, etapa o competencia requieren una
decisión humana; no se descartan silenciosamente.

La contingencia manual debe definir responsables, formatos físicos, custodia,
canal de escalamiento, orden de reingreso y deduplicación. La aplicación ayuda a
ejecutarla, pero no reemplaza la presencia en la audiencia.

## 5. Puertas de alistamiento y cierre

Antes de iniciar escrutinios reales deben estar en `PASS`:

1. release electoral exacto y proyección territorial activa;
2. calendario y zonas horarias documentados;
3. comisiones esperadas y cobertura temporal E-16;
4. responsables jurídicos y ruta de escalamiento;
5. catálogo de causales/términos revisado para esa elección;
6. Storage, cola offline, simulacro y contingencia probados;
7. separación entre borradores internos y actuaciones externas.

`POST_ELECTION → CLOSED` queda bloqueado mientras existan documentos esperados
sin conciliar, diferencias materiales sin explicación, reclamaciones o recursos
abiertos, decisiones pendientes de incorporar o una declaratoria interna sin
documento final y doble aprobación. Un cierre excepcional conserva todas las
obligaciones supervivientes.

## 6. Fuentes oficiales de contraste

- [Cartilla 2026 para comisiones escrutadoras](https://www.registraduria.gov.co/IMG/pdf/cartilla_comision_escrutadora_congreso.pdf).
- [Cartilla de escrutinios](https://www.registraduria.gov.co/IMG/pdf/cartilla_escrutinios.pdf).
- [Glosario electoral de la Registraduría](https://www.registraduria.gov.co/-Glosario-863-.html).
- [Preguntas sobre reclamaciones en escrutinio](https://www.registraduria.gov.co/Quienes-participan-e-intervienen-en-un-escrutinio-4611.html).
- [Calendario presidencial 2026](https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica/fechas-importantes.html).

Estas fuentes orientan el modelo; el responsable electoral debe aprobar la
regla aplicable y su versión antes de operar cada elección.
