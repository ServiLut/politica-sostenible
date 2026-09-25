# RETIRADO: este cargador contenia identidades no verificadas y apuntaba a produccion.
# Evidencia preservada en .artifacts/seed-leaders-pre-auditoria-20260925.txt y Git.
# Mantener este nombre como bloqueo explicito de invocaciones heredadas.
[CmdletBinding()]
param(
    [string]$Email,
    [string]$Password
)

throw 'SEED_HEREDADO_BLOQUEADO: no se permite cargar lideres de ejemplo. Registre personas verificadas mediante la API autenticada. Para pruebas use un entorno demo aislado.'
