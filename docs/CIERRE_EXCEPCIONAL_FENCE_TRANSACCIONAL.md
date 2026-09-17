# Cierre excepcional: alcance de la barrera transaccional

## Garantias implementadas

Las operaciones de solicitar, revisar y cancelar una terminacion excepcional, y el `PUT` ordinario del perfil operativo, usan una transaccion `SERIALIZABLE`, la misma llave asesora PostgreSQL `operation-profile-lifecycle:{tenantId}` y un bloqueo `FOR UPDATE` sobre `OperationProfile`. Por tenant, una aprobacion no puede confirmar a la vez que otra aprobacion, una nueva solicitud o un cambio ordinario del perfil.

La base de datos agrega una segunda barrera: una sola solicitud `PENDING` y una sola `APPROVED` por perfil, enlace diferido y bidireccional entre el cierre excepcional y su solicitud aprobada, inmutabilidad de perfiles `CLOSED`, e inmutabilidad y no eliminacion del expediente. Los conflictos serializables se convierten en `409`; no se informa exito hasta leer el resultado confirmado.

La aprobacion cancela, en su misma transaccion, las comunicaciones de campana no publicadas que ya existian en el snapshot bloqueado. No elimina datos ni declara cumplidas las obligaciones supervivientes.

## Riesgo residual conocido: mutaciones de otros dominios en vuelo

`OperationStageGuard` es una barrera al inicio de la peticion, no una barrera linealizable de base de datos. Una mutacion de otro dominio puede superar el guard mientras la operacion sigue abierta y confirmar despues de que otra transaccion apruebe el cierre. Tambien puede ocurrir con una nueva comunicacion que se inicie antes de la aprobacion y se confirme despues del snapshot usado para cancelar comunicaciones.

Este riesgo no esta oculto ni se considera resuelto por el cierre excepcional. El expediente devuelve las comunicaciones canceladas en esa transaccion y exige verificar canales y obligaciones supervivientes; no emite una certificacion de cumplimiento o radicacion.

## Fence requerido para eliminar el TOCTOU

Antes de considerar el cierre una frontera global linealizable, cada servicio mutante de campana debe, dentro de su propia transaccion y antes de escribir:

1. adquirir `pg_advisory_xact_lock(hashtextextended('operation-profile-lifecycle:' || tenantId, 0))`;
2. bloquear el `OperationProfile` tenant-scoped con `FOR UPDATE`;
3. revalidar que la etapa no sea `CLOSED` y que cualquier excepcion legal este expresamente permitida;
4. efectuar la escritura sin liberar esa transaccion.

La alternativa de mayor defensa es agregar una version de cierre (`closureEpoch`) vinculada por constraint o trigger a toda escritura operativa. Esa expansion exige inventariar cada tabla y cada excepcion legal de retencion/derechos, por lo que queda como trabajo de seguridad separado y no debe improvisarse en esta migracion.

## Prueba y operacion

`operation-termination-lifecycle-fence.spec.ts` impide que se separen las llaves de bloqueo del perfil y del cierre, exige el `FOR UPDATE` y mantiene visible este riesgo residual. Las invariantes de base de datos se prueban ademas en `operation-termination-schema.spec.ts` y mediante migracion fresca contra PostgreSQL aislado.
