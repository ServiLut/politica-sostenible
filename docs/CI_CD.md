# Fábrica de verificación y entrega de Política Sostenible

La configuración de CI está en [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). Comprueba el código, su historial, las pruebas y las imágenes antes de emitir un recibo del commit evaluado. **Este archivo no configura por sí solo las reglas obligatorias de GitHub y no realiza un despliegue.**

## Estado y alcance

| Control | Estado de la implementación | Qué falta fuera del repositorio |
| --- | --- | --- |
| Análisis de secretos y archivos inseguros antes de instalar dependencias | Job `security-gate` preparado | Ejecutar el workflow publicado y resolver sus hallazgos |
| Pruebas, compilación e integración de contenedores | Jobs existentes conservados, dependientes de seguridad | Obtener una ejecución verde para el SHA que se pretende entregar |
| Cierre obligatorio y recibo | Job `factory-gate` preparado | Configurarlo como comprobación requerida en GitHub |
| Protección de ramas y revisión de cambios del workflow | Debe configurarse en GitHub | Acceso de propietario o administrador; no se presume activa |
| Despliegue continuo | **Asistido** | No hay un puente automático confiable activado entre CI y producción |

Publicar estos archivos no demuestra que las reglas remotas estén activas. Un administrador debe confirmar la configuración y una ejecución real; hasta entonces no se debe describir la fábrica como obligatoria en GitHub.

## Recorrido de CI

Se ejecuta con `pull_request`, `merge_group`, `workflow_dispatch` y pushes a `main`, `release/**` y `codex/**`. Los eventos manuales no reciben parámetros para omitir controles.

1. **`security-gate`:** checkout con historial completo, sin persistir credenciales, Node 22 y ejecución de:

   ```sh
   node deploy/security-gate.mjs --history --tracked-only --redact-locations --report=.artifacts/security-gate.json
   ```

   Revisa archivos versionados y el historial local alcanzable obtenido por el checkout completo. La salida pública contiene reglas y huellas opacas de las ubicaciones, nunca valores, rutas, líneas ni identificadores de objetos encontrados. Así se evita divulgar dónde localizar un secreto pendiente en un repositorio público. La ejecución local sin `--redact-locations` conserva las ubicaciones seguras para investigar. La redacción sólo modifica la presentación: no elimina hallazgos ni cambia el resultado. Una excepción del analizador, falta de cobertura o hallazgo bloqueante impide continuar.
2. **`test-and-build`:** sólo empieza después de aprobar seguridad. Conserva auditoría de dependencias, pruebas de migraciones, PostgreSQL y Redis reales, contratos HTTP, lint, TypeScript, pruebas unitarias, compilación, imagen combinada y E2E de navegador.
3. **`compose-runtime-smoke`:** también depende de seguridad. Conserva la comprobación de la topología separada, revisión OCI, usuarios de contenedores, aislamiento de secretos, sistemas de archivos de sólo lectura y cierre ordenado. Utiliza exclusivamente recursos de evaluación del runner.
4. **`factory-gate`:** usa `if: always()` y espera los tres jobs anteriores. Sólo `success` para los tres permite emitir el recibo. `failure`, `cancelled`, `skipped`, resultados ausentes o datos inválidos producen un fallo. No existe `continue-on-error` para convertir un control fallido en aprobación.

Si GitHub cancela toda la ejecución o no llega a iniciar un job, tampoco existe un resultado satisfactorio del cierre. La protección remota debe exigir ese resultado; no basta con que algunos jobs hayan terminado bien.

La auditoría de dependencias conserva el JSON completo de `pnpm audit --json` y su código de salida. `deploy/dependency-audit.mjs` rechaza errores del registro, reportes incompletos, avisos desconocidos y vulnerabilidades sin mitigación verificada; no utiliza umbrales que oculten avisos ni `ignore-advisories`. Un aviso que aún no tenga versión corregida sólo puede aceptarse mediante la política exacta de `security/dependency-mitigations.json`: revisión independiente, parche y regresión con hashes coincidentes, comprobación de las copias realmente instaladas y pruebas adversariales satisfactorias. El aviso de origen sigue visible. Un cambio de archivo, resolución, versión o caducidad invalida esa aceptación. El propietario debe revisar también los cambios en `/patches/`, cubiertos por `CODEOWNERS`.

## El recibo y los artefactos

[`deploy/ci-factory.mjs`](../deploy/ci-factory.mjs) usa sólo módulos nativos de Node. Contrasta `GITHUB_SHA` con `git rev-parse HEAD` y valida repositorio, ID de ejecución, intento, evento y resultados. No copia el entorno ni los `outputs` arbitrarios de los jobs.

El recibo `.artifacts/ci-factory-receipt.json` incluye:

- SHA completo del checkout, repositorio, `runId`, `runAttempt` y enlace a la ejecución.
- Resultado satisfactorio de `security-gate`, `test-and-build` y `compose-runtime-smoke`.
- Fecha de emisión, versión del formato y `deploymentPerformed: false`.

En un pull request, `GITHUB_SHA` puede identificar el commit de integración que GitHub prueba. **No sustituye la prueba del SHA final de `main` o de la versión que se publicará.** No se acepta un recibo de otra rama, ejecución, intento, repositorio o commit para justificar la entrega del candidato actual.

El JSON es un recibo de verificación, no una firma criptográfica ni una prueba de despliegue. Su procedencia se comprueba en la ejecución real de GitHub y sus artefactos; un archivo generado o editado localmente no acredita CI remoto.

Sólo se suben dos archivos con `actions/upload-artifact` fijado a un SHA completo:

| Artefacto | Cuándo se conserva | Retención |
| --- | --- | --- |
| `security-gate-<sha>-<run>-<intento>` | También cuando falla el análisis, si existe el reporte seguro | 7 días |
| `ci-factory-<sha>-<run>-<intento>` | Exclusivamente después de aprobar el cierre | 14 días |

Las rutas de subida son archivos explícitos, aunque estén en `.artifacts`. No se suben directorios completos, `.env`, volcados, logs de servicios, credenciales ni sesiones. La falta del archivo esperado falla el paso. Todos los checkouts usan `persist-credentials: false`; el workflow sólo tiene `contents: read` y no recibe secretos de producción.

## Activar la obligatoriedad en GitHub

Esta parte necesita acceso de propietario o administrador y debe verificarse en el repositorio correcto:

1. Publicar el workflow y comprobar que GitHub reconoce `factory-gate` en una ejecución real. Si seguridad bloquea, resolver el hallazgo; no saltar el job para crear un resultado verde.
2. Crear o actualizar las reglas de `main`, `release/**` y todas las ramas que puedan alimentar una entrega. En la configuración revisada también deben incluirse `codex/presentacion-profesional-20261006` y `codex/recuperacion-politica-20260921`: exigir pull request, revisión de propietarios y la comprobación `factory-gate` de GitHub Actions, proteger contra force-push y borrado, y no incluir actores con bypass. La identidad de la aplicación que publica el check se debe verificar en la ejecución real. Si se usa cola de integración, mantener `merge_group` y comprobar su ejecución.
3. Exigir revisión de los cambios en `.github/workflows/`, `deploy/security-gate*`, `deploy/ci-factory*` y la política de excepciones del analizador. Un workflow editable sin revisión no constituye una frontera de seguridad independiente.
4. Probar con un PR cuyo control falle y con otro válido; confirmar que el primero no puede integrarse. Guardar la evidencia de la regla remota y del resultado, sin copiar secretos.

Estos pasos describen la configuración pendiente. No se han activado mediante la edición del YAML.

## Si el análisis encuentra una credencial

No mostrar ni copiar el valor en comentarios, issues, reportes, capturas o artefactos. Eliminarlo de la versión actual no lo retira del historial. Si es real, coordinar su revocación o rotación y la remediación del historial con el propietario; una reescritura de Git requiere una decisión expresa y no se ejecuta automáticamente desde CI.

Una credencial probable pendiente de clasificación sigue siendo un bloqueo. No añadir exclusiones generales, desactivar `--history`, recortar `fetch-depth` o usar `continue-on-error`. Las excepciones permitidas por el analizador deben corresponder exclusivamente a fixtures sintéticos revisados, con el alcance exacto y la caducidad definidos por su política. Nunca deben usarse para permitir una credencial real.

## Entrega asistida, separada de la verificación

El workflow no tiene acceso al VPS compartido y no ejecuta cambios en Dokploy. Una entrega sigue requiriendo identificar el SHA candidato y su ejecución satisfactoria, revisar el estado de los datos y la reversión, preparar el artefacto inmutable y aplicar la autorización vigente para **Política Sostenible únicamente**.

Tras instalarlo se debe comprobar la revisión publicada, salud, autenticación, aislamiento entre organizaciones y recorridos reales en celular y escritorio. Esas pruebas de producción se registran aparte: un recibo verde de CI no demuestra que el dominio público ya use esa versión ni que otros programas hayan permanecido saludables.

Para automatizar CD en el futuro hace falta un puente con identidad y permisos limitados al proyecto, validación del repositorio/SHA/ejecución, imágenes por digest, entorno de producción protegido y recuperación comprobada. Hasta que ese circuito exista y se pruebe, la descripción correcta es **CI preparada y CD asistido**.

## Contrato de base preparado el 16 de octubre de 2026

El candidato incorpora la migración 47, `20261016213000_schema_contract_marker`, que cierra la cadena después de las dos migraciones de importación del 6 de octubre. API y migrador exigen ese mismo marcador al finalizar; el marcador anterior se admite exclusivamente como punto de partida para migrar. La nueva migración avanza desde el predecesor esperado y vincula el `search_path` de funciones PL/pgSQL únicamente al esquema activo, dentro de una transacción.

**Esta migración no está aplicada en producción.** Su futura entrega requiere comprobar respaldo y recuperación del estado actual, ejecutar la cadena canónica y validar el nuevo contrato. Las evidencias de despliegues anteriores al nuevo marcador no sustituyen ese control. Se conservaron los SQL históricos: el archivo de importación que estaba materializado con CRLF en Windows se restauró a los bytes LF exactos de `HEAD`, sin alterar el contenido versionado ni su checksum canónico.

La reversión también debe respetar este contrato: una imagen anterior que sólo acepte el marcador previo no estará lista frente a una base ya migrada. Antes de entregar se debe ensayar una imagen de reversión compatible con el marcador nuevo o la restauración coordinada del respaldo; volver únicamente a la imagen anterior no constituye una recuperación validada.

La prueba `schema-contract-marker.integration.test.mjs` verifica en PostgreSQL 16 el avance, el rechazo de identidades inválidas, la reversión ante un fallo posterior y el aislamiento frente a funciones de otro esquema. CI la ejecuta con su base de pruebas; sin la variable explícita de integración, las pruebas de PostgreSQL se omiten y no cuentan como evidencia de ejecución real.

## Verificación local de los contratos

Con las dependencias del monorepo instaladas y Node 22:

```sh
node --test deploy/ci-factory.test.mjs deploy/compose-production.test.mjs deploy/repository-safety.test.mjs
node deploy/security-gate.mjs --history --report=.artifacts/security-gate-local.json
```

La segunda orden local también revisa archivos no versionados que no estén ignorados. Un fallo del analizador no se transforma en éxito por haber aprobado las pruebas del contrato. Las pruebas de la fábrica cubren resultados negativos, la correspondencia exacta del checkout, la ausencia de valores privados en el recibo y modificaciones del YAML que intentarían omitir controles. No despliegan ni publican cambios.
