# Sellos electrónicos de vínculo y metadatos

## Alcance

`/dashboard/integrity-signatures` sella el vínculo y los metadatos de evidencia
que ya fue cargada, confirmada y consumida por un registro financiero o un
reporte E-14. Este flujo es distinto de la recolección de apoyos ciudadanos y
no sustituye una radicación, firma o reporte exigido por una autoridad. Tampoco
recalcula en el servidor el SHA-256 de los bytes del archivo.

La interfaz nunca acepta `tenantId`, propietario, ruta de Storage ni hash desde
el navegador. Nest deriva la organización del JWT, resuelve únicamente objetos
confirmados que cargó la persona autenticada y vuelve a verificar que el
recurso enlazado le pertenezca.

## Sello

1. La UI consulta `GET /electronic-signature/candidates?module=...`.
2. La API filtra por tenant, usuario, módulo, estado `CONSUMED`, vínculo y
   alcance territorial. La respuesta no expone la ruta privada del objeto.
3. La persona selecciona un candidato y confirma con un código MFA vigente.
4. La API consulta directamente en Storage el `etag`, tamaño y tipo actuales.
5. Dentro de una transacción, Nest toma el lock de ciclo operativo, revalida que
   la operación no esté cerrada e impide un segundo sello de la misma persona
   sobre el mismo documento.
6. El digest de metadatos liga versión, tenant, firmante, módulo, tipo e ID del recurso,
   documento, propietario, tipo MIME, `etag`, tamaño y fechas de confirmación y
   consumo. No contiene una huella de los bytes recalculada por el backend. El
   evento de auditoría conserva el IP sólo como hash con sal.

El servicio serializa este flujo mediante el lock del ciclo y comprueba
explícitamente si ya existe un sello para devolver un conflicto entendible. La
defensa de unicidad física para `(tenantId, documentId, signerId)` debe
conservarse en el esquema antes de liberar el módulo.

## Comprobación y cierre

La comprobación requiere el ID del sello, módulo e ID exacto del recurso. La API
recalcula el digest de vínculo y vuelve a consultar Storage. Sólo devuelve
`valid: true` cuando coinciden propiedad, vínculo, metadatos y digest. Además
devuelve siempre `integrityScope: LINK_AND_STORAGE_METADATA` y
`contentIntegrity: UNVERIFIED` para impedir que un consumidor confunda esa
coherencia con verificación independiente de bytes.

Después de `CLOSED` no se pueden crear sellos nuevos, pero la consulta de los
existentes permanece disponible para auditoría y conservación. Un resultado
`valid: true` prueba únicamente coherencia interna de vínculo y metadatos; no
certifica integridad del contenido, autoría jurídica, validez de un apoyo
ciudadano ni aceptación por el CNE o la Registraduría.

## Límites deliberados

- Sólo sella evidencia financiera o E-14 ya vinculada; no documentos sueltos.
- Sólo sella quien cargó y es propietario del recurso enlazado.
- Requiere MFA habilitado y una capacidad de plan confirmada por la API.
- No publica archivos, rutas privadas, hashes completos ni datos del firmante.
- Si Storage no responde o cambió cualquier metadato, la operación falla
  cerrada.
- La API de subida firmada usada no aporta una suma SHA-256 independiente y el
  backend no descarga el binario, por lo que no debe presentarse como una firma
  documental verificable ni como atestación forense del contenido.
