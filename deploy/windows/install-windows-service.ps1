# ==============================================================================
# MESA VIVA — INSTALADOR DO SERVIÇO OPERACIONAL LOCAL WINDOWS (Edge Server)
# Registra o servidor local para operação contínua via Wi-Fi no estabelecimento
# ==============================================================================

param (
    [string]$ServiceName = "MesaVivaLocalEdgeServer",
    [string]$InstallPath = "C:\MesaViva\Server"
)

Write-Host "Configurando Serviço Operacional Local Mesa Viva..." -ForegroundColor Cyan

if (-not (Test-Path $InstallPath)) {
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
}

# Registra o serviço do Windows com reinício automático em caso de falha elétrica/processo
sc.exe create $ServiceName binPath= "`"$InstallPath\MesaViva.Api.exe`" --urls=https://0.0.0.0:3000" start= auto DisplayName= "Mesa Viva - Servidor Operacional Local (Wi-Fi & Sync)"
sc.exe description $ServiceName "Servidor local de atendimento de mesas, KDS cozinha, caixa e fila de sincronizacao resiliente com a nuvem."
sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/5000/restart/5000

Write-Host "Serviço $ServiceName registrado com sucesso e configurado para inicialização automática." -ForegroundColor Green
