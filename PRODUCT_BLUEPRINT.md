# Política Sostenible — blueprint de producto

## Propósito

Un sistema operativo para campañas y equipos de ejercicio del cargo en Colombia. No es un CRM de propaganda: coordina trabajo, territorio, control electoral, cumplimiento y atención ciudadana con evidencia auditable.

No existe un ranking público y auditado que permita llamar a una plataforma política colombiana “la más exitosa”. La comparación se hizo sobre capacidades observables, flujos oficiales y controles verificables, no sobre cifras comerciales sin respaldo.

La aplicación mantiene dos finalidades separadas:

- **CAMPAIGN:** relacionamiento consentido, voluntariado, finanzas electorales, testigos y Día D.
- **PUBLIC_OFFICE:** PQRS/casos, compromisos, agenda de equipo y rendición de cuentas.

No existe migración automática de personas, consentimientos o comunicaciones entre ambos modos.

## Patrones colombianos incorporados

- Libro y control periódico inspirado en el flujo oficial de [Cuentas Claras del CNE](https://www.cne.gov.co/cuentas-claras), sin presentarse como sustituto del reporte oficial.
- Topes configurables y trazabilidad preparados para adaptar el producto a los lineamientos vigentes, incluida la [Resolución 10753 de 2025 del CNE](https://www.cne.gov.co/resoluciones-cne-2025/res-10753), sin codificar valores legales que cambian por elección.
- Estructura territorial basada en la [DIVIPOLA oficial del DANE](https://geoportal.dane.gov.co/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2025/FeatureServer).
- Coordinación de puestos, testigos y actas coherente con la [DIVIPOLE de la Registraduría](https://observatorio.registraduria.gov.co/views/electoral/divipole.php).
- Gestión de incidentes y evidencia tomando como referencia el enfoque ciudadano de [Pilas con el Voto de la MOE](https://www.pilasconelvoto.com/).
- Seguimiento público de compromisos inspirado en los principios de [Congreso Visible](https://congresovisible.uniandes.edu.co/) y participación de [Urna de Cristal](https://www.urnadecristal.gov.co/).
- Operación jerárquica, móvil y de Día D contrastada con productos colombianos como [Vote360](https://vote360.co/), sin copiar afirmaciones comerciales ni métricas no verificadas.
- Privacidad electoral alineada con la [Circular Externa 002 de 2026 de la SIC](https://sedeelectronica.sic.gov.co/comunicado/la-sic-expidio-instrucciones-sobre-proteccion-de-datos-personales-en-el-contexto-electoral): autorización expresa para datos sensibles, transparencia de segmentación e IA y mecanismos sencillos para ejercer derechos.

Como referencias adicionales de mercado se revisaron las propuestas públicas de [Pharos Strategies](https://pharosstrategies.com/) y [Campane](https://www.campane.com.co/). Sirvieron para contrastar lenguaje y cobertura funcional; no se asumieron como prueba de resultados electorales ni se copiaron métricas comerciales.

## Capacidades prioritarias

| Problema                            | Respuesta del producto                                               | Control no negociable                                            |
| ----------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Datos dispersos entre equipos       | Centro de mando con datos de API y prioridades                       | Ninguna métrica ficticia                                         |
| Fuga entre campañas/entidades       | Tenant obligatorio en cada tabla operativa                           | Tenant sólo desde JWT                                            |
| Bases políticas sin autorización    | Registro y evidencia atómica de consentimiento                       | Datos sensibles opt-in y revocables                              |
| Perfilamiento o incentivos abusivos | Sin intención de voto, psicografía ni puntos por capturar ciudadanos | Minimización, finalidad y explicabilidad                         |
| Desorden semanal de ingresos/gastos | Libro cronológico, soportes privados, topes y revisión independiente | Decimal exacto, soporte obligatorio, transacción serializable y cuatro ojos |
| Tareas que nadie cierra             | Responsables, prioridad, vencimiento y estado                        | RBAC y alcance tenant+modo                                       |
| Agendas dispersas                   | Eventos paginados, responsables, horarios y transiciones             | Sólo usuarios activos y auditoría sin contenido sensible         |
| Altas y bajas informales            | Invitaciones de un solo uso, cambio de rol y desactivación inmediata | Rol vigente consultado en PostgreSQL                             |
| Mensajes sin revisión               | Cola de aprobación con separación solicitante/aprobador              | No envía ni publica; cuatro ojos y mínimo contenido en auditoría |
| Promesas sin seguimiento            | Compromisos, progreso, evidencia y publicación                       | Campaña/cargo separados                                          |
| PQRS sin trazabilidad               | Casos, SLA, asignación, estado y confidencialidad                    | Acceso restringido a atención/auditoría                          |
| Crisis manejadas por chats          | Incidentes, severidad humana, propietario y vencimiento              | Sin “sentimiento” ni riesgo inventados por IA                    |
| Pérdida de control el Día D         | Puestos, mesas, testigos, actas e incidentes                         | E-14 privado y ruta firmada                                      |
| Archivos pesados en la API          | Subida directa y lectura temporal por recurso                        | Autorización durable, consumo único, cuotas y prefijo tenant/módulo |
| “IA” que inventa resultados         | Capacidades desactivadas hasta tener proveedor y evaluación          | Nunca inferir intención política individual                      |

## Siguiente frontera

1. MFA, recuperación de cuenta verificada y confirmación de correo antes de abrir el registro productivo.
2. Portal público de compromisos y datos agregados sin información personal.
3. Cliente de campo offline cifrado, con cola idempotente y resolución explícita de conflictos. El prototipo `apps/pwa-field` está excluido deliberadamente del workspace y no debe desplegarse hasta cumplir estos controles.
4. Integraciones oficiales versionadas y probadas; cualquier exportación debe declarar con precisión si es borrador interno u obligación radicada.
5. Automatización de retención, exportación por titular y supresión verificable, previa definición jurídica por organización.

El cliente heredado `packages/ai-agent` también está excluido del workspace:
declara predicciones y rankings que la API real no implementa. Sólo podrá
reactivarse con proveedor aprobado, evaluaciones documentadas y revisión humana.

## Criterio de éxito

El producto se evalúa por tiempos de respuesta, cobertura de consentimientos, cierres a tiempo, conciliación financiera, cobertura de mesas y compromisos verificables. No por “votos predichos”, perfiles opacos ni volumen indiscriminado de mensajes.
