# PowerShell Load Test Runner
# Usage: powershell -ExecutionPolicy Bypass -File tests\load\run-load-tests.ps1

# Check if config.json exists
if (-not (Test-Path "tests\load\config.json")) {
    Write-Host "ERROR: config.json not found" -ForegroundColor Red
    Write-Host "Please create tests\load\config.json from your setup.js output"
    Write-Host ""
    Write-Host "Example format:"
    Write-Host '{
  "testUser": {
    "email": "loadtest-xxxxx@example.com",
    "accessToken": "eyJhbGci...",
    "workspaceId": "00000000-0000-0000-0000-000000000000"
  }
}'
    exit 1
}

# Load and parse config.json
try {
    $config = Get-Content "tests\load\config.json" -Raw | ConvertFrom-Json
    
    # Set environment variables
    $env:K6_TEST_ACCESS_TOKEN = $config.testUser.accessToken
    $env:K6_TEST_WORKSPACE_ID = $config.testUser.workspaceId
    $env:SUPABASE_URL = "https://lbunafpxuskwmsrraqxl.supabase.co"
    $env:SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxidW5hZnB4dXNrd21zcnJhcXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMjA3NzUsImV4cCI6MjA3NTY5Njc3NX0.gRvY8kUzrELzlhSdGNJj_CXsaT8mqaUO7F1jCEi2T7Y"
    
    # Set load level (default: light)
    if (-not $env:K6_LOAD_LEVEL) {
        $env:K6_LOAD_LEVEL = "light"
    }
    
    Write-Host ""
    Write-Host "=== Running Load Tests (Load Level: $($env:K6_LOAD_LEVEL)) ===" -ForegroundColor Cyan
    Write-Host "Access Token: $($env:K6_TEST_ACCESS_TOKEN.Substring(0, [Math]::Min(20, $env:K6_TEST_ACCESS_TOKEN.Length)))..."
    Write-Host "Workspace ID: $($env:K6_TEST_WORKSPACE_ID)" -ForegroundColor Green
    Write-Host ""
    
    # Create results directory
    if (-not (Test-Path "tests\load\results")) {
        New-Item -ItemType Directory -Path "tests\load\results" | Out-Null
    }
    
    # Run tests
    Write-Host "[1/4] Running auth-token test..." -ForegroundColor Yellow
    k6 run tests/load/auth-token.js
    
    Write-Host ""
    Write-Host "[2/4] Running planner-list test..." -ForegroundColor Yellow
    k6 run tests/load/planner-list.js
    
    Write-Host ""
    Write-Host "[3/4] Running generate-campaign test..." -ForegroundColor Yellow
    k6 run tests/load/generate-campaign.js
    
    Write-Host ""
    Write-Host "[4/4] Running ai-queue-worker test..." -ForegroundColor Yellow
    k6 run tests/load/ai-queue-worker.js
    
    Write-Host ""
    Write-Host "=== All Tests Complete ===" -ForegroundColor Green
    Write-Host "Check results in tests\load\results\"
    
} catch {
    Write-Host "ERROR: Failed to parse config.json" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
