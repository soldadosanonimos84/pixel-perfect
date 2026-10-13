# Fábrica de vídeos local — configuração inicial no Windows (PowerShell 5+)
# Uso: powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Need($cmd, $hint) {
  if (Get-Command $cmd -ErrorAction SilentlyContinue) { Write-Host "OK    $cmd" -ForegroundColor Green }
  else { Write-Host "FALTA $cmd -> $hint" -ForegroundColor Yellow }
}

Need node   "winget install OpenJS.NodeJS.LTS   (Node 22.18+ ou 24 LTS)"
Need ollama "winget install Ollama.Ollama"
Need ffmpeg "winget install Gyan.FFmpeg   (reabra o terminal depois)"

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
  Write-Host "Criado .env.local — edite PIPER_EXE e PIPER_VOICE." -ForegroundColor Cyan
}

$piperDir = "tools\piper"
if (-not (Test-Path "$piperDir\piper.exe")) {
  Write-Host "Baixando Piper (Windows amd64)..."
  New-Item -ItemType Directory -Force -Path "tools" | Out-Null
  Invoke-WebRequest "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip" -OutFile "tools\piper.zip"
  Expand-Archive "tools\piper.zip" -DestinationPath "tools" -Force
  Remove-Item "tools\piper.zip"
}
$voiceDir = "$piperDir\voices"
New-Item -ItemType Directory -Force -Path $voiceDir | Out-Null
$base = "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx"
if (-not (Test-Path "$voiceDir\pt_BR-faber-medium.onnx")) {
  Write-Host "Baixando voz pt_BR-faber-medium..."
  Invoke-WebRequest $base -OutFile "$voiceDir\pt_BR-faber-medium.onnx"
  Invoke-WebRequest "$base.json" -OutFile "$voiceDir\pt_BR-faber-medium.onnx.json"
}
Write-Host "Defina no .env.local:" -ForegroundColor Cyan
Write-Host "  PIPER_EXE=$((Resolve-Path "$piperDir\piper.exe").Path)"
Write-Host "  PIPER_VOICE=$((Resolve-Path "$voiceDir\pt_BR-faber-medium.onnx").Path)"

if (Get-Command ollama -ErrorAction SilentlyContinue) { ollama pull qwen2.5:7b }
npm install
npm run local:doctor
