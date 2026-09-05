Write-Host "Running k6 Load Tests..."
Write-Host "------------------------"
Write-Host "1) Smoke Test"
Write-Host "2) Load Test"
Write-Host "3) Stress Test"
Write-Host "4) Spike Test"
Write-Host "------------------------"

$choice = Read-Host "Select a test to run (1-4, or 'all')"

switch ($choice) {
    "1" { k6 run load-tests/smoke.js }
    "2" { k6 run load-tests/load.js }
    "3" { k6 run load-tests/stress.js }
    "4" { k6 run load-tests/spike.js }
    "all" {
        k6 run load-tests/smoke.js
        k6 run load-tests/load.js
        k6 run load-tests/stress.js
        k6 run load-tests/spike.js
    }
    default { Write-Host "Invalid choice." }
}
