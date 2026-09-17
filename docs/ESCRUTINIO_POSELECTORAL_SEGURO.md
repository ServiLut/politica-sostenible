# Expediente seguro de escrutinio poselectoral

## Propósito y límite institucional

El módulo `/dashboard/scrutiny` organiza el trabajo del equipo durante el
escrutinio, conserva evidencia y permite comprobar quién hizo cada actuación.
No reemplaza a la autoridad electoral, no calcula ganadores y no eleva una
digitación de campaña a resultado oficial. La fuente jurídica y documental
vigente debe ser verificada por el equipo responsable en cada elección.

## Contrato probatorio invariable

| Estado | Significado dentro del sistema | Lo que no significa |
| --- | --- | --- |
| `INTERNAL` | Captura, transcripción o borrador del equipo | Radicación, decisión o resultado oficial |
| `FILED` | Actuación presentada externamente, con autoridad, fecha, canal, radicado y soporte | Que la autoridad la haya decidido |
| `DECIDED` | Decisión externa incorporada desde documento revisado | Declaración oficial del resultado |
| `OFFICIAL` | Documento expedido por la autoridad competente e incorporado con segunda revisión | Proyección, inferencia o cálculo del sistema |

Una declaración nace como `DRAFT_INTERNAL`. Solo otra persona puede aprobarla
y el servicio exige como fuente una resolución o credencial `OFFICIAL`, ya
aprobada por cuatro ojos. La interfaz usa “Resultado oficial documentado” solo
para una declaración que completó ese flujo.

## Flujo operativo

1. Registrar la comisión, ámbito, sede, horario, fuente del calendario, líder
   jurídico, escalamiento y contingencia.
2. Decidir expresamente para cada tipo documental si es `REQUIRED` o
   `NOT_APPLICABLE`; no se infiere aplicabilidad por ausencia.
3. Cubrir el horario de cada comisión con turnos E-16 de testigos activos y una
   credencial E-16 revisada. El sistema expresa los intervalos y sus brechas.
4. Incorporar E-14, E-16, E-23, E-24, E-25, E-26, resoluciones, credenciales y
   otros soportes mediante subida directa al Storage privado.
5. Una segunda persona revisa el documento y la cadena de custodia registra
   recepción, transferencia, verificación, sellado, archivo o liberación.
6. Registrar discrepancias conservando ambos valores y sus fuentes. Resolverlas
   requiere una fuente `DECIDED` u `OFFICIAL` aprobada.
7. Preparar solicitudes, reclamaciones, recursos y nulidades con legitimación,
   causal, hechos, fundamento jurídico versionado, autoridad, término, zona
   horaria, referencias afectadas y evidencia.
8. Separar redacción, aprobación y radicación entre tres actores. Las decisiones
   externas y la declaración oficial también requieren revisión independiente.

## Seguridad y trazabilidad

- Todas las filas operativas incluyen `tenantId`; sus relaciones sensibles usan
  llaves foráneas compuestas que también contienen el tenant.
- Cada mutación lleva UUID v4, SHA-256 de un JSON canónico e idempotencia
  central. El servicio vuelve a comprobar tenant, usuario activo, rol y etapa
  dentro de una transacción `SERIALIZABLE`.
- Los recursos se serializan con advisory locks y usan versión optimista. Los
  eventos, versiones, custodia, comandos y líneas declaradas son append-only;
  PostgreSQL rechaza `UPDATE`, `DELETE` y `TRUNCATE` donde corresponde.
- El navegador envía el archivo directamente a Supabase Storage con URL firmada.
  NestJS recibe solo metadatos, ruta y hash; consume exactamente el objeto
  confirmado y nunca procesa el binario.
- La descarga se solicita por id de recurso, no por una ruta arbitraria, y genera
  una URL de lectura breve después de volver a validar tenant y rol.

## Etapas y cierre

- `ELECTION_DAY`: permite alistamiento documental y apertura del expediente
  cuando empieza el escrutinio.
- `POST_ELECTION`: permite toda la operación poselectoral.
- `CLOSED`: consulta y auditoría únicamente; no hay formularios de mutación.

El cierre ordinario se bloquea si no hay comisión configurada, una comisión no
está cerrada, queda aplicabilidad pendiente, falta un documento requerido o su
custodia, existe una discrepancia o actuación abierta, hay una decisión sin
segunda revisión, o se declaró obligatoria una credencial de declaración y no
existe resultado oficial documentado. Un documento o una declaración que no
aplica legalmente no bloquea después de una decisión explícita y justificada de
`NOT_APPLICABLE`.

## Límites conocidos y operación responsable

- No existe integración que consulte automáticamente expedientes o resultados
  de la Registraduría/CNE; la autenticidad material y vigencia de cada fuente
  externa siguen requiriendo verificación humana.
- El módulo no hace OCR, cotejo criptográfico de firmas de la autoridad ni
  cálculo automático de términos legales. Conserva la regla, fuente y zona
  horaria declaradas para que una persona competente las verifique.
- El PWA puede instalarse y mostrar la experiencia general sin conexión, pero
  las mutaciones de escrutinio no se encolan offline: requieren conectividad para
  bloquear, validar la versión vigente y escribir de manera serializable. Esto
  evita que una copia desactualizada radique o oficialice información.
- Un simulacro local y pruebas automatizadas no sustituyen una prueba de
  aceptación con usuarios, una revisión jurídica de la elección concreta, una
  restauración ensayada ni la observación de producción. Este cambio no despliega
  ni modifica producción.

