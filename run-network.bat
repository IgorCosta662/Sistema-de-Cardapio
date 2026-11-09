@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

title MESA VIVA - Rede Wi-Fi com Portas Separadas e QR Code no Terminal

echo ============================================================================
echo   MESA VIVA - REDE LOCAL COM PORTAS SEPARADAS [CLIENTE vs EQUIPE]
echo ============================================================================
echo.

cd /d "%~dp0"
if exist "package.json" goto FOUND_ROOT
if exist "..\..\package.json" cd /d "%~dp0..\.."
:FOUND_ROOT

if not exist "package.json" (
    echo [ERRO] Coloque este arquivo run-network.bat na pasta raiz do projeto junto ao package.json.
    pause
    exit /b 1
)

node -v >nul 2>&1
if %ERRORLEVEL% EQU 0 goto NODE_OK
echo [ERRO] Node.js nao encontrado! Instale o Node.js LTS em https://nodejs.org
pause
exit /b 1

:NODE_OK
set "LOCAL_IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R /C:"IPv4"') do (
    set "CANDIDATE=%%a"
    set "CANDIDATE=!CANDIDATE: =!"
    echo !CANDIDATE! | findstr /B "127. 169.254." >nul
    if !ERRORLEVEL! NEQ 0 if "!LOCAL_IP!"=="" set "LOCAL_IP=!CANDIDATE!"
)
if "!LOCAL_IP!"=="" set "LOCAL_IP=localhost"

echo [REDE] Endereco IPv4 Local detectado: !LOCAL_IP!
echo.

set "CLIENT_PORT=%~1"
set "STAFF_PORT=%~2"

if not "!CLIENT_PORT!"=="" goto CHECK_STAFF_ARG
set /p "CLIENT_PORT=Digite a PORTA EXCLUSIVA DO CLIENTE [Enter para 3000]: "
if "!CLIENT_PORT!"=="" set "CLIENT_PORT=3000"

:CHECK_STAFF_ARG
if not "!STAFF_PORT!"=="" goto PORTS_READY
set /p "STAFF_PORT=Digite a PORTA EXCLUSIVA DA EQUIPE/GARCOM [Enter para 3001]: "
if "!STAFF_PORT!"=="" set "STAFF_PORT=3001"

:PORTS_READY
set "CLIENT_URL=http://!LOCAL_IP!:!CLIENT_PORT!"
set "STAFF_URL=http://!LOCAL_IP!:!STAFF_PORT!"
set "APP_URL=!CLIENT_URL!"
set "STRICT_PORT_SEPARATION=true"

net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 goto SKIP_FIREWALL
echo [FIREWALL] Liberando portas TCP !CLIENT_PORT! e !STAFF_PORT! no Firewall do Windows...
netsh advfirewall firewall delete rule name="Mesa Viva Cliente TCP !CLIENT_PORT!" >nul 2>&1
netsh advfirewall firewall add rule name="Mesa Viva Cliente TCP !CLIENT_PORT!" dir=in action=allow protocol=TCP localport=!CLIENT_PORT! >nul 2>&1
netsh advfirewall firewall delete rule name="Mesa Viva Equipe TCP !STAFF_PORT!" >nul 2>&1
netsh advfirewall firewall add rule name="Mesa Viva Equipe TCP !STAFF_PORT!" dir=in action=allow protocol=TCP localport=!STAFF_PORT! >nul 2>&1

:SKIP_FIREWALL
echo [DEPENDENCIAS] Verificando pacotes do projeto...
call npm install @electric-sql/pglite qrcode tsx --no-audit --no-fund

echo.
if exist "deploy\windows\print-terminal-qr.mjs" goto USE_MJS
node -e "import('qrcode').then(q=>q.default.toString(process.argv[1],{type:'terminal',small:true})).then(s=>{console.log('\n=== QR CODE DO CLIENTE [WI-FI] ===\n'+s+'\nURL Exclusiva CLIENTE : '+process.argv[1]+'\nURL Exclusiva EQUIPE  : '+process.argv[2]+'\n')}).catch(()=>{})" "!CLIENT_URL!" "!STAFF_URL!"
goto START_SERVER

:USE_MJS
node deploy/windows/print-terminal-qr.mjs "!CLIENT_URL!" "!STAFF_URL!"

:START_SERVER
echo [INICIANDO] Servidor ativo em Rede Local!
echo   - Porta Exclusiva do Cliente : !CLIENT_URL!
echo   - Porta Exclusiva da Equipe  : !STAFF_URL!
echo.
start "" "!STAFF_URL!"
call npx tsx server.ts
pause
