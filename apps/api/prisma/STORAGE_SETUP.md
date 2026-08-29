# Configuración de Supabase Storage

Este proyecto usa Supabase exclusivamente como almacenamiento de objetos. No
ejecutes SQL sobre la base interna de Supabase ni habilites Supabase Auth.

1. Crea desde la administración de Storage un bucket **privado** cuyo nombre
   coincida con `SUPABASE_STORAGE_BUCKET`.
2. Conserva `SUPABASE_SERVICE_ROLE_KEY` únicamente en NestJS. Nunca la expongas
   como variable `NEXT_PUBLIC_*`.
3. El navegador solicita a NestJS una autorización temporal, sube con la URL
   firmada y confirma el objeto. NestJS persiste la autorización en
   `StoredObject`, vuelve a comprobar usuario/rol activo, MIME y tamaño real, y
   el módulo consumidor la asocia una sola vez dentro de la misma transacción.
   Un evento de auditoría nunca se usa como permiso.
4. Las rutas válidas tienen la forma
   `/{tenantId}/{module}/{uuid-v4}.{ext}` y NestJS verifica pertenencia, MIME,
   tamaño, extensión y módulo antes de confirmar. El nombre original se
   conserva sólo como metadato validado; no forma parte de la ruta canónica.
5. Finanzas y E-14 se leen por ID del recurso. La API valida tenant, rol y
   territorio, registra el acceso y devuelve una URL de lectura por cinco
   minutos; las rutas privadas no forman parte de las vistas de negocio.
6. El servicio limita autorizaciones a 30 por usuario/hora, 300 por
   tenant/hora y 10 GiB contabilizados por tenant. Las autorizaciones sin
   completar expiran a los 15 minutos. Los confirmados sin asociar se reclaman
   tras 24 horas y se limpian de forma oportunista antes de nuevas cargas, con
   una transición atómica para no borrar un objeto que esté siendo asociado.
7. Configura retención y copias para objetos ya asociados según la política de
   la organización; las actas E-14 y evidencias no son públicas.

Antes de liberar, prueba con la credencial anónima que no puede listar, leer,
crear, sobrescribir ni borrar objetos sin una firma emitida por NestJS. Repite
la prueba con una ruta de otro tenant y con una firma expirada. El bucket debe
permanecer privado aun si la aplicación web no está disponible.

Si existió el antiguo bucket `product-images`, audita su contenido y políticas
antes de cerrarlo. No lo reutilices para esta aplicación.
