@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

title MESA VIVA - Iniciar Direto em Rede Local [Porta Cliente 3000 / Porta Equipe 3001]

cd /d "%~dp0"
if exist "package.json" goto FOUND_ROOT
if exist "..\..\package.json" cd /d "%~dp0..\.."
:FOUND_ROOT

if not exist "package.json" (
    echo [ERRO] Coloque este arquivo iniciar-rede-local.bat na pasta raiz do projeto junto ao package.json.
    pause
    exit /b 1
)

if exist "run-network.bat" (
    call "%~dp0run-network.bat" 3000 3001
    exit /b 0
)

set "CLIENT_PORT=3000"
set "STAFF_PORT=3001"
set "STRICT_PORT_SEPARATION=true"

set "LOCAL_IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R /C:"IPv4"') do (
    set "CANDIDATE=%%a"
    set "CANDIDATE=!CANDIDATE: =!"
    echo !CANDIDATE! | findstr /B "127. 169.254." >nul
    if !ERRORLEVEL! NEQ 0 if "!LOCAL_IP!"=="" set "LOCAL_IP=!CANDIDATE!"
)
if "!LOCAL_IP!"=="" set "LOCAL_IP=localhost"

set "CLIENT_URL=http://!LOCAL_IP!:3000"
set "STAFF_URL=http://!LOCAL_IP!:3001"
set "APP_URL=!CLIENT_URL!"

echo [DEPENDENCIAS] Verificando pacotes necessarios...
call npm install @electric-sql/pglite qrcode tsx --no-audit --no-fund

node -e "import('qrcode').then(q=>q.default.toString(process.argv[1],{type:'terminal',small:true})).then(s=>{console.log('\n=== QR CODE DO CLIENTE [WI-FI] ===\n'+s+'\nURL Exclusiva CLIENTE : '+process.argv[1]+'\nURL Exclusiva EQUIPE  : '+process.argv[2]+'\n')}).catch(()=>{})" "!CLIENT_URL!" "!STAFF_URL!"

echo ============================================================================
echo   MESA VIVA ATIVO NA REDE WI-FI LOCAL
echo   Porta Exclusiva do Cliente : !CLIENT_URL!
echo   Porta Exclusiva da Equipe  : !STAFF_URL!
echo ============================================================================
start "" "!STAFF_URL!"
call npx tsx server.ts
pause
