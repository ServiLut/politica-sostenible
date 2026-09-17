# Logística electoral segura: alcance y protocolo operativo

## Resultado implementado

El módulo `/dashboard/logistics` convierte las tablas heredadas de inventario en
un flujo tenant-scoped de PostgreSQL/NestJS para:

1. crear bodegas con responsable opcional;
2. importar un catálogo de artículos como JSON validado (máximo 100 filas);
3. recibir existencias por saldo, lote o serial;
4. despachar uno o varios saldos a otra bodega o a un `PUESTO`/mesa activo;
5. confirmar recepción parcial o total y registrar faltantes/daños;
6. devolver existencias a origen;
7. conciliar consumo, faltantes, daños y devoluciones; y
8. conservar movimientos, eventos de custodia, incidencias y recibos
   idempotentes como registros append-only.

El frontend no usa Prisma ni recibe `tenantId`: consume exclusivamente la API
Nest en `/inventory-logistics`. La identidad del tenant y del actor proviene del
JWT y vuelve a validarse en PostgreSQL dentro de cada transacción.

## Controles que no se deben retirar

- Toda mutación usa aislamiento `SERIALIZABLE`, el advisory lock compartido con
  el cierre de operación, `OperationProfile FOR UPDATE` y locks ordenados
  `InventoryStockBalance FOR UPDATE`.
- El servicio vuelve a validar tenant de campaña, cuenta activa, rol actual y
  etapa actual dentro de la transacción. El guard HTTP es sólo la primera
  barrera.
- La base impide cantidades negativas y más de una unidad para un serial.
- `clientRequestId` es único por tenant. El hash SHA-256 canónico incluye el
  tipo y contenido completo del comando. Sólo el mismo actor, tipo y hash puede
  obtener un replay `noOp`; cualquier reutilización distinta retorna conflicto.
- Los movimientos, comandos, eventos de custodia e incidencias no admiten
  `UPDATE`, `DELETE` ni `TRUNCATE`, incluso para el propietario de las tablas.
- La conciliación exige que todo lo despachado esté recibido o declarado como
  novedad, y que cada unidad utilizable termine devuelta, consumida, faltante o
  dañada. El estado conciliado es inmutable.
- Una mesa sólo se acepta junto a un `PoliticalDivision` activo de tipo
  `PUESTO`, tenant-scoped, y nunca por encima de `expectedTables`.
- La vista de destino muestra únicamente id/código/nombre disponibles. No
  inventa dirección, comuna ni coordenadas ausentes en `PoliticalDivision`.

## Matriz mínima de roles y etapas

| Acción | Roles | Etapas permitidas |
| --- | --- | --- |
| Consultar expediente | administración, gerencia de campaña, coordinación zonal, cumplimiento, auditoría | todas, incluida `CLOSED` en sólo lectura |
| Crear bodega/importar catálogo | administración, gerencia de campaña | exploración a preparación; también simulación |
| Recibir stock inicial | administración, gerencia de campaña | exploración a día electoral; no poselectoral |
| Despachar | administración, gerencia de campaña | campaña, preparación, simulación, día electoral |
| Recibir destino | administración, gerencia, coordinación asignada | campaña a poselección, incluida simulación |
| Devolver | administración, gerencia, coordinación asignada | simulación, día electoral, poselección |
| Conciliar | administración, gerencia de campaña | simulación o poselección |
| Reportar incidencia | administración, gerencia, coordinación asignada | cualquier etapa abierta |

Una coordinación zonal sólo puede confirmar recepción, devolución o incidencia
de un despacho en el que figura como custodio. `CLOSED`, tanto normal como
excepcional, bloquea toda mutación en la transacción.

## Tratamiento de datos heredados

La migración `20260909210000_logistics_inventory_operations` conserva las filas
existentes. Cada tenant con artículos heredados recibe una bodega llamada
“Bodega heredada sin custodia verificada”, y el saldo anterior se copia sin
reclasificarlo. El origen queda `LEGACY_UNCLASSIFIED`; nunca se supone que hubo
conteo, responsable, lote o serial verificable. Una cantidad heredada negativa
hace fallar la migración para exigir conciliación humana, en vez de corregirse o
ocultarse automáticamente.

## Importación y evidencia

La importación actual es JSON estricto, no carga de archivos. Admite hasta 100
filas y rechaza SKU duplicados o una reclasificación silenciosa de un SKU ya
existente. Un CSV/XLSX debe validarse en el cliente y convertirse a este contrato
o implementarse más adelante mediante Storage + job; nunca debe enviarse como
binario a NestJS.

Las incidencias admiten una referencia HTTPS durable sólo cuando se entrega
también su SHA-256. No se reutilizó un bucket de otro dominio. La carga binaria
dedicada queda pendiente hasta definir un módulo Storage propio y su política de
retención.

## Operación sin conexión

No se incorporó este inventario a la bóveda E-14. Un snapshot de existencias y
comandos diferidos necesita grants propios, expiración, revocación, protección
contra replay y estrategia de conflictos. Copiarlo hoy a la bóveda electoral
mezclaría finalidades y podría mostrar saldos obsoletos como disponibles. La UI
debe considerarse online; las mutaciones siempre requieren confirmación del
servidor.

## Validación antes de despliegue

No se desplegó este cambio. El gate mínimo es:

```text
prisma validate + generate
migrate deploy sobre PostgreSQL desechable desde una base vacía
prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
fallo tardío deliberado de la migración y verificación de rollback total
unit/API/web TSC y lint
integración física con dos despachos concurrentes contra el mismo saldo
E2E desktop y Pixel con roles de administración, coordinación y auditoría CLOSED
```

La prueba física se habilita con
`INVENTORY_INTEGRATION_DATABASE_URL` (o `TEST_DATABASE_URL`) y está en
`inventory-operations-postgres.integration.spec.ts`. Debe ejecutarse únicamente
contra una base efímera: crea tenants sintéticos y los libros append-only no se
borran como parte del test.
