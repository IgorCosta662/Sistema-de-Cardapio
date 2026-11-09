@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

title MESA VIVA - Importar e Iniciar no Docker

echo ============================================================================
echo   MESA VIVA - IMPORTACAO E INICIALIZACAO AUTOMATICA NO DOCKER
echo ============================================================================
echo.

cd /d "%~dp0"
if exist "package.json" goto FOUND_ROOT
if exist "..\..\package.json" cd /d "%~dp0..\.."
:FOUND_ROOT

if not exist "package.json" (
    echo [ERRO] Coloque este arquivo iniciar-docker.bat na pasta raiz do projeto, junto ao package.json.
    pause
    exit /b 1
)

echo [1/4] Preparando arquivos Dockerfile e docker-compose.yml na raiz...

> ".dockerignore" echo node_modules
>> ".dockerignore" echo dist
>> ".dockerignore" echo build
>> ".dockerignore" echo .git
>> ".dockerignore" echo .env
>> ".dockerignore" echo *.log

> "Dockerfile" echo FROM node:22-alpine
>> "Dockerfile" echo WORKDIR /app
>> "Dockerfile" echo COPY package*.json ./
>> "Dockerfile" echo RUN npm install
>> "Dockerfile" echo COPY . .
>> "Dockerfile" echo EXPOSE 3000 3001
>> "Dockerfile" echo CMD ["sh", "-c", "npx drizzle-kit push --config=src/db/drizzle.config.ts && npm run dev"]

> "docker-compose.yml" echo services:
>> "docker-compose.yml" echo   postgres:
>> "docker-compose.yml" echo     image: postgres:16-alpine
>> "docker-compose.yml" echo     container_name: mesaviva-postgres
>> "docker-compose.yml" echo     restart: always
>> "docker-compose.yml" echo     environment:
>> "docker-compose.yml" echo       POSTGRES_DB: mesaviva_db
>> "docker-compose.yml" echo       POSTGRES_USER: mesaviva_admin
>> "docker-compose.yml" echo       POSTGRES_PASSWORD: mesaviva_local_2026
>> "docker-compose.yml" echo     ports:
>> "docker-compose.yml" echo       - "5432:5432"
>> "docker-compose.yml" echo     volumes:
>> "docker-compose.yml" echo       - pgdata:/var/lib/postgresql/data
>> "docker-compose.yml" echo     healthcheck:
>> "docker-compose.yml" echo       test: ["CMD-SHELL", "pg_isready -U mesaviva_admin -d mesaviva_db"]
>> "docker-compose.yml" echo       interval: 5s
>> "docker-compose.yml" echo       timeout: 5s
>> "docker-compose.yml" echo       retries: 5
>> "docker-compose.yml" echo   local-edge-server:
>> "docker-compose.yml" echo     build:
>> "docker-compose.yml" echo       context: .
>> "docker-compose.yml" echo       dockerfile: Dockerfile
>> "docker-compose.yml" echo     container_name: mesaviva-edge-node
>> "docker-compose.yml" echo     restart: always
>> "docker-compose.yml" echo     ports:
>> "docker-compose.yml" echo       - "3000:3000"
>> "docker-compose.yml" echo       - "3001:3001"
>> "docker-compose.yml" echo     environment:
>> "docker-compose.yml" echo       NODE_ENV: development
>> "docker-compose.yml" echo       CLIENT_PORT: "3000"
>> "docker-compose.yml" echo       STAFF_PORT: "3001"
>> "docker-compose.yml" echo       STRICT_PORT_SEPARATION: "true"
>> "docker-compose.yml" echo       SQL_HOST: postgres
>> "docker-compose.yml" echo       SQL_PORT: "5432"
>> "docker-compose.yml" echo       SQL_DB_NAME: mesaviva_db
>> "docker-compose.yml" echo       SQL_USER: mesaviva_admin
>> "docker-compose.yml" echo       SQL_PASSWORD: mesaviva_local_2026
>> "docker-compose.yml" echo       SQL_ADMIN_USER: mesaviva_admin
>> "docker-compose.yml" echo       SQL_ADMIN_PASSWORD: mesaviva_local_2026
>> "docker-compose.yml" echo     depends_on:
>> "docker-compose.yml" echo       postgres:
>> "docker-compose.yml" echo         condition: service_healthy
>> "docker-compose.yml" echo volumes:
>> "docker-compose.yml" echo   pgdata:

echo [2/4] Verificando se o Docker Desktop esta em execucao...
docker info >nul 2>&1
if %ERRORLEVEL% EQU 0 goto DOCKER_OK

echo [AVISO] Iniciando o Docker Desktop automaticamente...
if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"

:WAIT_DOCKER
echo Aguardando o Docker Desktop responder...
timeout /t 5 /nobreak >nul
docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 goto WAIT_DOCKER

:DOCKER_OK
set "LOCAL_IP=localhost"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R /C:"IPv4"') do (
    set "TEMP_IP=%%a"
    set "TEMP_IP=!TEMP_IP: =!"
    echo !TEMP_IP! | findstr /B "127. 169.254." >nul
    if !ERRORLEVEL! NEQ 0 set "LOCAL_IP=!TEMP_IP!"
)

set "CLIENT_URL=http://!LOCAL_IP!:3000"
set "STAFF_URL=http://!LOCAL_IP!:3001"
set "APP_URL=!CLIENT_URL!"

echo [3/4] Construindo e subindo containers no Docker nas portas 3000 e 3001...
docker compose -f docker-compose.yml up -d --build
if %ERRORLEVEL% NEQ 0 goto DOCKER_ERROR

echo.
echo [4/4] Containers iniciados com sucesso!
echo ============================================================================
echo   PORTA EXCLUSIVA DO CLIENTE [Cardapio] : !CLIENT_URL!
echo   PORTA EXCLUSIVA DA EQUIPE  [Garcom]   : !STAFF_URL!
echo ----------------------------------------------------------------------------
echo   Credenciais Demo Cliente : Codigo MESA01  /  Senha: 123456
echo   PINs da Equipe           : Garcom 1111 / Cozinha 2222 / Caixa 3333 / Admin 4444
echo ============================================================================
echo.

timeout /t 4 /nobreak >nul
start "" "!STAFF_URL!"
pause
exit /b 0

:DOCKER_ERROR
echo.
echo [ERRO] Falha ao construir ou iniciar os containers no Docker.
pause
exit /b 1
