# Load Tests with k6

This directory contains load testing scripts for the Politica Sostenible API using [k6](https://k6.io/).

## Prerequisites

1. Install k6:
   - Windows: `winget install k6` or `choco install k6`
   - Mac: `brew install k6`
   - Linux: `sudo apt-get install k6`

2. Ensure the API is running locally or point to the correct environment.

## Running Tests

You can run tests using the provided PowerShell script:

```powershell
./run.ps1
```

Or run them individually:

```bash
k6 run smoke.js
k6 run load.js
k6 run stress.js
k6 run spike.js
```

## Environment Variables

- `BASE_URL`: The base URL of the API (default: http://localhost:4000)
- `ADMIN_EMAIL`: Admin email for authentication (default: admin@test.com)
- `ADMIN_PASSWORD`: Admin password for authentication (default: Test123!)
