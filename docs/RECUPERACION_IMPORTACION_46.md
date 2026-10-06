# Imagen de recuperación de importaciones: esquema 46

Esta rama parte de `798f9b13ef1086bd6b85b6d4f1cfaf4bd97a5390` y es una variante de recuperación, no el producto de importación masiva. Reconoce las migraciones45 y46 sin alterar sus checksums, los marcadores del migrador ni las guardas de identidad/deriva. Las dos tablas nuevas conservan el campo lógico `tenantId` de Prisma y usan `tenant_id` físico obligatorio.

Conserva las funciones anteriores de la aplicación, añade la reserva de archivos referenciados por importaciones pendientes y cuenta Job/RowResult en el inventario de retención. Los endpoints antiguos `/import/:module/*` responden503 con el código `IMPORT_SUSPENDED_FOR_RECOVERY`. No tiene los controladores ni el consumidor `person-import`; tampoco admite una bandera enviada por el cliente para habilitarlos.

La salud de esta variante comprueba API, catálogo e integridad de archivos. **No demuestra que los trabajos de importación estén avanzando.** Durante la recuperación, conservar PostgreSQL, Redis y los archivos privados. Registrar e informar los trabajos pendientes por organización; no volver a subir el archivo ni borrar jobs, filas o colas para liberar recursos. Volver a una versión corregida de importación permite usar sus puntos de avance y reintentos normales.

Los soportes de un FAILED recuperable anterior a la lectura del CSV pueden quedar reservados hasta resolver el trabajo. No hay una operación de cancelar/expirar esos jobs. La purga de retención sigue sin estar habilitada. La imagen es un recurso temporal de continuidad del servicio, no una solución permanente a esos límites.

Antes de utilizarla se exige un ensayo aislado de A44→B46→esta variante46→B46: migrador y arranque reales, dos organizaciones, progreso parcial conservado, soportes y hashes intactos, reanudación sin duplicados y suspensión explícita de la importación. Conservar el resultado del ensayo junto al digest de la imagen. Compilar o pasar pruebas unitarias no sustituye ese ensayo. Si la migración quedó incompleta, conservar la evidencia y resolver mediante un procedimiento revisado; nunca reescribir `_prisma_migrations` ni ejecutar un downgrade destructivo.

Esta imagen requiere su propio commit/digest y `APP_REVISION`. No reemplaza ni retaggea el artefacto A original. Un respaldo/restauración de44 después de aceptar nuevas escrituras no constituye un rollback sin pérdida y necesita conciliación adicional.
