# Protocolo de catálogo electoral RNEC

> Corte de verificación: 9 de septiembre de 2026, `America/Bogota`.
> Este documento registra evidencia técnica del candidato local. No concede una
> licencia de reutilización, no sustituye la DIVIPOLE entregada a una agrupación
> política y no certifica que un archivo siga vigente para otra elección.

## Regla operativa

Una lista de departamentos y municipios no es una DIVIPOLE electoral. Para
habilitar cobertura de testigos, mesas y actas E-14, cada organización debe
activar un release inmutable que identifique, como mínimo:

- elección y fecha electoral exactas;
- fuente y organización publicadora;
- fecha de corte de la fuente;
- archivo original y su SHA-256;
- referencia de autorización y declaración de licencia;
- departamentos, municipios, zonas, puestos y mesas esperadas;
- dirección y, cuando estén disponibles, coordenadas;
- código físico de fuente, fecha lógica de la jornada y zona horaria IANA
  verificable, sin inferirla por país o coordenadas;
- validación técnica y aprobación de una segunda persona distinta de quien
  creó el release.

No se permite describir un catálogo como «actualizado» solo porque la URL aún
responda. La vigencia es específica de una elección y un corte; los puestos y
sus direcciones pueden cambiar incluso pocos días antes de votar.

## Fuentes públicas verificadas

Para las dos vueltas presidenciales de 2026 se observaron estas publicaciones
oficiales, sin copiarlas ni incorporarlas al repositorio:

| Uso                                          | Fuente                                                                                                                          | Evidencia observada                                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Página de procedencia                        | [Elección de presidente y vicepresidente 2026](https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica/)    | La página ofrece la consulta de ubicación de puestos y enlaza resultados/actas oficiales.                                                                                              |
| Jerarquía y mesas                            | `https://divulgacione14presidente.registraduria.gov.co/assets/temis/divipol_json/departmentsTree.json`                          | 34 departamentos o circunscripciones, 1.189 municipios/países, 3.013 zonas, 14.438 registros de puesto y 122.020 mesas esperadas.                                                      |
| Dirección y georreferencia                   | `https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica/data/data.json`                                    | 13.742 ubicaciones de Colombia y consulados con dirección y coordenadas.                                                                                                               |
| Página de procedencia de segunda vuelta      | [Segunda vuelta presidencial 2026](https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica-segunda-vuelta/) | Identifica la jornada del 21 de junio de 2026 y enlaza sus visores E-14 propios.                                                                                                       |
| Jerarquía y mesas de segunda vuelta          | `https://e14segundavueltapresidente.registraduria.gov.co/assets/temis/divipol_json/departmentsTree.json`                        | 34 departamentos o circunscripciones, 1.189 municipios/países, 3.013 zonas, 14.438 registros de puesto y 122.020 mesas esperadas. No es intercambiable con el árbol de primera vuelta. |
| Dirección y georreferencia de segunda vuelta | `https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica-segunda-vuelta/data/data.json`                     | 13.742 ubicaciones; su contenido difiere de primera vuelta y debe permanecer ligado a esta jornada.                                                                                    |
| Condiciones de uso                           | [Políticas de privacidad y condiciones de uso](https://www.registraduria.gov.co/Politicas-de-privacidad.html)                   | La Registraduría restringe reproducción/almacenamiento sin autorización previa y permite descarga personal no comercial con atribución.                                                |

Huellas observadas durante el corte, útiles para detectar que la publicación
cambió y obligar a una nueva revisión:

| Recurso                        |     Bytes | SHA-256 observado                                                  | `Last-Modified` observado                    |
| ------------------------------ | --------: | ------------------------------------------------------------------ | -------------------------------------------- |
| Jerarquía/mesas                | 4.644.523 | `a00e278b4c23eb60df1fdd6e741484e2dd3a2a917904c2ef15c376d22ad7233a` | 28 de julio de 2026, 13:58:16 GMT            |
| Georreferencia primera vuelta  | 3.607.008 | `97e63445d15bf9e4f9fefaff386d88d0941a082669519e6c40d5b9105b868161` | 12 de mayo de 2026, 21:55:48 GMT             |
| Jerarquía/mesas segunda vuelta | 4.644.524 | `d9017e0cea31e06f29284b336a0904d7035d350ea262a6a1afa99bd97315833e` | Verificado por descarga completa en el corte |
| Georreferencia segunda vuelta  | 3.607.008 | `b9ca4ec43b96597151a43c7d18c7fa794d0b807b54248e5f360333848100ea38` | Verificado por descarga completa en el corte |

Las huellas no convierten el contenido en reutilizable ni prueban vigencia
futura. Si cualquiera cambia, debe tratarse como un release nuevo.

### Validación física transitoria del universo publicado

El 9 de septiembre de 2026 se ejecutó el adaptador `rnec-public-package.v2`
contra los archivos completos de ambas vueltas directamente desde sus URLs,
únicamente en memoria y sin guardar ni activar ningún conjunto. Primera vuelta,
con una omisión explícita de coordenadas y cinco decisiones de correspondencia
declaradas, produjo exactamente:

- 34 departamentos o circunscripciones;
- 1.189 municipios o países;
- 3.013 zonas;
- 14.438 registros de puesto;
- 122.020 mesas esperadas;
- 203 representaciones de puesto sin dirección publicada, incluidas las
  repeticiones de una misma sede consular por día;
- una ubicación sin coordenadas utilizables.

Los 14.438 registros jerárquicos no equivalen a 14.438 sedes físicas. El árbol
contiene 13.742 registros base de ubicación y 696 representaciones adicionales
de jornadas anticipadas en consulados; estas últimas reutilizan una sede del
archivo geográfico. El sistema debe conservarlas para operar cada jornada y
sumar correctamente sus mesas, pero la interfaz debe llamarlas **registros de
puesto/jornada**, no inflar el número oficial de ubicaciones físicas. Los
centroides geográficos deben deduplicar coordenadas reutilizadas.

El archivo geográfico observado no aporta una zona horaria IANA verificable
por sede exterior. Por eso el adaptador proyecta `America/Bogota` únicamente
para puestos domésticos y conserva `null` para CONSULADOS. Un `null` se muestra
como bloqueo y no habilita asignación ni captura E-14 REAL. Incorporar una zona
exterior requerirá una fuente HTTPS/referencia comprobable y un cambio de
release revisado; nunca se deriva automáticamente de país o coordenadas.

Segunda vuelta, con dos omisiones explícitas de coordenadas y cuatro decisiones
de correspondencia declaradas, produjo exactamente los mismos cinco primeros
totales, 203 representaciones sin dirección y dos ubicaciones sin coordenadas
utilizables. El adaptador también rechazó mezclar árbol o georreferencia entre
vueltas y recalculó la huella canónica de cada `payload` embebido.

Esta ejecución prueba que el adaptador puede representar el universo observado;
**no autoriza su uso ni valida las decisiones humanas declaradas**. Los dos
pares de puestos homónimos deben ser resueltos por una persona autorizada usando
evidencia independiente. La prueba diagnóstica no se guardó como release
activable.

## Hallazgos de calidad que el importador debe controlar

1. Hay 187 códigos de puesto alfanuméricos, por ejemplo `A1`, `B2` o `W9`.
   Rechazarlos por no ser enteramente numéricos deja incompleto el catálogo.
2. El emparejamiento normalizado por departamento, municipio y nombre resolvió
   de manera única 13.484 de 13.489 puestos nacionales. Cuatro registros forman
   dos pares ambiguos y uno difiere por la grafía `UWA`/`U'WA`. No es lícito
   escoger por orden de aparición.
3. En el exterior, la jerarquía representa varios días de votación para una
   misma sede. Al retirar solo un prefijo inequívoco de día se resolvieron 926
   de 949 registros; los restantes incluyen nombres truncados. Una coincidencia
   por prefijo solo es válida si produce un único candidato.
4. La primera vuelta contiene una coordenada imposible: la sede Miami-Hialeah
   (`codigo` 13606) publica latitud `25857689574473300`. La segunda vuelta
   conserva ese mismo valor imposible y añade otro: Togoromá, El Litoral del
   San Juan, Chocó (`codigo` 6871), aparece como `43558102.0`. El sistema debe
   rechazar el release o exigir una regla `OMIT_COORDINATES` que compruebe los
   valores originales y deje ambos ejes en `null`; nunca recortar, dividir,
   sustituir ni «arreglar» el número en silencio.
5. En primera vuelta, 65 filas geográficas no publican dirección. El importador
   las conserva como `null` y la interfaz debe decir «Sin dirección publicada»;
   no inventa una dirección y no elimina por ello el puesto o sus mesas.
   Al contar las repeticiones lógicas por jornada, esas ausencias aparecen en
   203 registros; la métrica física verificable sigue siendo 65 ubicaciones.
6. La dirección puede cambiar sin que cambie el código. Toda diferencia debe
   mostrarse antes de activar un release sustituto.

## Flujo de carga autorizado

1. Una persona administradora obtiene los dos archivos de la misma elección y
   conserva los originales.
2. Registra URL, elección, fecha de corte, autorización/licencia y nombre del
   conjunto de datos.
3. El navegador arma un paquete JSON explícito y solicita a NestJS una URL de
   subida firmada.
4. El navegador sube el paquete directamente a Supabase Storage. El binario no
   atraviesa NestJS.
5. NestJS verifica ruta tenant-scoped, tipo, tamaño y SHA-256; BullMQ procesa el
   artefacto de forma idempotente.
6. El adaptador une jerarquía y georreferencia solo con reglas deterministas.
   Una falta, duplicado o ambigüedad bloquea el release e identifica qué debe
   resolverse.
7. Cualquier override referencia tanto el código canónico del puesto como una
   fila geográfica única y queda dentro del artefacto hasheado. No se aceptan
   decisiones implícitas ni reutilización de una ubicación para dos puestos,
   salvo la representación explícita de una misma sede exterior en días
   distintos.
8. Una persona de cumplimiento o auditoría valida integridad y diferencias.
9. Otra persona autorizada, distinta de quien creó el release, lo activa. La
   proyección anterior queda supersedida, no sobrescrita.

## Puerta de producción

Un catálogo no puede entrar en operación si presenta cualquiera de estas
condiciones:

- elección o fecha de corte ausentes;
- procedencia no oficial o URL fuera de los dominios autorizados;
- licencia/autorización sin documentar;
- hash distinto al archivo que fue revisado;
- municipio sin zona, zona sin puesto o puesto sin mesas esperadas;
- código inválido o duplicado;
- dirección vacía transformada en texto inventado, en vez de conservarse como
  ausencia explícita y visible;
- puesto REAL sin fecha lógica o sin zona horaria IANA respaldada por la
  fuente; para exterior la ausencia permanece visible y bloquea operación;
- coordenada parcial o fuera de rango sin una omisión explícita, justificada y
  ligada exactamente a los valores originales;
- unión geográfica ambigua o incompleta;
- cambio de código que dejaría usuarios, votantes, testigos o casos sin
  crosswalk;
- creador y aprobador iguales;
- fecha electoral distinta de la configurada para la organización.

La activación técnica significa «dataset aceptado por esta organización para
esta elección y este corte». No significa que la Registraduría haya certificado
este software ni que el catálogo sea válido para un proceso posterior.
