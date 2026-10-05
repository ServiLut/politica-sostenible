# Contratos de lectura de administración SaaS

Las rutas conservan `SaasAdminGuard`, la allowlist de identidades inmutables y la comprobación de usuario activo con MFA configurado. No son rutas de administración ordinaria de una organización. El listado global está reservado a ese control de plataforma; las consultas de usuarios y de uso del detalle siempre filtran por la organización seleccionada y validada.

`GET /saas-admin/tenants` acepta `page`, `limit` y `search`. Por defecto devuelve la primera página de 25 organizaciones; admite como máximo 100 por página, página 100000 y búsqueda de 100 caracteres. Busca por nombre o slug sin distinguir mayúsculas. Su resultado de negocio es `{ data, pagination }` en lugar del array ilimitado anterior.

`GET /saas-admin/tenants/:id` acepta los mismos parámetros para la lista de usuarios de esa organización. Busca por nombre o correo y conserva `users` como array con el correo enmascarado. Añade `usersPagination`; no aplica esa búsqueda a los totales de uso, al detalle de la organización ni a la selección de organización. No acepta `tenantId` desde query.

Ambas páginas se ordenan por `createdAt desc, id asc`. Sus metadatos contienen `page`, `limit`, `total` filtrado, `totalPages`, `hasNextPage` y `hasPreviousPage`. Una página fuera de rango devuelve un array vacío con metadatos explícitos. El conteo y la página comparten una transacción PostgreSQL `RepeatableRead`, de forma que son coherentes dentro de cada petición. El orden estable no congela resultados entre peticiones diferentes si se agregan o eliminan registros.

Compatibilidad deliberada: el listado cambia de array a objeto paginado. La búsqueda en el monorepo previa a este cambio no encontró un consumidor web ni otro consumidor interno de estos dos métodos fuera de su controller. Un cliente externo no versionado que utilizara el array deberá adoptar `data` y `pagination`; no se presume su inexistencia. En el detalle se mantienen los demás campos y se explicita la paginación nueva de `users`. Los guards, las rutas de estadísticas y las operaciones de planes, cobros o altas no se modifican.
