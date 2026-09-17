# Evidencia de infraestructura Dokploy — 9 de septiembre de 2026

## Alcance y método

Inspección autenticada y exclusivamente de lectura en el panel Dokploy que el
operador ya tenía abierto. No se mostraron ni copiaron valores de variables de
entorno, credenciales, llaves, cookies, tokens ni datos de la aplicación. No se
desplegó, reinició, detuvo o reconfiguró ningún servicio.

Esta evidencia es una fotografía puntual; no reemplaza métricas históricas,
alertas ni un análisis de causa raíz del incidente que afectó varios sitios.

## Resultado observado

| Control | Estado observado | Riesgo operativo |
| --- | --- | --- |
| Versión en producción | Último despliegue exitoso visible: commit `0931bf9be8399af6f857eea60a7318762d6fc849`, distinto del candidato local | El código nuevo todavía no está probado en producción. |
| Réplicas | Una réplica de la aplicación | Una falla de proceso o nodo interrumpe todo el servicio. |
| Construcción | Sin servidor de build ni registry dedicados; autodeploy y limpieza de caché activos | La compilación comparte CPU, RAM y disco con las demás aplicaciones de la VPS. |
| Límites de la aplicación | Campos de límite y reserva de CPU/RAM vacíos | Un proceso o build fuera de control puede competir con todos los servicios del host. |
| Host compartido | Aproximadamente treinta contenedores visibles, con varias aplicaciones, PostgreSQL y Redis | El radio de impacto es mayor que una sola página. |
| Uso puntual del host | 7,06 GiB de 15,62 GiB de RAM; 24,39 % de CPU; 46,28 GB de 192,69 GB de disco | Hay capacidad en el instante observado, pero no demuestra margen durante builds, picos o fallos. |
| Uso puntual de la aplicación | Aproximadamente 173 MiB de RAM y CPU ociosa | El runtime normal es moderado; el principal riesgo sigue siendo la ausencia de límites y el build compartido. |
| Persistencia | PostgreSQL y Storage usan volúmenes persistentes dentro del compose compartido | Persistencia local no equivale a respaldo recuperable. |
| Backup de base | Ningún destino de backup configurado | No hay copia externa demostrada antes de aplicar migraciones. |
| Backup de volúmenes | Ningún backup de volúmenes configurado para la aplicación ni para el compose compartido | La pérdida/corrupción del host puede afectar base y evidencias. |
| Tareas programadas | Ninguna tarea global programada | No se observó automatización alternativa de respaldo o verificación. |

## Decisión de seguridad

Las migraciones nuevas no deben ejecutarse sobre esta base hasta que exista una
copia externa cifrada y se demuestre su restauración en una PostgreSQL
desechable. Un dump guardado únicamente en la misma VPS no cierra el riesgo de
pérdida del nodo.

Antes del corte también se requiere:

1. identificar el propietario, periodicidad, retención, cifrado y destino del
   backup;
2. registrar RPO y RTO aceptados;
3. restaurar la copia y ejecutar el guard de migraciones y las pruebas de
   integración sobre ella;
4. fijar límites y reservas de CPU/RAM/PID por servicio, empezando con valores
   medidos en staging;
5. desacoplar el build de producción o, como mínimo, realizarlo en una ventana
   vigilada con las otras aplicaciones verificadas antes y después;
6. configurar alertas de salud, RAM, CPU, disco, reinicios y fallos de backup;
7. conservar un procedimiento de recuperación que no dependa del mismo nodo.

## Información deliberadamente excluida

No se documentan identificadores internos del panel, direcciones de webhook,
correos administrativos, nombres de variables ni contenido del compose que
pudiera facilitar acceso. Esos datos no son necesarios para demostrar los
hallazgos anteriores.
