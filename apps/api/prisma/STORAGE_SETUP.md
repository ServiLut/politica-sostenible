# Configuración de Supabase Storage

Este proyecto usa Supabase exclusivamente como almacenamiento de objetos. No
ejecutes SQL sobre la base interna de Supabase ni habilites Supabase Auth.

1. Crea desde la administración de Storage un bucket **privado** cuyo nombre
   coincida con `SUPABASE_STORAGE_BUCKET`.
2. Conserva `SUPABASE_SERVICE_ROLE_KEY` únicamente en NestJS. Nunca la expongas
   como variable `NEXT_PUBLIC_*`.
3. El navegador solicita a NestJS una autorización temporal, sube con la URL
   firmada y confirma el objeto. No habilites políticas públicas de lectura,
   escritura o borrado.
4. Las rutas válidas tienen la forma
   `/{tenantId}/{module}/{uuid}-{safeFileName}` y NestJS verifica pertenencia,
   MIME, tamaño y módulo antes de confirmar.
5. Configura retención, copias y auditoría desde el servicio de Storage según la
   política de la organización; las actas E-14 y evidencias no son públicas.

Si existió el antiguo bucket `product-images`, audita su contenido y políticas
antes de cerrarlo. No lo reutilices para esta aplicación.
