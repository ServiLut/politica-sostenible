# ═══════════════════════════════════════════════════════════════
# SEED DE LÍDERES TERRITORIALES - Política Sostenible
# ═══════════════════════════════════════════════════════════════
#
# USO: Ejecutar desde PowerShell
#   .\seed-leaders.ps1 -Email "tu@email.com" -Password "tucontraseña"
#
# ═══════════════════════════════════════════════════════════════

param(
    [Parameter(Mandatory=$true)]
    [string]$Email,
    [Parameter(Mandatory=$true)]
    [string]$Password
)

$BASE = "https://politica-sostenible.abogadosencolombiasas.com/api"

# ─── LOGIN ───
Write-Host "`n🔐 Iniciando sesión como $Email..." -ForegroundColor Cyan
try {
    $loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
    $loginResp = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
    $token = $loginResp.data.accessToken
    if (-not $token) { $token = $loginResp.accessToken }
    if (-not $token) { throw "No se recibió token" }
    Write-Host "✅ Autenticación exitosa" -ForegroundColor Green
} catch {
    Write-Host "❌ Error de autenticación: $_" -ForegroundColor Red
    exit 1
}

$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

function Find-Division($type, $name) {
    $uri = "$BASE/campaigns/divisions?type=$type&search=$([uri]::EscapeDataString($name))&page=1&limit=5"
    $resp = Invoke-RestMethod -Uri $uri -Headers $headers
    $items = if ($resp.data) { $resp.data.items } else { $resp.items }
    $found = $items | Where-Object { $_.name -eq $name } | Select-Object -First 1
    if (-not $found) { $found = $items | Select-Object -First 1 }
    return $found
}

function Create-Leader($divisionId, $leader) {
    try {
        $body = $leader | ConvertTo-Json
        Invoke-RestMethod -Uri "$BASE/campaigns/divisions/$divisionId/leaders" -Method POST -Headers $headers -Body $body | Out-Null
        Write-Host "  ✅ $($leader.name) — $($leader.roleDescription)" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "  ⚠️ $($leader.name): $($_.Exception.Message)" -ForegroundColor Yellow
        return $false
    }
}

# ─── DATOS DE LÍDERES ───
$leaders = @{
    "MEDELLÍN" = @(
        @{ name="Jhon Jairo Ramírez Monsalve"; roleDescription="Edil JAL Comuna 1 - Popular"; phone="3001234567"; politicalAffinity="Independiente"; observations="Periodo 2024-2027" }
        @{ name="Diana Carolina Areiza López"; roleDescription="Edil JAL Comuna 2 - Santa Cruz"; phone="3012345678"; politicalAffinity="Pacto Histórico"; observations="Periodo 2024-2027" }
        @{ name="Carlos Andrés Montoya Gil"; roleDescription="Edil JAL Comuna 3 - Manrique"; phone="3023456789"; politicalAffinity="Colombia Humana"; observations="Periodo 2024-2027" }
        @{ name="Sandra Milena Zapata Durán"; roleDescription="Edil JAL Comuna 4 - Aranjuez"; phone="3034567890"; politicalAffinity="Alianza Verde"; observations="Periodo 2024-2027" }
        @{ name="Luis Fernando Gómez Restrepo"; roleDescription="Edil JAL Comuna 5 - Castilla"; phone="3045678901"; politicalAffinity="Partido Liberal"; observations="Periodo 2024-2027" }
        @{ name="María Eugenia Ríos Botero"; roleDescription="Edil JAL Comuna 6 - 12 de Octubre"; phone="3056789012"; politicalAffinity="Centro Democrático"; observations="Periodo 2024-2027" }
        @{ name="Julián Esteban Correa Henao"; roleDescription="Edil JAL Comuna 7 - Robledo"; phone="3067890123"; politicalAffinity="Partido de la U"; observations="Periodo 2024-2027" }
        @{ name="Alejandra Tobón Salazar"; roleDescription="Edil JAL Comuna 8 - Villa Hermosa"; phone="3078901234"; politicalAffinity="Independiente"; observations="Periodo 2024-2027" }
        @{ name="Fabio Andrés Múnera Cano"; roleDescription="Edil JAL Comuna 9 - Buenos Aires"; phone="3089012345"; politicalAffinity="Polo Democrático"; observations="Periodo 2024-2027" }
        @{ name="Natalia Giraldo Ospina"; roleDescription="Edil JAL Comuna 10 - La Candelaria"; phone="3090123456"; politicalAffinity="Alianza Verde"; observations="Periodo 2024-2027" }
        @{ name="Jorge Iván Cárdenas Mesa"; roleDescription="Edil JAL Comuna 11 - Laureles-Estadio"; phone="3101234567"; politicalAffinity="Partido Conservador"; observations="Periodo 2024-2027" }
        @{ name="Adriana María López Ruiz"; roleDescription="Edil JAL Comuna 13 - San Javier"; phone="3112345678"; politicalAffinity="Independiente"; observations="Periodo 2024-2027. Trabajo con víctimas del conflicto." }
        @{ name="Gustavo Adolfo Palacio Vélez"; roleDescription="Presidente JAC Barrio Santo Domingo"; phone="3123456789"; politicalAffinity="Comunitario"; observations="JAC con 200 familias afiliadas." }
        @{ name="Paola Andrea Castaño Rivera"; roleDescription="Coordinadora territorial zona nororiental"; phone="3134567890"; email="paola.castano@politica-sostenible.co"; politicalAffinity="Independiente"; observations="Coordinadora de 4 comunas." }
        @{ name="Héctor Fabio Valencia Ossa"; roleDescription="Testigo electoral puesto U. de Medellín"; phone="3145678901"; politicalAffinity="Independiente"; observations="Testigo certificado." }
    )
    "BOGOTÁ, D.C." = @(
        @{ name="Andrea Carolina Suárez Pinzón"; roleDescription="Edil JAL Localidad 1 - Usaquén"; phone="3201234567"; politicalAffinity="Alianza Verde"; observations="Periodo 2024-2027" }
        @{ name="Camilo Andrés Herrera Díaz"; roleDescription="Edil JAL Localidad 2 - Chapinero"; phone="3212345678"; politicalAffinity="Pacto Histórico"; observations="Periodo 2024-2027" }
        @{ name="Martha Lucía Romero Vega"; roleDescription="Edil JAL Localidad 3 - Santa Fe"; phone="3223456789"; politicalAffinity="Colombia Humana"; observations="Periodo 2024-2027" }
        @{ name="Roberto Carlos Mendoza Fajardo"; roleDescription="Edil JAL Localidad 4 - San Cristóbal"; phone="3234567890"; politicalAffinity="Partido Liberal"; observations="Periodo 2024-2027" }
        @{ name="Francisco Javier Torres León"; roleDescription="Edil JAL Localidad 7 - Bosa"; phone="3256789012"; politicalAffinity="Pacto Histórico"; observations="Periodo 2024-2027" }
        @{ name="Yulieth Marcela Parra Gómez"; roleDescription="Edil JAL Localidad 8 - Kennedy"; phone="3267890123"; politicalAffinity="Partido de la U"; observations="Periodo 2024-2027" }
        @{ name="Patricia Elena Vargas Morales"; roleDescription="Coordinadora territorial zona sur"; phone="3289012345"; email="patricia.vargas@politica-sostenible.co"; politicalAffinity="Independiente"; observations="Coordina Usme, Ciudad Bolívar y San Cristóbal." }
    )
    "CALI" = @(
        @{ name="María Fernanda Caicedo Lozano"; roleDescription="Edil JAL Comuna 3 - San Nicolás"; phone="3151234567"; politicalAffinity="Independiente"; observations="Periodo 2024-2027" }
        @{ name="Carlos Alberto Mosquera Riascos"; roleDescription="Edil JAL Comuna 13 - Centro"; phone="3162345678"; politicalAffinity="Pacto Histórico"; observations="Periodo 2024-2027" }
        @{ name="Yessica Paola Hurtado Mina"; roleDescription="Edil JAL Comuna 21 - Agua Blanca"; phone="3173456789"; politicalAffinity="Partido Liberal"; observations="Periodo 2024-2027" }
        @{ name="Andrés Felipe Girón Bedoya"; roleDescription="Coordinador territorial zona oriente"; phone="3184567890"; email="andres.giron@politica-sostenible.co"; politicalAffinity="Independiente"; observations="Coordina comunas 13 a 21." }
    )
    "BARRANQUILLA" = @(
        @{ name="Luis Carlos Acosta Solano"; roleDescription="Edil JAL Localidad Suroccidente"; phone="3001112233"; politicalAffinity="Partido de la U"; observations="Periodo 2024-2027" }
        @{ name="Jairo Enrique De la Hoz Pertuz"; roleDescription="Coordinador territorial Atlántico"; phone="3021334455"; email="jairo.delahoz@politica-sostenible.co"; politicalAffinity="Independiente"; observations="Coordina toda la operación en Atlántico." }
    )
    "CARTAGENA DE INDIAS" = @(
        @{ name="Dilia Rosa Pérez Paternina"; roleDescription="Edil JAL Localidad 1 - Histórica y del Caribe Norte"; phone="3009876543"; politicalAffinity="Independiente"; observations="Periodo 2024-2027" }
        @{ name="Ana Milena Herrera Padilla"; roleDescription="Coordinadora territorial Bolívar"; phone="3027654321"; email="ana.herrera@politica-sostenible.co"; politicalAffinity="Independiente"; observations="Coordina Cartagena, Turbaco y Magangué." }
    )
    "BUCARAMANGA" = @(
        @{ name="Sergio Andrés Pinto Gómez"; roleDescription="Edil JAL Comuna 1 - Norte"; phone="3006543210"; politicalAffinity="Alianza Verde"; observations="Periodo 2024-2027" }
        @{ name="Laura Cristina Mantilla Ordóñez"; roleDescription="Coordinadora territorial Santander"; phone="3015432109"; email="laura.mantilla@politica-sostenible.co"; politicalAffinity="Independiente"; observations="Coordina área metropolitana." }
    )
    "PEREIRA" = @(
        @{ name="Mauricio Alejandro Trejos López"; roleDescription="Edil JAL Comuna Universidad"; phone="3004321098"; politicalAffinity="Partido Conservador"; observations="Periodo 2024-2027" }
        @{ name="Angela María Ríos Osorio"; roleDescription="Coordinadora territorial Eje Cafetero"; phone="3013210987"; email="angela.rios@politica-sostenible.co"; politicalAffinity="Independiente"; observations="Coordina Pereira, Dosquebradas." }
    )
    "MANIZALES" = @(
        @{ name="Diego Fernando Cardona Betancur"; roleDescription="Edil JAL Comuna Cumanday"; phone="3002109876"; politicalAffinity="Alianza Verde"; observations="Periodo 2024-2027" }
    )
    "IBAGUÉ" = @(
        @{ name="Wilson Enrique Lozano Díaz"; roleDescription="Edil JAL Comuna 1"; phone="3001098765"; politicalAffinity="Partido Liberal"; observations="Periodo 2024-2027" }
    )
    "CÚCUTA" = @(
        @{ name="María José Contreras Suárez"; roleDescription="Coordinadora territorial Norte de Santander"; phone="3000987654"; email="mariajose.contreras@politica-sostenible.co"; politicalAffinity="Independiente"; observations="Zona fronteriza." }
    )
    "VILLAVICENCIO" = @(
        @{ name="Camilo Hernández Rojas"; roleDescription="Coordinador territorial Llanos Orientales"; phone="3000876543"; email="camilo.hernandez@politica-sostenible.co"; politicalAffinity="Independiente"; observations="Coordina Meta, Casanare y Arauca." }
    )
    "PASTO" = @(
        @{ name="Ingrid Lorena Melo Bastidas"; roleDescription="Coordinadora territorial Nariño"; phone="3000765432"; email="ingrid.melo@politica-sostenible.co"; politicalAffinity="Independiente"; observations="Coordina Pasto, Ipiales y Tumaco." }
    )
}

# ─── EJECUTAR ───
Write-Host "`n🌱 Creando líderes territoriales...`n" -ForegroundColor Cyan
$totalCreated = 0
$totalFailed = 0

foreach ($city in $leaders.Keys) {
    Write-Host "📍 Buscando $city..." -ForegroundColor White
    $division = Find-Division "MUNICIPIO" $city
    if (-not $division) {
        Write-Host "  ⚠️ No se encontró $city, saltando" -ForegroundColor Yellow
        continue
    }
    Write-Host "  Encontrado: $($division.name) ($($division.code)) — ID: $($division.id)" -ForegroundColor Gray
    
    foreach ($leader in $leaders[$city]) {
        $success = Create-Leader $division.id $leader
        if ($success) { $totalCreated++ } else { $totalFailed++ }
        Start-Sleep -Milliseconds 200
    }
}

Write-Host "`n═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ SEED COMPLETADO" -ForegroundColor Green
Write-Host "   Creados: $totalCreated" -ForegroundColor White
Write-Host "   Fallidos: $totalFailed" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "`n🔄 Refresca la página para ver los líderes.`n"
