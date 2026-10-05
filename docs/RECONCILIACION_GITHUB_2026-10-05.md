# Reconciliación de GitHub y del trabajo local

Se descargó `origin` el 5 de octubre de 2026. La revisión de `main` recibida es
`054401fd614b83444d8730a4226bb6030a1ea2c7` y contiene dos commits posteriores
a la base común `48e14f7835ed2525ee27c0d32375cfec391edde2`:

- `316ee2caf5a8cb8f0ba307243a381d7be482f432`, del 29 de septiembre,
  «Restore dashboard styling and responsive layout».
- `054401fd614b83444d8730a4226bb6030a1ea2c7`, del 5 de octubre,
  «cambios de jose 2».

El delta remoto real contiene 41 archivos. Las diferencias de 261 archivos
frente al candidato local FD01 también contienen el trabajo local que nunca
había llegado a esa rama; no son 261 archivos cambiados o eliminados por el
autor de los commits nuevos. La integración conserva ambas historias.

## Relación con el incidente de arranque

Los dos commits remotos no son ancestros de ECC, FD01 ni del candidato local
`81839db499b6a9ce91876ed47623598b866685af`. El corte fallido utilizó las imágenes
ECC/FD01 previamente verificadas. El delta remoto no cambia `start.mjs`,
`runtime-environment.mjs`, `migrate.mjs`, `compose.recovery.yml` ni Prisma.

La evidencia del incidente identifica otro mecanismo: el comando compuesto
preparado durante esta revisión salía del entorno limpio de Dokploy antes del
`compose up`. El contenedor resultante recibió una configuración distinta de
la del proyecto; la recuperación funcionó con una única orden y sin editar
conexiones. Estos cambios de GitHub no explican ese incidente concreto.

## Decisiones de integración

| Área | Decisión y motivo |
| --- | --- |
| Next y dependencias | Incorporar Next y eslint-config-next 16.3.6 y los overrides remotos; instalar con pnpm 10.28.2 y lockfile congelado, y volver a probar/compilar. La instalación remota aislada y la integrada pasaron sin reescribir el lockfile. |
| Perfiles operativos | Conservar el servicio local con alistamiento calculado, ventanas, transición, calendario, firmas y cierre. El remoto conserva un método `READY` fijo heredado; sus nuevas comprobaciones parciales ya están cubiertas por la implementación local. |
| Territorio y casos | Conservar la comprobación local de división/territorio y la auditoría mínima. La validación remota de identificadores no sustituye esos controles. |
| Planes | Conservar la creación de planes sin sobrescritura y las protecciones del seed histórico, sin cambiar SQL publicado ni sus checksums. |
| Arranque y composición | Conservar los archivos operativos locales. Ya propagan APP_REVISION a los procesos y contienen el worker separado; así se evita duplicar variables y reducir recursos sin medición. La topología productiva no se cambia por esta reconciliación. |
| Interfaz | Conservar controles y diálogos locales accesibles, contraste y movimiento reducido. Incorporar la columna `minmax(0, 0.65fr)` del perfil para que pueda contraerse. Los botones remotos con tipo explícito ya tienen equivalentes locales. |
| Tipos y formato | Incorporar imports de tipos y formato que no cambian contratos funcionales. |
| Pruebas y CI | Preservar controles de lint, pruebas HTTP reales y protecciones físicas de migración. Revisar mejoras remotas de CI sin sustituir esas comprobaciones por exclusiones de tests. |

## Lectura de los ensayos del remoto

Sobre una copia aislada de `054401f`, Prisma y TypeScript de API pasaron. La
suite Nest con sustitutos aprobó sus tres casos; no demuestra PostgreSQL real.
La suite API completa tuvo 2350 aprobadas, 53 fallidas y 42 omitidas. De las
fallidas, 37 pertenecen a tests e implementaciones directas idénticos a la base
común; otras 16 involucran el perfil modificado. Sin ejecutar toda la base común
no se atribuyen esas 16 automáticamente al commit nuevo.

Las pruebas web del remoto tuvieron 265 aprobadas y seis fallidas en esta
máquina. Varias inspeccionan texto de fuente y saltos de línea; el resultado
no se equipara sin análisis a seis defectos de interfaz. Las 120 pruebas de
despliegue remotas pasaron, pero algunas guardas fueron debilitadas: una suite
verde por sí sola no compensa la pérdida de una comprobación.

## Verificación de la integración

El 5 de octubre se reinstaló la versión reconciliada con el lockfile congelado
y se ejecutaron de nuevo las pruebas con las dependencias incorporadas:

| Comprobación | Resultado y alcance |
| --- | --- |
| API completa | 2482 aprobadas, una omitida; 224 suites aprobadas y una omitida. La omitida requiere una URL de Redis de integración explícita. |
| Web unitarias | 320 aprobadas; no equivalen a navegación en dispositivos. |
| Contratos de despliegue | 128 aprobadas y 20 omitidas por requerir entornos físicos específicos. |
| Nest con sustitutos | Tres aprobadas; no demuestra por sí solo PostgreSQL real. |
| HTTP real | 33 aprobadas con Nest, JWT, PostgreSQL 16 y Redis 7 locales aislados. |
| Limpieza del ensayo HTTP | 104 usuarios sintéticos inactivos; cero tareas, eventos o líderes; 12 auditorías conservadas. |
| TypeScript | API completa, configuración de build API y web aprobadas. |
| ESLint | Web: 243 archivos sin errores ni advertencias. API: 560 archivos, una corrección de formato en el test de parámetros y comprobación focal final aprobada; sin advertencias. |
| Dependencias de producción | Auditoría de 493 dependencias: cero alertas informadas. Es una consulta de avisos conocidos, no una prueba de ausencia de vulnerabilidades. |

La auditoría de toda la cadena sigue notificando una alerta alta en `braces`
3.0.3, por `eslint-config-next → @next/eslint-plugin-next → fast-glob →
micromatch`. El aviso oficial
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
no tiene versión corregida al momento de la revisión. No se silenció la alerta
ni se sustituyó la auditoría de CI por una revisión sólo productiva.

La dependencia está en herramientas de desarrollo. El árbol productivo no la
incluye y el análisis de la configuración de ESLint no encontró una ruta
desde entradas HTTP o datos del CRM hasta sus patrones. Dos archivos reales
pasaron lint con la regla activa sin invocar `fast-glob`. Esto acota la
exposición observada, pero no corrige el paquete ni permite declarar verde la
auditoría completa. La exclusión física de la imagen final se verifica tras
construirla.

Se preservan los informes y logs completos bajo
`.artifacts/production-resume-20261005` en el workspace original. La compilación
final y las pruebas de navegador/productivas siguen siendo pasos distintos.
Los resultados del candidato 81839db o del remoto 054401f no se presentan como
validación de una imagen reconciliada todavía no publicada.
