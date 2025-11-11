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

:parse_config
REM Parse config.json and set environment variables
REM Temporarily disable delayed expansion for password parsing
setlocal disabledelayedexpansion

for /f "tokens=2 delims=:," %%a in ('type tests\load\config.json ^| findstr "accessToken"') do (
    set ACCESS_TOKEN=%%~a
)

for /f "tokens=2 delims=:," %%a in ('type tests\load\config.json ^| findstr "testWorkspaceId"') do (
    set WORKSPACE_ID=%%~a
)

for /f "tokens=2 delims=:," %%a in ('type tests\load\config.json ^| findstr "\"email\""') do (
    set USER_EMAIL=%%~a
)

for /f "tokens=2 delims=:," %%a in ('type tests\load\config.json ^| findstr "\"password\""') do (
    set USER_PASSWORD=%%~a
)

REM Re-enable delayed expansion for the rest of the script
endlocal & (
    set "ACCESS_TOKEN=%ACCESS_TOKEN%"
    set "WORKSPACE_ID=%WORKSPACE_ID%"
    set "USER_EMAIL=%USER_EMAIL%"
    set "USER_PASSWORD=%USER_PASSWORD%"
)
setlocal enabledelayedexpansion

REM Trim quotes and spaces
set ACCESS_TOKEN=%ACCESS_TOKEN:"=%
set ACCESS_TOKEN=%ACCESS_TOKEN: =%
set WORKSPACE_ID=%WORKSPACE_ID:"=%
set WORKSPACE_ID=%WORKSPACE_ID: =%
set USER_EMAIL=%USER_EMAIL:"=%
set USER_EMAIL=%USER_EMAIL: =%
set USER_PASSWORD=%USER_PASSWORD:"=%
set USER_PASSWORD=%USER_PASSWORD: =%

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

set K6_TEST_ACCESS_TOKEN=%ACCESS_TOKEN%
set K6_TEST_WORKSPACE_ID=%WORKSPACE_ID%
set K6_TEST_USER_EMAIL=%USER_EMAIL%
set K6_TEST_USER_PASSWORD=%USER_PASSWORD%

REM Check if access token is valid (not placeholder)
if "%ACCESS_TOKEN%"=="will-be-generated-on-first-login" (
    echo.
    echo === Generating Access Token ===
    echo Running setup script to generate access token...
    node tests\load\setup-token.js
    if errorlevel 1 (
        echo.
        echo Failed to generate access token!
        pause
        exit /b 1
    )
    echo.
    echo Re-reading config.json...
    goto :parse_config
)

echo.
echo === K6 Environment Variables ===
echo User Email: %K6_TEST_USER_EMAIL%
echo Password Length: [HIDDEN]
echo Workspace ID: %K6_TEST_WORKSPACE_ID%
echo Access Token: %K6_TEST_ACCESS_TOKEN:~0,20%...
echo.
echo === Running Load Tests (Load Level: %K6_LOAD_LEVEL%) ===

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
