# Preparación para ofrecer acceso a múltiples organizaciones

Fecha: 5 de octubre de 2026. Cada cliente político y su equipo constituye una
organización independiente. Un administrador de campaña administra su propia
organización; no adquiere por ello acceso de administrador de la plataforma.

Este corte mejora consultas y compatibilidad. No establece una capacidad de
usuarios simultáneos ni autoriza anunciar un servicio ilimitado. La publicación
y las pruebas de interfaz se registran por separado del resultado local.

## Controles existentes comprobados en esta revisión

- Nest deriva la organización del JWT validado, vuelve a comprobar la cuenta,
  su actividad, su versión de sesión y su rol vigente. Next consume HTTP y no
  consulta PostgreSQL directamente.
- Los 115 modelos operativos inspeccionados tienen `tenantId` obligatorio. Los
  tres modelos globales son organización, plan e identidad de base de datos.
  Este conteo no sustituye la revisión del filtro de cada consulta.
- Archivos privados con rutas por organización y autorizaciones temporales;
  exportaciones en lotes de 250 con cancelación y control de flujo.
- Límites Redis separados por cuenta y organización; las cuotas de plan no
  equivalen a rendimiento medido ni a disponibilidad garantizada.
- Administración de plataforma protegida por identidad permitida y MFA;
  ningún permiso de campaña debe saltar esa barrera.

## Cambios del candidato

El selector de responsables de Tareas y Compromisos consulta páginas de 20,
con un máximo de 50 por solicitud y búsqueda en servidor. Se preservan los
filtros de organización, actividad, rol y territorio, además de la selección
actual aunque quede fuera de la página visible. La asignación se vuelve a
validar en Nest al guardar.

La compatibilidad de clientes anteriores se mantiene mediante un endpoint
separado para la búsqueda paginada. El endpoint anterior conserva su array
para equipos de hasta 100 responsables elegibles; si el equipo supera ese
límite, responde con una indicación de actualizar la pestaña. Nunca presenta
una lista truncada como si fuera el equipo completo.

Las consultas de administración global de organizaciones y de usuarios de una
organización también deben estar acotadas, con búsqueda y orden estable. Su
contrato y pruebas se documentan junto con la implementación; no crean un
checkout, cobran dinero ni activan suscripciones.

Se retiró del panel de planes el enlace a una dirección comercial cuyo dominio
no resolvía. No se sustituyó por un contacto inventado. Los planes y consumos
reales permanecen; el canal comercial se debe configurar con un contacto
verificado antes de ofrecer contratación desde la aplicación.

## Trabajo requerido para comprometer capacidad comercial

| Tema | Estado comprobado y siguiente resultado exigible | Responsable |
| --- | --- | --- |
| Capacidad concurrente | Pendiente de medir. Ensayo aislado con organizaciones pequeñas y grandes, lecturas, escrituras, búsqueda, exportaciones y colas simultáneas. Medir p50/p95/p99, errores, memoria, CPU y conexiones; guardar dataset, revisión y recursos del ensayo. | Ingeniería y operación |
| Presupuesto PostgreSQL | Cada proceso tiene su propio pool. Sumar réplicas API × pool, workers × pool, migrador y reserva operativa antes de ampliar réplicas. Contrastarlo con el límite real del proveedor y los otros programas. | Operación |
| Separación de procesos | Existe `compose.production.yml` con web, API, worker y migrador separados. El runtime observado sigue agrupado; no se ha validado una migración a esa topología. | Ingeniería y operación |
| Reparto de colas | La cola es compartida; no se ha demostrado reparto justo por organización. Medir antigüedad/espera por cliente, limitar admisión y comprobar que un lote grande no impida trabajar a otro equipo. | Ingeniería |
| Segunda barrera de aislamiento | Las consultas revisadas aplican filtros; no existe una política RLS general comprobada. Mantener pruebas negativas por organización y diseñar cualquier barrera adicional con sus excepciones de catálogo y administración. | Ingeniería y seguridad |
| Configuración comercial de producción | El entorno observado conserva perfil de evaluación con excepción explícita de TLS para PostgreSQL. Preparar y probar conexión verificada antes de tratarlo como configuración final para datos de clientes. No desactivar el guard para publicar. | Operación |
| Alta, renovación y suspensión | Registro público cerrado; invitaciones habilitadas. Los planes/cuotas existen, pero no hay un flujo de cobro/activación automática demostrado. Definir alta asistida o autoservicio, proveedor de cobro y estados de acceso antes de implementar efectos financieros. | Producto y dirección |
| Recuperación y continuidad | Respaldo del 5 de octubre restaurado en local y verificado. El corte de ese día requirió recuperación por un comando compuesto erróneo; el runbook exige una orden única. Medir RPO/RTO y probar recuperación de Storage además de PostgreSQL. | Operación |
| Dispositivos | Las medidas emuladas y capturas no equivalen a pruebas en hardware. La calibración táctil nativa quedó pendiente por un bloqueo de la herramienta. Mantener ese caso abierto hasta contar con una prueba válida. | Calidad |

El número de clientes admitidos y cualquier compromiso de disponibilidad se
fijan después de medir estos puntos en un entorno aislado. No se ejecutan
pruebas de saturación en el servidor compartido con los otros programas.
