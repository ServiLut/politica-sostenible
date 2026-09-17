# PQRSD de gestión pública: arquitectura, operación y límites

> Estado del candidato: implementado y probado localmente el 9 de septiembre
> de 2026. No ha sido desplegado ni validado en producción. La entidad usuaria
> debe aprobar por escrito reglas, calendario, responsabilidades y criterios de
> aceptación antes de presentarlo como canal formal.

Este módulo es exclusivo de tenants `PUBLIC_OFFICE`. No consulta
`OperationProfile`, no busca personas en CRM electoral y no comparte filas con
el registro liviano `CAS-GP`. La ruta de trabajo es `/dashboard/pqrsd`; CAS-GP
permanece en `/dashboard/cases`.

## Garantías implementadas

| Control | Implementación |
| --- | --- |
| Configuración legal | Paquetes versionados por tenant y ámbito con fuente HTTPS, referencia, SHA-256, zona IANA, vigencia, días no laborales, excepciones y regla de cómputo explícita. No existen plazos universales 10/15/30. |
| Activación | Borrador y decisión independiente; una restricción parcial de PostgreSQL permite un solo paquete activo por tenant/ámbito. |
| Recepción | El expediente congela el paquete vigente a la fecha civil de recepción. `PQRSD-INT-*` es una referencia interna, nunca un radicado externo inventado. |
| Privacidad | El listado sólo selecciona campos preenmascarados. El detalle sensible exige finalidad y escribe un ledger de acceso y auditoría sin copiar contenido/PII al evento. No hay exportación PQRSD. |
| Evidencia | El navegador calcula SHA-256, pide URL firmada, sube directo a Supabase Storage y confirma metadatos. Nest no recibe binarios. Un documento de dominio sólo consume un `StoredObject` PQRSD confirmado cuyo hash esperado y reportado coinciden. |
| Flujo | Acuse, clasificación/competencia, responsable y suplente, traslado, prórroga, versiones de respuesta, revisión, autorización, intentos de entrega, cierre y reapertura son hechos separados. |
| Estado externo | Un borrador no es respuesta autorizada. `DELIVERED` exige referencia externa, evidencia del mismo expediente y revisión independiente. La UI declara que no envía ni notifica automáticamente. |
| Historia | Reglas, documentos, revisiones, plazos, asignaciones, traslados, respuestas, entregas, cierres, reaperturas, estados y comandos son append-only. Un expediente `CLOSED` es de sólo lectura salvo el comando formal de reapertura. |
| Concurrencia | Cada comando usa UUID por tenant, SHA canónico, versión esperada, transacción `SERIALIZABLE`, advisory lock y revalidación de tenant/usuario/rol dentro de la transacción. |
| Alertas | Deep link exacto al expediente para vencido, hoy, 1/3/5/10 días hábiles del snapshot, plazo ambiguo, clasificación/competencia, traslado, asignación o suplencia inactiva, borrador devuelto, autorización sin entrega, reapertura y riesgo alto. Los ausentes nunca se muestran como cero. |

## Flujo operativo

1. Una persona prepara el paquete normativo/calendario a partir de la fuente
   institucional y otra lo aprueba o rechaza.
2. Recepción registra datos mínimos y, cuando exista, el radicado externo real.
3. El acuse se incorpora como archivo privado y una persona distinta revisa el
   documento antes de asociar el número de acuse.
4. Clasificación y competencia se proponen y revisan. El plazo se reproduce
   desde el snapshot; una regla ambigua queda en
   `CALCULATION_REQUIRES_REVIEW` hasta registrar fecha, motivo y autoridad.
5. La entidad asigna responsable principal y suplente distintos. Cambiar la
   asignación agrega historia y no reinicia el plazo.
6. Traslado y prórroga son propuestas sin efecto hasta revisión independiente.
7. Cada ajuste de respuesta crea una versión nueva. Redactor, revisor y
   autorizador son personas distintas; autorizar exige artefacto aprobado.
8. Cada intento externo conserva canal, fecha, resultado, referencia y causal.
   Sólo la constancia aprobada habilita `DELIVERED`.
9. El cierre exige entrega/traslado verificado o causal, fundamento y soporte.
   La reapertura exige soporte aprobado y un autorizador distinto de quien
   cerró y de quien preparó ese soporte.

## Evidencia de verificación local

Los siguientes gates se ejecutan sobre datos sintéticos, nunca sobre
producción:

```powershell
pnpm --dir apps/api test -- --runInBand --runTestsByPath src/pqrsd/pqrsd.hash.spec.ts src/pqrsd/pqrsd-deadline.spec.ts src/pqrsd/dto/pqrsd.dto.spec.ts src/pqrsd/pqrsd-schema.spec.ts src/pqrsd/pqrsd.controller.spec.ts src/pqrsd/pqrsd.service.spec.ts src/storage/pqrsd-storage.service.spec.ts
$env:PQRSD_INTEGRATION_DATABASE_URL='postgresql://.../politica_pqrsd_test?schema=public'
pnpm --dir apps/api test -- --runInBand --runTestsByPath src/pqrsd/pqrsd-postgres.integration.spec.ts
pnpm exec playwright test --config playwright.unit.config.ts apps/web/lib/pqrsd-api.unit.spec.ts apps/web/config/pqrsd-navigation.unit.spec.ts
pnpm exec playwright test e2e/pqrsd.spec.ts --project=desktop-chrome --project=mobile-chrome
```

La prueba física requiere PostgreSQL 16 y comprueba cuatro ojos con rollback,
activación formal, append-only, restricción PUBLIC_OFFICE, FK compuesta entre
tenants y dos activaciones concurrentes bajo `SERIALIZABLE`.

## Límites y puerta de salida

Este candidato no radica, firma, notifica ni consulta una autoridad o proveedor
externo. El artefacto de autorización conserva evidencia documental, pero aún no
integra una firma electrónica institucional ni valida certificados. Tampoco se
modelaron como subexpedientes especializados los recursos, solicitudes a
terceros, suspensiones o incidentes de datos; esos eventos deben gestionarse por
el protocolo institucional o agregarse antes de declararlos soportados.

No se ejecutaron pruebas con PII real, carga/caos, restauración de backup,
proveedores de entrega, staging equivalente ni producción. Un cambio de paquete
no reescribe casos existentes, pero la comparación masiva entre versiones y su
decisión humana aún no tienen una consola dedicada.

Antes de activar el módulo como canal formal se deben completar los diez puntos
de `docs/PROTOCOLO_PQRSD_GESTION_PUBLICA.md`, especialmente ensayo de respaldo
y contingencia, firma/autorización institucional, entrega con proveedor real,
aislamiento en dos tenants de staging y aprobación escrita de la entidad.
