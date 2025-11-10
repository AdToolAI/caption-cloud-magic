@echo off
setlocal enabledelayedexpansion

REM Check if config.json exists
if not exist tests\load\config.json (
    echo ERROR: config.json not found
    echo Please create tests\load\config.json from your setup.js output
    echo.
    echo Example format:
    echo {
    echo   "testUser": {
    echo     "email": "loadtest-xxxxx@example.com",
    echo     "accessToken": "eyJhbGci...",
    echo     "workspaceId": "00000000-0000-0000-0000-000000000000"
    echo   }
    echo }
    exit /b 1
)

REM Parse config.json and set environment variables
for /f "tokens=2 delims=:," %%a in ('type tests\load\config.json ^| findstr "accessToken"') do (
    set ACCESS_TOKEN=%%~a
    set ACCESS_TOKEN=!ACCESS_TOKEN:~1,-1!
)

for /f "tokens=2 delims=:," %%a in ('type tests\load\config.json ^| findstr "testWorkspaceId"') do (
    set WORKSPACE_ID=%%~a
    set WORKSPACE_ID=!WORKSPACE_ID:~1,-1!
)

for /f "tokens=2 delims=:," %%a in ('type tests\load\config.json ^| findstr "\"email\""') do (
    set USER_EMAIL=%%~a
    set USER_EMAIL=!USER_EMAIL:~1,-1!
)

for /f "tokens=2 delims=:," %%a in ('type tests\load\config.json ^| findstr "\"password\""') do (
    set USER_PASSWORD=%%~a
    set USER_PASSWORD=!USER_PASSWORD:~1,-1!
)

REM Set load level (force light for testing)
set K6_LOAD_LEVEL=light
echo Load Level: %K6_LOAD_LEVEL%
echo Expected VUs: 2-10 for light profile
echo.

REM Set Supabase credentials
set SUPABASE_URL=https://lbunafpxuskwmsrraqxl.supabase.co
set SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxidW5hZnB4dXNrd21zcnJhcXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMjA3NzUsImV4cCI6MjA3NTY5Njc3NX0.gRvY8kUzrELzlhSdGNJj_CXsaT8mqaUO7F1jCEi2T7Y

REM Validate required values
if "!ACCESS_TOKEN!"=="" (
    echo ERROR: Could not read accessToken from config.json
    exit /b 1
)
if "!WORKSPACE_ID!"=="" (
    echo ERROR: Could not read workspaceId from config.json
    exit /b 1
)
if "!USER_EMAIL!"=="" (
    echo ERROR: Could not read email from config.json
    exit /b 1
)
if "!USER_PASSWORD!"=="" (
    echo ERROR: Could not read password from config.json
    exit /b 1
)

set K6_TEST_ACCESS_TOKEN=!ACCESS_TOKEN!
set K6_TEST_WORKSPACE_ID=!WORKSPACE_ID!
set K6_TEST_USER_EMAIL=!USER_EMAIL!
set K6_TEST_USER_PASSWORD=!USER_PASSWORD!

echo.
echo === Running Load Tests (Load Level: %K6_LOAD_LEVEL%) ===
echo Access Token: !ACCESS_TOKEN:~0,20!...
echo Workspace ID: !WORKSPACE_ID!
echo User Email: !USER_EMAIL!
echo User Password: ***
echo.

REM Create results directory
if not exist tests\load\results mkdir tests\load\results

REM Run tests
echo [1/4] Running auth-token test...
k6 run tests/load/auth-token.js

echo.
echo [2/4] Running planner-list test...
k6 run tests/load/planner-list.js

echo.
echo [3/4] Running generate-campaign test...
k6 run tests/load/generate-campaign.js

echo.
echo [4/4] Running ai-queue-worker test...
k6 run tests/load/ai-queue-worker.js

echo.
echo === All Tests Complete ===
echo Check results in tests\load\results\
