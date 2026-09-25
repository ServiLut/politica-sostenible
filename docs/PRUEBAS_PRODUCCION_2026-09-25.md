# Pruebas controladas en producción — Política Sostenible

Actualización posterior: este documento conserva el diseño y los límites del runner. La versión `ecc9221` ya fue instalada y las ejecuciones posteriores se registran en [Despliegue y validación](DESPLIEGUE_Y_VALIDACION_2026-09-25.md), con sus diarios, resultados y conciliaciones. No interpretar la preparación inicial descrita a continuación como el estado actual del despliegue.

Estado de este documento: **diseño y herramientas locales preparados; ninguna
ejecución remota realizada por esta subtarea**. Los resultados locales previos no
se presentan como resultados de producción. La autorización de la usuaria se
limita a Política Sostenible; las otras aplicaciones activas quedan fuera del
alcance técnico del runner.

## Prueba mínima propuesta y evidencia exigida

El mínimo útil es una sesión auténtica, una escritura seguida por una petición
independiente que la consulte, una modificación también consultada y un rechazo
entre organizaciones. Un HTTP 200 o la presencia de un botón no demuestra ese
circuito. El runner usa el dominio público y su `/api`, por lo que además verifica
la conexión del proxy web con Nest. No conecta directamente con PostgreSQL.

| Flujo | Acción controlada | Evidencia exigida | Cierre exacto |
| --- | --- | --- | --- |
| Identidad | Login de dos administradores sintéticos preexistentes y `/auth/me` | ID de usuario, ID/slug/nombre de tenant, correo no entregable, rol, tipo y modo exactos; 401 sin JWT | Logout exclusivamente A/B y 401 posterior; desactivación posterior a cargo del operador |
| Alistamiento | Consultar organización sintética sin perfil | `stage=null`, `overall=BLOCKED`, control `PROFILE_CONFIGURED=BLOCK` | Sin modificación del perfil |
| Centro de comando | Consultar briefing de A | Identifica A, no contiene ID de B; revisión web coincide con la desplegada | Sin edición de metas o finanzas |
| Tarea | Crear una tarea identificada, asignarla al administrador sintético, consultar por ID y actualizar descripción/estado | GET posterior recupera mismo ID, tenant, título y nueva descripción; `IN_PROGRESS` persistido | PATCH `CANCELLED` y GET posterior; el registro y su auditoría se conservan |
| Evento | Crear un borrador sintético, consultar, actualizar descripción | GET posterior confirma mismo ID, tenant, nombre, descripción y `DRAFT` | DELETE de ese borrador seguido por GET 404 |
| Aislamiento | B consulta y trata de modificar los dos IDs recién creados en A | Tarea: lista vacía y PATCH 404; evento: GET 404 y PATCH 404 | Ningún DELETE desde B; las escrituras de prueba no cambian nombres o responsables |

Este conjunto comprueba dos módulos con persistencia observable a través de la
API real y controles multitenant. **No certifica las 22 secciones, todos los roles,
todas las reglas de negocio ni ausencia absoluta de defectos.** La persistencia
se demuestra mediante peticiones HTTP posteriores; no incluye reinicio de
servicios ni inspección física de filas en producción.

## Preparación y ejecución

El operador debe crear dos organizaciones y cuentas exclusivas por el backend de
Política Sostenible, sin tocar organizaciones existentes. No existe una ruta de
alta de tenant en el controlador de administración SaaS revisado; no reutilizar
el registro público, porque registra aceptación de términos. Este runner no
aprovisiona cuentas ni confecciona esa aceptación en nombre de una persona.

Las organizaciones se denominan `PRUEBA SINTÉTICA ps-audit-<UUID>-a/b`, con
slugs exactos y usuarios `<slug>@example.invalid`. Deben ser `CANDIDACY`, modo
`CAMPAIGN`, sin perfil operativo ni integraciones. La ausencia de perfil es una
precondición deliberada: permite verificar que la aplicación muestre el bloqueo
real de alistamiento sin fabricar una candidatura, consentimiento, calendario
electoral o resultado. Tareas y borradores de evento admiten ese contexto según
los controladores y guardas actuales; cualquier rechazo inesperado se documenta,
sin modificar guardas ni cambiar una etapa para forzar el resultado.

El manifiesto contiene IDs ya comprobados y la revisión exacta desplegada. Las
credenciales solo se inyectan en el entorno efímero del proceso. El script
contrasta el manifiesto con la identidad devuelta por el servidor y rechaza un
tenant humano o un perfil distinto del previsto. El campo de verificación del
operador es una declaración de preparación y no sustituye esa comprobación.

Comandos y formato completo: [README del runner](../deploy/production-audit/README.md).

```powershell
# Solo planificación: no realiza peticiones y no crea fixtures.
node deploy/production-audit/controlled-http-smoke.mjs --plan

# Guardas locales: no requieren servicios o credenciales.
node --test deploy/production-audit/controlled-http-smoke.test.mjs

# Ejecución deliberada: requiere manifiesto y dos contraseñas inyectadas
# de forma privada; este documento no realiza esa ejecución.
$env:POLITICA_PRODUCTION_SMOKE_CONFIRM = 'SYNTHETIC_TENANTS_ONLY'
node deploy/production-audit/controlled-http-smoke.mjs --execute <UUID-v4>

# Recuperación exclusivamente de los recursos de esa ejecución:
node deploy/production-audit/controlled-http-smoke.mjs --cleanup <UUID-v4>
```

La secuencia nominal usa 31 peticiones secuenciales, con un máximo de 40 por
invocación, 12 segundos por petición, sin reintentos automáticos y sin
redirecciones. No se repiten altas si existe diario. Antes de cada POST de alta
se registra su intención; una respuesta perdida se concilia por el marcador
UUID exacto, nunca mediante eliminación masiva. El origen está fijado a
`https://politica-sostenible.abogadosencolombiasas.com`: no acepta URLs de otras
aplicaciones, IPs, puertos u orígenes aportados por el entorno.

No ejecutar el navegador con las mismas cuentas mientras el runner opera:
logout revoca sus sesiones. El coordinador debe alternar ambas comprobaciones.
Si se interrumpe el proceso, revisar el diario y el bloqueo local antes de usar
`--cleanup`. Si la revisión cambió, hay conflicto de identidad, un registro
perdió su marcador o el evento dejó de estar `DRAFT`, se detiene la limpieza y
el operador revisa el objeto exacto. No se fuerza su eliminación.

## Limpieza y residuos identificables

Se conserva la tarea cancelada porque el módulo no ofrece DELETE de tareas. El
evento se elimina solo mientras es borrador. Los tenants, las cuentas y los
eventos de auditoría se conservan identificados; al final el operador desactiva
únicamente los usuarios sintéticos y verifica su estado. El runner no borra
historial, no ejecuta SQL y no cambia suscripciones ni credenciales de personas.

Los logs, auditoría, métricas globales y eventuales registros internos creados
por mecanismos de suscripción pueden reflejar las organizaciones sintéticas.
No describir el resultado como «sin escrituras» ni «limpieza total». El diario
local registra los IDs que quedaron, los HTTP obtenidos y los pasos confirmados,
sin tokens, contraseñas o cuerpos que puedan revelar datos de una respuesta
inesperada.

## Flujos adicionales: qué conviene comprobar y qué no cubrir todavía

| Área | Comprobación factible | Límite y decisión |
| --- | --- | --- |
| Navegación responsive y botones | El agente de navegador puede recorrer las rutas permitidas de una cuenta sintética y abrir/cerrar formularios; tareas/eventos coordinados con este diario | La visibilidad depende de rol, tipo, modo y etapa. Un 403/409 previsto debe mostrarse claramente, sin considerarlo automáticamente un error |
| Territorio y líderes | Solo sobre una división sintética previamente creada y aislada; líder sin teléfono, correo ni nombres reales; lectura posterior y eliminación exacta | Fuera del runner mínimo. No adjuntar un líder de ejemplo a Medellín ni a otra división de una organización real |
| Archivos privados | URL firmada, carga directa, confirmación, SHA-256 del worker y rechazo entre tenants son un circuito válido | Ya se probó en staging aislado, 8/8. Producción requiere un protocolo específico: no hay DELETE público general de objetos y pueden existir referencias/auditoría inmutables. No repuntar el harness local |
| Catálogos electorales | Consultar estado y catálogo vigente, contrastando procedencia | No importar fixtures con apariencia de fuente electoral oficial, ni activar releases sintéticos. El importador local dejó un release `STAGED` marcado sintético en su entorno propio |
| Equipo | Consultar miembros/accesos de la organización sintética | No enviar invitaciones, recuperaciones de contraseña ni correos. No cambiar cuentas humanas |
| Finanzas y facturación | Consultar estado vacío y permisos del tenant sintético | No crear aportes, gastos, pagos, suscripciones cobrables o documentos con apariencia de soportes reales |
| Personas, consentimiento y jornada | Revisar formularios, validaciones y restricciones sin guardar personas | No inventar identidad, aceptación, apoyo político, voto o consentimiento. Las pruebas con esas escrituras requieren fixtures aisladas y otro protocolo explícito |
| MFA e integraciones | Verificar estado y errores claros sin alterar configuración | La prueba mínima se detiene si requiere MFA; no simula su éxito. No prueba correo, SMS, WhatsApp, pagos ni APIs de terceros |
| Rendimiento e infraestructura | Observar salud y respuesta durante la secuencia limitada | No realizar carga, migraciones, reinicios o exploración de otras tres aplicaciones desde este runner |

## Lectura de las suites existentes

- `e2e-production/role-access.production.spec.ts` cubre navegación de once roles
  con credenciales suministradas. Bloquea POST/PUT/PATCH/DELETE después del login;
  no demuestra altas ni lectura posterior. Sus rutas mínimas deben ajustarse al
  contexto del tenant: tipo, modo y etapa, además del rol. Su vigilancia de
  respuestas >=400 puede marcar como fallo un 409 de negocio legítimo. Aunque el
  README la llama READ-ONLY, login y ciertos GET pueden producir auditoría u
  otros efectos internos. No ejecutarla ciegamente como certificado funcional.
- Esa suite abre Playwright independiente. En esta sesión el agente de navegador
  debe usar el mecanismo permitido por su skill; preparar el runner HTTP no
  autoriza un navegador alternativo. No se ejecutó esa suite desde esta subtarea.
- `apps/api/test/app-http.integration.ts` tiene 25 controles reales sobre Nest,
  PostgreSQL y Redis locales, con creación/lectura/actualización de registros e
  independencia entre tenants. Su ejecutor restringe base, esquema, rol, Redis y
  loopback. Mantener esas restricciones; no cambiar su URL hacia producción.
- `deploy/staging/test-storage-workflow.mjs` obtuvo 8/8 en el motor local aislado,
  usando API, Storage privado y worker reales. Mantener sus guardas de proyecto,
  bucket, contenedores e identidad local. El archivo de cuentas de staging no es
  una credencial válida ni autorizada para producción.

La conclusión posterior deberá separar **observado en producción**, **probado en
staging**, **cubierto por pruebas locales** y **no verificado**. Registrar revisión,
hora, UUID de ejecución, contadores, IDs sintéticos retenidos y fallos concretos.
Una prueba parcial fallida no se transforma en aprobación porque otros pasos
hayan respondido correctamente.
