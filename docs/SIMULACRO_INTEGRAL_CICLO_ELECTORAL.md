# Simulacro integral del ciclo electoral

> Este guion usa exclusivamente tenants, personas, documentos, puestos y mesas
> sintéticos. No autoriza pruebas destructivas en producción ni actuaciones ante
> una autoridad.

## 1. Objetivo y criterio de éxito

Demostrar que una operación puede recorrer antes, campaña, preparación, jornada,
poselección, cierre y gestión pública sin perder responsabilidad, evidencia,
aislamiento o continuidad ante concurrencia, error humano y pérdida de red.

El simulacro falla si requiere editar la base manualmente, compartir una cuenta,
ocultar un conflicto, usar datos productivos o llamar “oficial” a un resultado,
firma, radicación, entrega o decisión interna.

Para cada escenario se registra: hora Bogotá, actor/rol, tenant, dispositivo,
commit, digest, versión de esquema, entrada, salida, request/command ID,
evidencia, duración, resultado y defecto. Un reintento que oculta una causa no
cuenta como aprobado.

## 2. Equipo y separación de funciones

- dirección;
- coordinación territorial titular y suplente;
- gerencia financiera, contador y auditor/revisor;
- cumplimiento y protección de datos;
- testigo titular y reemplazo;
- responsable jurídico/electoral;
- responsable de gestión pública/PQRSD;
- operador de plataforma sin permisos funcionales de aprobación.

No existe una regla ficticia de cuatro ojos para cada acción. El avance o cierre
ordinario lo ejecuta un actor autorizado y debe respetar el grafo irreversible,
readiness, concurrencia y auditoría. La adopción de una operación ya iniciada y
la terminación excepcional requieren revisión independiente. Catálogo, finanzas,
firmas, escrutinio, retención y PQRSD aplican sus matrices específicas; nadie
puede saltarlas alegando que tiene un rol superior.

## 3. Escenario A — Preparación y gobierno

1. Crear un perfil en exploración con elección, ronda, fecha, presupuesto,
   responsables y zona horaria.
2. Intentar saltar etapas; debe fallar sin escritura parcial.
3. Adoptar una operación con historia previa: solicitante y revisor deben ser
   distintos, la historia omitida queda declarada y la evidencia conserva hash.
4. Intentar que el mismo actor solicite y apruebe la adopción; debe fallar.
5. Activar aviso de privacidad, equipo no administrador y expediente financiero.
6. Crear dos versiones de calendario; sólo una puede quedar activa después de
   revisión independiente.
7. Confirmar responsables y suplentes de hitos, resultados y alertas.
8. Descargar snapshot offline del calendario, cambiar la versión viva y
   comprobar que la copia informa su corte y no se hace pasar por actual.

## 4. Escenario B — Catálogo, GSC y campaña

1. Ingresar un paquete electoral sintético autorizado al staging de importación.
2. Verificar URL, elección/ronda, hash, conteos, parser, cuarentena y diff.
3. Intentar crear y aprobar el release con la misma persona; debe fallar.
4. Introducir un puesto ambiguo, un código alfanumérico y una fila sin dirección:
   no se inventan datos ni se activa una proyección dudosa.
5. Intentar activar dos proyecciones para la misma elección/ronda; sólo una puede
   permanecer activa.
6. Crear expediente GSC, formularios/seriales, custodios, entregas, devoluciones y
   lotes.
7. Provocar faltantes y conteos incompatibles; deben generar cuarentena.
8. Proponer una corrección compensatoria con fotografía completa. Comprobar
   enteros no negativos, saldos, inmutabilidad y los controles independientes
   exigidos según cambie formularios o clasificación de apoyos.
9. Rechazar la corrección; la historia se conserva y la cuarentena no desaparece.
10. Registrar evidencia externa sintética de resultado. La UI no debe afirmar
    radicación, certificación o validez de firmas.
11. Crear metas, tareas, eventos, comunicaciones e importación de personas.
    Probar duplicado, finalidad vencida, evidencia inválida y puesto ambiguo.
12. Revocar consentimiento; futuras audiencias y exportaciones deben excluirlo.
    La ausencia de proveedor real debe quedar visible, no inferirse entrega o
    supresión externa.

## 5. Escenario C — Preparación territorial y offline

1. Programar ventanas completas por puesto y mesa con titular y respaldo.
2. Intentar solapamiento incompatible, usuario inactivo, territorio ajeno,
   elección/ronda distinta y zona IANA ausente; todos deben fallar sin escritura
   parcial.
3. Recibir inventario, despachar concurrentemente más unidades que el saldo,
   registrar daño/devolución y conciliar con su revisión requerida.
4. Instalar la PWA en escritorio y dispositivo móvil de gama baja.
5. Negar almacenamiento persistente y verificar el mensaje de límite.
6. Provisionar grants exactos, snapshot de mapa de calor, calendario y bóveda
   AES-GCM con red disponible.
7. Cerrar por completo el navegador, desconectar la red y abrir `/aplicacion`.
8. Desbloquear la bóveda, capturar un registro territorial y un incidente,
   bloquearla y comprobar que el contenido en reposo no es legible.
9. Confirmar que el mapa offline conserva métrica, filtros, supresión, corte y
   advertencia de obsolescencia.
10. Intentar entrar a jornada y comprobar todos los bloqueantes por separado:
    fecha fuera de ventana, ninguna proyección, dos proyecciones, cero puestos,
    mesas esperadas inválidas, hueco temporal por puesto, mesa sin principal y
    mesa sin respaldo.
11. Con el universo completo, la transición debe aceptar exactamente una vez.

## 6. Escenario D — Jornada electoral

1. Hacer check-in con E-15/E-16, puesto, mesa, hora y usuario autorizados.
2. Capturar un E-14 conectado con archivo sintético, desglose y SHA confirmado.
3. Sin red, capturar otro E-14 con grant acotado; cerrar pestaña y navegador,
   reiniciar, desbloquear y comprobar que archivo y comando siguen pendientes.
4. Sincronizar el mismo comando dos veces: debe existir un solo resultado y el
   mismo recibo. Reusar el UUID con otro contenido debe fallar.
5. Revocar el grant antes de sincronizar; debe fallar cerrado y conservar el
   pendiente para decisión humana.
6. Enviar dos capturas divergentes de una mesa. Ninguna se acepta
   automáticamente y el autor no revisa su propio reporte.
7. Capturar incidentes críticos/altos online y offline; asignar, escalar,
   resolver y verificar replay/conflicto.
8. Simular API 500, Redis no disponible, Storage lento y red intermitente. La UI
   conserva estado, explica el alcance y no crea duplicados.
9. Comparar el mapa de calor vivo con el snapshot; ambos deben identificar
   métrica y corte, aplicar supresión y evitar exponer personas.
10. Registrar una reclamación interna y verificar que el sistema no afirma haber
    radicado o decidido ante la autoridad.

## 7. Escenario E — Escrutinio y poselección

1. Crear comisión, sesión, cobertura y documentos sintéticos E-24/E-26.
2. Conservar cadena de custodia, hash, versiones y estados
   interno/radicado/decidido/oficial sin inferir uno a partir de otro.
3. Registrar discrepancia, reclamación, versión corregida, referencia externa y
   decisión; cada actuación externa exige evidencia y revisión independiente.
4. Intentar declaratoria con documento interno, no aplicable o no revisado; debe
   fallar con un bloqueante resoluble.
5. Crear un dossier financiero versionado, extracto, conciliación, movimientos,
   aportes en especie y cuentas por pagar.
6. Dejar un movimiento pendiente y luego uno aprobado pero no reportado. Ambos
   deben bloquear readiness financiero.
7. Completar los tres controles independientes exigidos. Ningún actor puede
   aprobar controles incompatibles consigo mismo.
8. Adjuntar evidencia externa sintética confirmada y hacer que otra persona la
   revise. Una referencia sin versión, archivo o revisión no cierra el dossier.
9. Comparar tablero financiero, `POST_ELECTION → CLOSED` y expediente de
   empalme: ante la misma fotografía deben devolver los mismos códigos de
   bloqueante.
10. Cerrar discrepancias, reclamaciones, incidentes y obligaciones; generar el
    expediente de cierre y verificar su SHA.

## 8. Escenario F — Retención y cierre

1. Crear una política e inventario de retención, proponer disposición y aplicar
   un legal hold.
2. Aprobar la decisión con el revisor requerido; debe terminar en
   `APPROVED_NOT_EXECUTED` y **no borrar** filas ni objetos.
3. Intentar ejecutar disposición mientras hay hold; debe bloquearse.
4. Revocar el hold mediante el flujo autorizado y conservar ambos eventos.
5. Verificar que el producto nunca anuncie “eliminado” ni simule un job
   destructivo.
6. Ensayar terminación excepcional: solicitante y revisor distintos, snapshot,
   cancelaciones aplicables y obligaciones supervivientes.
7. Intentar una mutación operativa después de `CLOSED`; debe fallar, salvo las
   excepciones expresamente autorizadas de derechos, retención, auditoría,
   empalme o reapertura institucional.

## 9. Escenario G — Gestión pública y PQRSD

1. Crear un tenant nuevo `PUBLIC_OFFICE`, con finalidad, aviso, usuarios y roles
   propios. Un usuario de campaña no obtiene acceso por herencia.
2. Crear y activar un paquete de reglas/calendario sintético mediante revisor
   independiente; dos paquetes activos deben ser imposibles.
3. Recibir una solicitud con datos mínimos y, sólo si se aporta, radicado externo
   real. La referencia `PQRSD-INT-*` no se muestra como radicado oficial.
4. Registrar acuse, clasificación y análisis de competencia.
5. Asignar responsable y suplente; cambiar responsable no reinicia el término.
6. Proponer y revisar un traslado. Exigir destino, motivo, plazo, intento de
   entrega y evidencia.
7. Proponer y revisar una prórroga; comprobar vencimiento original, vigente y
   justificación.
8. Crear respuesta versionada, devolverla para cambios y generar una nueva
   versión sin reescribir la anterior.
9. Revisar y autorizar con la separación aplicable. Ningún estado interno se
   presenta como firma institucional.
10. Registrar intento de entrega fallido, reintento y entrega comprobada con
    evidencia del mismo expediente revisada independientemente.
11. Cerrar, reabrir y verificar historia append-only y alertas de vencimiento,
    competencia, suplencia, traslado, devolución, entrega y reapertura.
12. Probar listados enmascarados, acceso de alto impacto, StoredObject de otro
    tenant, exportación justificada y aislamiento de PII.
13. Confirmar el límite: sin integración de entidad, el sistema no radica,
    firma, notifica ni consulta una autoridad.
14. Intentar transferir automáticamente una persona de campaña; debe fallar.
    El flujo formal registro por registro sigue pendiente.

## 10. Escenario H — Seguridad, esquema y aislamiento

1. Repetir lecturas y mutaciones con dos tenants y todos los roles. Un ID,
   búsqueda, relación o archivo de A nunca aparece en B.
2. Probar token expirado, logout, cambio de rol, usuario inactivo, contraseña
   temporal y TOTP repetido.
3. Verificar nonce CSP y `strict-dynamic` para scripts. Documentar como residual
   `style-src 'unsafe-inline'` y JWT en `sessionStorage`.
4. Confirmar que el throttle usa Redis compartido entre réplicas; ensayar su
   política de degradación sin desactivar silenciosamente el control.
5. Ejecutar aprobaciones, transiciones y despachos concurrentes contra
   PostgreSQL real; una sola decisión incompatible puede ganar.
6. Verificar que 4xx/5xx no exponen stack, SQL, rutas, secretos ni PII y que
   conservan request ID.
7. Probar URL firmada expirada, ruta Storage de otro tenant, objeto no confirmado
   y SHA/tamaño incompatible.
8. Arrancar contra un schema personalizado. Readiness debe validar identidad,
   versión y `current_schema()`.
9. Intentar runtime por pooler de transacción o puerto 6543; debe rechazarse.
   Repetir con conexión directa y `search_path` esperado.

## 11. Escenario I — Recuperación y corte

1. Restaurar PostgreSQL y Storage en ambiente aislado conforme al
   [runbook](./RUNBOOK_RESPALDO_RESTAURACION_Y_CORTE.md).
2. Aplicar las migraciones del digest candidato y exigir deriva cero.
3. Levantar migrador, worker, API y web; comprobar heartbeat, readiness y versión.
4. Ejecutar los recorridos críticos de calendario, GSC, cobertura, E-14,
   incidente, escrutinio, finanzas y PQRSD sobre la copia.
5. Medir RPO/RTO y documentar `GO`, `NO-GO` o `ROLL-FORWARD`.
6. Sólo después, desplegar el mismo digest en una ventana controlada y ejecutar
   smoke anónimo y autenticado.

## 12. Acta de resultados

No se copian conteos históricos. El acta final debe registrar los resultados
exactos del candidato actual:

| Evidencia | Resultado |
| --- | --- |
| Commit y digest | **Pendiente de corrida final** |
| Versión/schema y migraciones | **Pendiente de corrida final** |
| API, PostgreSQL y HTTP e2e | **Pendiente de corrida final** |
| Web unitarias y Playwright escritorio/móvil | **Pendiente de corrida final** |
| Lint, TypeScript y builds | **Pendiente de corrida final** |
| Dependencias y contrato de despliegue | **Pendiente de corrida final** |
| Restauración PostgreSQL/Storage | **No demostrada todavía** |
| Staging equivalente | **No ejecutado todavía** |
| Simulacro humano integral | **No ejecutado todavía** |
| Smoke del candidato en producción | **No ejecutado todavía** |

El simulacro sólo se aprueba con cero P0/P1 abiertos, restauración demostrada,
responsables de contingencia disponibles y repetición completa del mismo
commit/digest sin retries ocultos. Un P2 aceptado necesita dueño, fecha y
mitigación manual escrita.
