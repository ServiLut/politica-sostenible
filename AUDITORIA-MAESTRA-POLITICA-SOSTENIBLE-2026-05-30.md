# Auditoría Maestra de Politica Sostenible

Fecha de corte: 30 de mayo de 2026

## Estado actualizado después de remediación aplicada el 30 de mayo de 2026

Después de emitir esta auditoría se aplicaron correcciones de seguridad, autenticación y consistencia técnica. Por eso, algunos hallazgos críticos de la versión auditada original ya no representan el estado actual del código.

Quedó corregido:

- `witness`, `gis`, `logistics/sync` y `ai/chat` ya no confían en `tenantId`, `userId`, `x-tenant-id` ni `x-user-id` enviados por cliente; ahora resuelven identidad desde JWT.
- `logistics/voting-places` quedó protegido con guardas y roles; además `war-room` y `settings` ya consumen estos endpoints con `Authorization`.
- El flujo visible de recuperación/restablecimiento de contraseña dejó de depender de Supabase Auth y ahora apunta al backend centralizado.
- La configuración JWT del backend se unificó; se eliminó la divergencia entre módulos que firmaban/verificaban con secretos distintos.
- `PrismaService` dejó de forzar `ssl: false` y ahora permite configuración por entorno.
- El webhook de WhatsApp ya no usa `demo-tenant-id` ni un token de verificación hardcodeado.

Sigue pendiente:

- El `schema.prisma` todavía tiene tablas operativas sin `tenant_id`, especialmente `PointLog`, `InventoryMovement`, `VotingPlace` y `TableResult`.
- La mensajería masiva sigue siendo principalmente simulada desde frontend y todavía no es una operación real de campaña.
- Parte importante del dominio operativo sigue viviendo en `tenant.config` JSON y no en modelos de base de datos maduros.
- El modo `offline-first` todavía no está llevado al nivel de producto nacional de campo que este proyecto necesita.

Validación posterior a remediación:

- `pnpm --filter api test:e2e` pasando: `15/15`.
- `pnpm --filter api build` pasando.
- `pnpm --filter web lint` pasando sin warnings.
- `pnpm --filter web build` pasando.

## 1. Resumen ejecutivo

`politica-sostenible` ya tiene una base seria para convertirse en una plataforma política potente:

- Separación `web -> api -> PostgreSQL/Supabase Storage` ya encaminada.
- Módulos reales en autenticación, votantes, finanzas, archivos firmados, operaciones y puestos de votación.
- Pruebas `e2e` del API existentes y pasando.
- Una visión de producto ambiciosa: CRM político, finanzas CNE, control territorial, War Room, compliance y PWA de campo.

Pero hoy no está listo para ser “el programa maestro” del mercado político colombiano. El principal problema no es de diseño visual sino de confiabilidad de producto, seguridad multitenant y coherencia entre lo que la interfaz promete y lo que el backend realmente soporta.

Mi conclusión es esta:

- Como concepto, el producto es fuerte.
- Como demo operativa, ya impresiona.
- Como sistema de producción nacional para campañas, todavía está en fase `beta/prototipo`.

Si se corrigen primero los riesgos críticos y luego se prioriza una operación de campo `offline-first`, mensajería real, compliance colombiano profundo y una base de datos unificada de organización política, sí tiene potencial de convertirse en el software político colombiano más fuerte del mercado.

## 2. Hallazgos críticos

### Crítico 1. Hay endpoints de Día D y de testigos que rompen el aislamiento multitenant y confían en datos enviados por el cliente

Esto viola directamente la regla arquitectónica central del proyecto: el `tenant_id` debe salir del JWT y no de headers, query params ni body.

Evidencia:

- `apps/api/src/witness/witness.controller.ts:17-32`
- `apps/api/src/logistics/logistics.service.ts:11-21`
- `apps/api/src/logistics/logistics.service.ts:63-73`
- `apps/api/src/gis/gis.controller.ts:12-19`

Problema concreto:

- `WitnessController` exige `x-tenant-id` y `x-user-id` enviados por el cliente.
- `LogisticsService.syncE14()` y `syncVoter()` aceptan `tenantId`, `witnessId` y `registrarId` en el body.
- `GisController` recibe `tenantId` por query string.

Impacto:

- Riesgo de fuga o contaminación de datos entre campañas.
- Riesgo de suplantación de operador/testigo.
- Riesgo legal alto si el sistema se usa en una elección real.

### Crítico 2. El módulo War Room tiene endpoints abiertos sin guardas y el frontend consume esos endpoints sin autenticación

Evidencia:

- `apps/api/src/logistics/voting/logistics-voting.controller.ts:17-112`
- `apps/web/app/dashboard/war-room/page.tsx:96-168`

Problema concreto:

- El backend de `logistics/voting-places` no tiene `UseGuards(RolesGuard)` ni resolución de identidad.
- El frontend consulta y escribe resultados E-14 sin header `Authorization`.

Impacto:

- Si el API queda expuesto, cualquier actor podría leer puestos, registrar mesas o marcar puestos como completos.
- Este hallazgo por sí solo impide recomendar el módulo War Room para uso electoral real.

### Crítico 3. El modelo multitenant del schema no es consistente con la regla del repositorio

El monorepo exige que toda tabla operativa tenga `tenant_id`, pero hoy varias tablas no lo tienen.

Evidencia:

- `apps/api/prisma/schema.prisma:196-208` (`PointLog`)
- `apps/api/prisma/schema.prisma:226-237` (`InventoryMovement`)
- `apps/api/prisma/schema.prisma:240-271` (`VotingPlace`, `TableResult`)

Impacto:

- Inconsistencia de diseño.
- Dificultad futura para soportar campañas múltiples, partidos, federaciones o SaaS B2B real.
- Riesgo de mezclar datos de operación nacional con datos privados por campaña.

### Crítico 4. La mensajería masiva todavía es una simulación, no una capacidad real

Evidencia:

- `apps/web/app/dashboard/messaging/page.tsx:73-88`
- `apps/web/context/CRMContext.tsx:760-766`
- `apps/api/src/whatsapp/whatsapp.service.ts:24-39`

Problema concreto:

- La UI muestra campañas de WhatsApp, pero no llama un endpoint real de broadcast.
- El estado “enviado” se simula con `setTimeout`.
- El webhook guarda mensajes entrantes con `tenantId = "demo-tenant-id"`.

Impacto:

- La funcionalidad parece productiva pero no lo es.
- Riesgo de vender una capacidad que todavía no existe.

### Crítico 5. La IA actual es mockeada y el frontend le manda un tenant hardcodeado

Evidencia:

- `apps/web/components/AiAssistant.tsx:21-39`
- `apps/api/src/ai/ai.controller.ts:41-45`
- `apps/api/src/ai/ai.service.ts:17-50`
- `apps/api/src/ai/ai.service.ts:56-95`
- `apps/api/src/ai/ai.service.ts:115-151`

Problema concreto:

- El frontend usa un `TENANT_ID` fijo.
- El backend responde con datos simulados para OCR, E-14 y chat.
- No existe RAG real ni conexión a datos vivos de la campaña.

Impacto:

- La IA sirve como demo, no como herramienta de decisión.
- En producción podría inducir a error estratégico.

### Crítico 6. El PWA offline es una buena dirección, pero hoy no es seguro ni suficiente para operación real

Evidencia:

- `apps/pwa-field/lib/sync-manager.ts:11-56`
- `apps/pwa-field/app/page.tsx:1-76`
- `apps/pwa-field/lib/db.ts:1-34`
- `apps/api/src/logistics/logistics.service.ts:11-96`

Problema concreto:

- El PWA solo tiene una pantalla principal.
- La sincronización no envía `Authorization`.
- La identidad y el tenant se esperan en el payload.
- No se observa cifrado local, control de sesión, resolución robusta de conflictos ni cola de archivos.

Impacto:

- No está listo para testigos, brigadas, líderes zonales o equipos de calle en entornos de baja conectividad.

### Alto 7. La gestión de equipo, tareas, eventos, compliance, territorio y broadcasts vive en `tenant.config` JSON y no en tablas propias

Evidencia:

- `apps/api/src/operations/operations.service.ts:23-91`
- `apps/web/context/CRMContext.tsx:782-823`
- `apps/web/context/CRMContext.tsx:796-816`
- `apps/web/context/CRMContext.tsx:962-980`

Problema concreto:

- Muchos módulos del dashboard guardan su estado en `Tenant.config.operations`.
- “Invitar miembro” no crea un usuario real autenticable; solo agrega un objeto al JSON.

Impacto:

- Poco escalable.
- Difícil de auditar.
- Difícil de consultar analíticamente.
- Frena integraciones futuras y operación multiusuario seria.

### Alto 8. Hay desalineación entre los roles del frontend y los roles reales del backend

Evidencia:

- `apps/web/types/saas-schema.ts:1-11`
- `apps/web/context/auth.tsx:27-41`
- `apps/web/config/navigation.ts:12-83`
- `apps/api/prisma/schema.prisma:280-286`

Problema concreto:

- El frontend define `SuperAdmin`, `GerenteFinanzas`, `Lider`, `Auditor`.
- El backend solo tiene `ADMIN`, `CAMPAIGN_MANAGER`, `ZONE_COORDINATOR`, `WITNESS`, `VOLUNTEER`.

Impacto:

- La UI promete capacidades por rol que el backend no puede emitir ni gobernar.
- Riesgo de huecos de autorización y confusión operativa.

### Alto 9. El flujo de recuperación de contraseña está roto

Evidencia:

- `apps/web/app/(auth)/olvide-mi-contraseña/page.tsx:20-31`
- `apps/api/src/auth/auth.controller.ts:10-23`

Problema concreto:

- El frontend llama `POST /auth/forgot-password`.
- Ese endpoint no existe en el controlador actual.
- Además, la pantalla enlaza a `/login` cuando la ruta real es `/iniciar-sesion`.

Impacto:

- Funcionalidad visible para el usuario que falla.
- Mala señal de confiabilidad en onboarding y soporte.

### Medio 10. La seguridad base tiene dos decisiones que no deberían llegar así a producción

Evidencia:

- `apps/api/src/common/common.module.ts:10-13`
- `apps/api/src/prisma/prisma.service.ts:22-25`

Problema concreto:

- JWT con fallback a `super-secret`.
- Pool PostgreSQL con `ssl: false`.

Impacto:

- Riesgo alto si el despliegue se hace con variables mal configuradas.
- Señal de endurecimiento incompleto.

### Medio 11. La lógica de topes financieros está duplicada e inconsistente

Evidencia:

- `apps/api/src/finance/guards/cne-limit.guard.ts:35-85`
- `apps/api/src/finance/finance.service.ts:38-56`

Problema concreto:

- El guard usa `CampaignSettings.maxTotalBudget` y `maxPublicityLimit`.
- El service vuelve a imponer un tope fijo de `500000000`.

Impacto:

- Posibles rechazos o aceptaciones contradictorias.
- Difícil trazabilidad de reglas CNE.

### Medio 12. Hay código y rutas de demo o respaldo que deben limpiarse

Casos claros:

- `auth.bak/`
- `apps/web/proxy.bak.ts`
- `apps/web/middleware.bak.ts`
- `/crm-demo`
- `/test`
- `packages/ai-agent` sin integración visible con las apps de negocio

Esto no es solo “desorden”. También aumenta el costo cognitivo, la probabilidad de confusión y el riesgo de desplegar cosas que no deberían existir en producción.

## 3. Lo que el sistema tiene hoy

## 3.1 Monorepo

El repositorio está organizado como monorepo `Turbo + pnpm`.

Apps principales:

- `apps/web`: plataforma web principal en Next.js.
- `apps/api`: backend NestJS.
- `apps/pwa-field`: PWA enfocada en operación de campo/offline.

Paquetes:

- `packages/ui`: componentes UI compartidos.
- `packages/typescript-config`: configuración compartida.
- `packages/ai-agent`: paquete aparte con Prisma propio, hoy sin conexión clara con el producto principal.

## 3.2 Arquitectura actual

Flujo principal:

1. El usuario entra a `apps/web`.
2. `apps/web/next.config.ts` reescribe `/api/*` hacia NestJS.
3. NestJS procesa auth, negocio y persistencia.
4. Prisma conecta con PostgreSQL.
5. Los archivos se suben con URLs firmadas a Supabase Storage.

Esto está bien conceptualmente y respeta la dirección correcta del proyecto.

## 3.3 Persistencia real

Hoy conviven dos modelos:

- Modelo correcto:
  - usuarios
  - tenants
  - votantes
  - finanzas
  - testigos
  - archivos
  - ajustes de campaña

- Modelo provisional:
  - eventos
  - tareas
  - equipo
  - broadcasts
  - compliance
  - territorio del dashboard
  - onboarding
  - algunos E-14 de operación

Estos últimos viven en `Tenant.config.operations` como JSON y no como entidades de dominio maduras.

## 4. Lo que el usuario puede ver hoy

## 4.1 Rutas públicas del web

- `/`
- `/iniciar-sesion`
- `/registro`
- `/olvide-mi-contraseña`
- `/reiniciar-contraseña`
- `/crm-demo`
- `/test`

## 4.2 Rutas de dashboard

- `/dashboard/executive`
- `/dashboard/org`
- `/dashboard/territory`
- `/dashboard/directory`
- `/dashboard/pipeline`
- `/dashboard/agent`
- `/dashboard/events`
- `/dashboard/messaging`
- `/dashboard/tasks`
- `/dashboard/finance`
- `/dashboard/war-room`
- `/dashboard/security`
- `/dashboard/compliance`
- `/dashboard/settings`

## 4.3 Qué puede hacer hoy un usuario dentro de la plataforma

### Dashboard ejecutivo

Puede:

- Ver KPIs generales.
- Ver alertas operativas.
- Ver actividad reciente.
- Cambiar onboarding por perfil.
- Generar un PDF ejecutivo.

No puede:

- Confiar en que todos los indicadores provengan de modelos productivos; varios salen de estado JSON o lógica calculada en frontend.

### Organización

Puede:

- Agregar, editar y suspender miembros visualmente.

No puede:

- Crear usuarios reales del sistema con credenciales, permisos backend, invitación, activación o recuperación de acceso.

### Directorio CRM

Puede:

- Crear y editar contactos/votantes.
- Cambiar etapa del pipeline.
- Ver búsquedas y filtros.

No puede:

- Operar todavía como CRM político de 360 grados con historial omnicanal, households, referidos, parentesco, promesas, causas, incidencias y segmentación avanzada persistida de forma homogénea.

### Pipeline

Puede:

- Visualizar etapas de avance del contacto.

No puede:

- Orquestar automatizaciones reales de nurturing, mensajería, scoring o playbooks.

### Territorio

Puede:

- Ver metas y cobertura.
- Explorar mapas y distribución.

No puede:

- Confiar en un GIS completamente gobernado por tenant y fuente oficial.

### Eventos

Puede:

- Crear, editar y borrar eventos a nivel de interfaz.

No puede:

- Gestionarlos todavía como agenda robusta con asistencia real, QR, check-in, costos ligados a finanzas, brigadas y logística de operación.

### Tareas

Puede:

- Crear tareas y marcarlas como completadas.

No puede:

- Usarlas como sistema serio de ejecución con SLA, dependencia, evidencia, notificación y accountability multirol.

### Finanzas

Puede:

- Crear y consultar movimientos.
- Ver resumen.
- Exportar CSV CNE.
- Adjuntar evidencia.

No puede:

- Considerarse todavía un módulo de tesorería electoral completo, porque faltan reglas más profundas, conciliación, flujo de aprobación, soportes normalizados, cuentas por tercero y consistencia completa de topes.

### Compliance

Puede:

- Crear obligaciones.
- Subir evidencia.
- Marcar cumplimiento.

No puede:

- Operar todavía como sistema legal robusto con motor normativo, vencimientos por tipo de elección, alertas regulatorias, responsables y expedientes trazables.

### Mensajería

Puede:

- Crear campañas visuales.
- Ver estados simulados.

No puede:

- Enviar campañas reales.
- Segmentar con base en eventos reales del CRM.
- Medir entregabilidad, apertura, clics, respuestas, bajas o consentimientos.

### War Room / Día D

Puede:

- Consultar puestos.
- Registrar mesas.
- Marcar puestos como completos.
- Ver tendencias.

No puede:

- Considerarse un centro de mando electoral seguro y confiable mientras los endpoints sigan abiertos y parte del flujo rompa multitenancy.

### Estratega IA

Puede:

- Conversar con una demo de IA.

No puede:

- Entregar inteligencia confiable basada en datos reales del tenant.

### Seguridad

Puede:

- Ver logs de auditoría.

No puede:

- Abarcar seguridad operacional real con dispositivos, sesiones activas, eventos sospechosos, revocación de tokens, geofencing o hardening de riesgo electoral.

### Settings

Puede:

- Ajustar metas y parámetros visuales de territorio.

No puede:

- Gobernar el sistema completo como consola administrativa de campaña real.

## 5. Qué se conecta con qué y por qué

### Web -> API

`apps/web` usa un rewrite en Next.js para que el frontend consuma NestJS por `/api/*`. Esto simplifica despliegue, CORS y llamadas desde el cliente.

### API -> PostgreSQL

NestJS usa Prisma con PostgreSQL para persistir entidades críticas: auth, votantes, finanzas, testigos y parte de la operación.

### API -> Supabase Storage

El flujo de archivos está bien encaminado:

1. El frontend pide URL firmada.
2. Nest valida identidad.
3. El archivo sube directo a Supabase.
4. El backend confirma y guarda metadata.

Este es uno de los mejores puntos arquitectónicos del repositorio.

### Web -> Estado operativo JSON

Varios módulos del dashboard no persisten en tablas; guardan arreglos JSON dentro del `config` del tenant. Esto permite avanzar rápido, pero no debe quedarse así si el producto va a escalar.

### PWA -> API

La PWA pretende sincronizar cuando vuelve la conexión. La idea es correcta. La implementación aún no.

## 6. Estado técnico verificado

Validaciones ejecutadas el 30 de mayo de 2026:

- `pnpm --filter api test:e2e`: 4 suites, 13 pruebas, todas pasando.
- `pnpm --filter web lint`: 9 warnings, 0 errores.
- Build histórico del monorepo: compila, pero con señales de madurez pendientes en `pwa-field` y advertencias visuales en `web`.

Lectura correcta de esto:

- El proyecto no está roto.
- Pero las pruebas actuales no cubren los riesgos más sensibles del producto.

## 7. Fortalezas reales del producto

- La idea de producto sí está bien pensada para política moderna.
- La separación `frontend / backend / storage` ya existe.
- El módulo financiero ya entiende lenguaje electoral colombiano.
- Hay intuición correcta sobre testigos, E-14, compliance y territorialidad.
- Se nota intención de UX premium, no de panel genérico.
- La PWA de campo existe, aunque todavía sea prototipo.

## 8. Debilidades estructurales

- Mezcla de producto real con demo.
- Gobernanza de roles inconsistente.
- Persistencia fragmentada entre tablas y JSON.
- Offline todavía incompleto.
- IA todavía no confiable.
- Mensajería todavía no conectada.
- War Room inseguro.
- Cobertura funcional mayor que la profundidad real.

## 9. Qué conviene borrar, congelar o reemplazar

### Borrar o mover fuera de producción

- `auth.bak/`
- `apps/web/proxy.bak.ts`
- `apps/web/middleware.bak.ts`
- `/crm-demo`
- `/test`

### Congelar hasta tener backend real

- Mensajería masiva.
- Estratega IA “productivo”.
- Flujos de recuperación de contraseña visibles al usuario.

### Reemplazar

- Persistencia JSON de operaciones por modelos normalizados.
- Identidad por headers/body/query en testigos, GIS y sync offline por identidad derivada del JWT.
- Hardcoded tenant IDs por contexto real.
- Simulaciones `setTimeout` por colas, webhooks o providers reales.

### Revisar si vale la pena mantener

- `packages/ai-agent` como paquete separado, si no se integrará en el roadmap próximo.

## 10. Qué necesita tener para ser el mejor software político colombiano

No debe parecer un CRM genérico adaptado. Debe sentirse como un sistema nativo de operación política colombiana.

### Pilar 1. CRM político 360

Debe incluir:

- persona
- hogar
- líder de red
- comité
- testigo
- donante
- contratista
- proveedor
- periodista
- aliado
- incidencia
- causa/interés
- intención de voto
- nivel de movilización
- relación con otros actores
- histórico omnicanal

### Pilar 2. Operación territorial real

Debe incluir:

- jerarquía nacional -> departamento -> municipio -> zona -> puesto -> mesa
- metas por célula territorial
- cobertura real por líder
- rutas de brigada
- barridos casa a casa
- promesas de voto por red
- mapa de vacíos operativos

### Pilar 3. Día D y escrutinio paralelo serios

Debe incluir:

- acreditación y administración de testigos
- formularios offline
- captura de E-14 con cadena de custodia
- cola de evidencias y sincronización diferida
- centro de incidentes
- reclamaciones escritas
- tablero puesto/mesa
- contraste E-14 vs E-24/E-26
- trazabilidad por operador y hora

### Pilar 4. Tesorería y compliance colombiano profundos

Debe incluir:

- motor de reglas CNE por tipo de elección
- topes configurables por campaña
- soportes obligatorios por rubro
- terceros y proveedores con validación
- flujo de aprobación
- exportadores y formatos de auditoría
- trazabilidad de cambios
- seguimiento de vencimientos regulatorios
- expediente digital

### Pilar 5. Mensajería y activación

Debe incluir:

- WhatsApp oficial
- email
- SMS
- segmentación por territorio, apoyo, rol, causa, evento y urgencia
- inbox de respuestas
- opt-in y opt-out
- plantillas
- campañas automáticas
- métricas de entrega y respuesta

### Pilar 6. IA útil, no decorativa

Debe incluir:

- IA grounded en datos del tenant
- explicabilidad
- citas a registros reales
- detección de anomalías
- priorización de riesgo
- lectura asistida de E-14
- borradores de mensajes segmentados
- resúmenes por territorio
- copiloto de tesorería y compliance

### Pilar 7. Seguridad y gobernanza

Debe incluir:

- RBAC real
- permisos granulares
- sesiones activas
- revocación
- dispositivos confiables
- bitácora inviolable
- control por tenant
- cifrado local en offline
- auditoría legal y operativa

## 11. Por qué otras herramientas tienen éxito y qué aprender

### NGP VAN

Según su sitio oficial, su fuerza no es una función aislada sino la integración entre recaudación, compliance, organizing y advocacy en una sola plataforma. Esa integración reduce fricción operativa y evita que la campaña trabaje con silos.

Lección para este producto:

- no ganarás por tener “muchos módulos”
- ganarás cuando todos compartan un solo modelo de datos político y una sola operación

### NationBuilder

NationBuilder se posiciona alrededor de una base de personas, outreach, website y fundraising conectados. Su valor está en convertir comunidad en acción sin cambiar de sistema.

Lección:

- el centro no debe ser el panel, debe ser la persona y su red
- web, voluntariado, eventos, mensajes y donaciones deben alimentar el mismo expediente político

### Ecanvasser

Ecanvasser destaca por operación de campo: rutas, canvassing, tracking, dashboards, leaderboard, integraciones y, de forma muy importante, `offline canvassing`.

Lección:

- un software político gana en la calle, no solo en la oficina
- si el producto de campo es mediocre, el resto del sistema pierde valor

## 12. Por qué offline es crítico para política colombiana

No es un “extra”. Es una capacidad estratégica.

Razones de contexto:

- MinTIC y DANE reportan que en 2024 el uso diario de Internet fue de `77,1%` a nivel nacional, pero solo `57,9%` en zonas rurales.
- El propio MinTIC sigue invirtiendo en conectividad rural y comunitaria, señal de que la brecha sigue vigente.
- En Colombia, una campaña trabaja en barrios densos, edificios, zonas rurales, corregimientos, coliseos, tarimas, caravanas y puestos de votación donde la señal puede degradarse incluso dentro de ciudades.

Razones operativas:

- un testigo no puede perder una foto E-14 por falta de red
- un líder no puede perder un simpatizante levantado en calle
- una brigada no puede detener el barrido por señal intermitente
- un coordinador necesita sincronización automática después, no dependencia total de internet en el momento

Lo que debe significar `offline` en este producto:

- autenticación previa y sesión segura
- caché local cifrada
- formularios completos offline
- fotos y archivos en cola
- sincronización automática al volver la red
- resolución de conflictos
- trazabilidad de quién capturó qué y cuándo
- indicadores de pendiente/sincronizado/conflicto
- mapas y listas mínimas disponibles sin conexión

Si este producto quiere dominar el mercado colombiano, el módulo de campo debe ser uno de sus diferenciales más fuertes.

## 13. Roadmap recomendado

## Fase 1. 0 a 30 días

- Cerrar todos los huecos de multitenancy.
- Meter guardas y JWT en `witness`, `logistics/voting-places`, `gis`, `offline sync`.
- Eliminar dependencia de `tenantId` enviado por cliente.
- Despublicar o esconder funciones falsas: WhatsApp broadcast, forgot password, IA productiva.
- Retirar `/crm-demo` y `/test` del producto comercial.
- Quitar fallback de JWT secret y endurecer conexión DB.

## Fase 2. 30 a 60 días

- Normalizar tablas de `events`, `tasks`, `team`, `compliance`, `broadcasts`, `territory plans`, `audit trails`.
- Crear RBAC real alineado entre frontend y backend.
- Hacer invitación/activación real de usuarios.
- Hacer War Room seguro.

## Fase 3. 60 a 90 días

- Construir PWA offline real.
- Integrar mensajería oficial.
- Crear expediente unificado de persona/hogar/red.
- Meter dashboards por líder, zona, puesto, mesa y riesgo.

## Fase 4. 90 a 180 días

- IA grounded.
- integraciones regulatorias y de reporting
- escrutinio paralelo serio
- planeación electoral por tipo de campaña
- motor de playbooks y automatizaciones

## 14. Veredicto final

Este producto ya tiene algo valioso: no intenta ser un ERP genérico maquillado. Tiene una intuición correcta de lo que una campaña política moderna realmente necesita: territorio, movilización, finanzas, testigos, cumplimiento y mando.

Pero para convertirse en “el programa que todo político quiera usar”, la prioridad no debe ser agregar más pantallas. Debe ser:

1. hacer confiable lo que ya promete
2. hacer seguro el multitenant
3. convertir la operación de campo y de Día D en una ventaja real
4. unificar el dato político en un solo núcleo
5. conectar de verdad mensajería, compliance, finanzas, testigos y CRM

Si yo tuviera que resumir la estrategia en una frase, sería esta:

`menos demo, más operación real; menos módulos sueltos, más sistema político integrado; menos dependencia de internet, más capacidad de campaña en la calle`

## 15. Fuentes externas usadas

- NGP VAN, plataforma y organizing:
  - https://www.ngpvan.com/
  - https://www.ngpvan.com/solutions/political-organizing/
- NationBuilder:
  - https://nationbuilder.com/
  - https://nationbuilder.com/about
  - https://nationbuilder.com/feature_guide
- Ecanvasser:
  - https://www.ecanvasser.com/feature/offline-canvassing
  - https://www.ecanvasser.com/solution/political-campaigns
  - https://www.ecanvasser.com/product
- Colombia, conectividad y uso de internet:
  - https://ontic.mintic.gov.co/857/articles-433553_recurso_1.pdf
  - https://ontic.mintic.gov.co/857/articles-425956_recurso_1.pdf
  - https://www.mintic.gov.co/portal/inicio/Sala-de-prensa/Noticias/399125:Con-resultados-como-una-ejecucion-del-88-y-cerca-de-tres-millones-de-nuevas-personas-conectadas-el-Ministerio-TIC-rindio-cuentas-de-2024
- Colombia, marco electoral y legal:
  - https://www.cne.gov.co/cuentas-claras
  - https://www.registraduria.gov.co/-Testigos-Electorales-articles-1036-.html
  - https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica/documentos/narrativas/formularios_electorales.pdf
  - https://sedeelectronica.sic.gov.co/transparencia/normativa/ley-1581
