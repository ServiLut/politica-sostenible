$ErrorActionPreference = 'Stop'
$dbName = 'politica_runtime_final_20260904'
$dbContainer = 'politica-sostenible-ci-postgres-20260904'
$appContainer = 'politica-sostenible-final-runtime-20260904'

docker exec $dbContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $dbName"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la base de runtime desechable.' }

$envLines = docker inspect $dbContainer --format '{{range .Config.Env}}{{println .}}{{end}}'
$passwordLine = $envLines | Where-Object { $_ -like 'POSTGRES_PASSWORD=*' } | Select-Object -First 1
if (-not $passwordLine) { throw 'No se encontro la contrasena local del contenedor.' }
$encodedPassword = [System.Uri]::EscapeDataString($passwordLine.Substring('POSTGRES_PASSWORD='.Length))
$runtimeUrl = "postgresql://postgres:${encodedPassword}@host.docker.internal:55432/${dbName}?sslmode=disable&schema=politica-sostenible"
$env:DIRECT_URL = $runtimeUrl
$env:DATABASE_URL = $runtimeUrl
$env:DEPLOYMENT_PROFILE = 'evaluation'
$env:ALLOW_INSECURE_DATABASE_CONNECTION = 'true'
$env:DATABASE_SSL = 'false'
$env:DATABASE_SSL_REJECT_UNAUTHORIZED = 'false'
$env:JWT_SECRET = 'runtime-jwt-secret-with-more-than-thirty-two-bytes'
$env:CONSENT_IP_SALT = 'runtime-consent-salt-with-more-than-thirty-two-bytes'
$env:CORS_ORIGINS = 'https://politica-eval.invalid'
$env:NEXT_PUBLIC_APP_URL = 'https://politica-eval.invalid'
$env:SUPABASE_URL = 'https://storage-eval.invalid'
$env:SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_runtime_only_not_a_real_key'
$env:SUPABASE_STORAGE_BUCKET = 'politica-runtime'

docker run --detach --name $appContainer -p 3100:3000 --env DIRECT_URL --env DATABASE_URL --env DEPLOYMENT_PROFILE --env ALLOW_INSECURE_DATABASE_CONNECTION --env DATABASE_SSL --env DATABASE_SSL_REJECT_UNAUTHORIZED --env JWT_SECRET --env CONSENT_IP_SALT --env CORS_ORIGINS --env NEXT_PUBLIC_APP_URL --env SUPABASE_URL --env SUPABASE_SERVICE_ROLE_KEY --env SUPABASE_STORAGE_BUCKET politica-sostenible-final-local
if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar la imagen final.' }

$ready = $false
for ($attempt = 1; $attempt -le 60; $attempt++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3100/api/health/ready' -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      $ready = $true
      break
    }
  }
  catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $ready) {
  docker logs $appContainer
  throw 'La imagen no alcanzo el estado ready.'
}

Write-Output 'FINAL_IMAGE_READY'
