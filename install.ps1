# AgentOS Official Windows Installer
[CmdletBinding()]
param (
  [string]$InstallDir = "$env:USERPROFILE\.agentos\bin",
  [switch]$Desktop,
  [switch]$NoPath,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Write-LuxeHeader {
  Write-Host ""
  Write-Host "  ================================================================" -ForegroundColor Cyan
  Write-Host "   >> AGENTOS - Autonomous Multi-Agent AI Operating System        " -ForegroundColor DarkCyan
  Write-Host "   >> Cyber-Luxe Glassmorphic Runtime & Desktop Platform          " -ForegroundColor Cyan
  Write-Host "  ================================================================" -ForegroundColor Cyan
  Write-Host ""
}

function Write-Step ([string]$step, [string]$msg) {
  Write-Host " [$step] " -ForegroundColor DarkCyan -NoNewline
  Write-Host "$msg" -ForegroundColor White
}

function Write-Success ([string]$msg) {
  Write-Host " [OK] " -ForegroundColor Green -NoNewline
  Write-Host "$msg" -ForegroundColor Gray
}

function Write-ErrorMsg ([string]$msg) {
  Write-Host " [ERR] " -ForegroundColor Red -NoNewline
  Write-Host "$msg" -ForegroundColor Red
}

Write-LuxeHeader

# 1. Prepare Target Directory
Write-Step "1/5" "Preparing installation directory: $InstallDir..."
if (-not (Test-Path $InstallDir)) {
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}
Write-Success "Directory ready at $InstallDir"

# 2. Locate or Build Binaries
Write-Step "2/5" "Locating AgentOS standalone binary..."
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$LocalBin = Join-Path $ScriptDir "bin\agentos.exe"

if (Test-Path $LocalBin) {
  Write-Success "Found local compiled binary: $LocalBin"
  Copy-Item -Path (Join-Path $ScriptDir "bin\*") -Destination $InstallDir -Force -Recurse
} elseif (Test-Path (Join-Path $ScriptDir "scripts\build-binaries.ts")) {
  Write-Host " Local binary not found, compiling from source with bun..." -ForegroundColor Yellow
  Push-Location $ScriptDir
  try {
    bun run scripts/build-binaries.ts
    Copy-Item -Path (Join-Path $ScriptDir "bin\*") -Destination $InstallDir -Force -Recurse
  } finally {
    Pop-Location
  }
} else {
  # Remote GitHub fallback
  $ReleaseUrl = "https://github.com/agent-os/agent-os/releases/latest/download/agentos.exe"
  $TargetExe = Join-Path $InstallDir "agentos.exe"
  Write-Host " Downloading latest AgentOS Windows x64 binary from release..." -ForegroundColor Cyan
  Invoke-WebRequest -Uri $ReleaseUrl -OutFile $TargetExe -UseBasicParsing
  Write-Success "Downloaded agentos.exe to $TargetExe"
}

$ExeTarget = Join-Path $InstallDir "agentos.exe"
$CmdTarget = Join-Path $InstallDir "agentos.cmd"
if (-not (Test-Path $CmdTarget)) {
  $cmdLines = @('@echo off', '"%~dp0agentos.exe" %*')
  Set-Content -Path $CmdTarget -Value $cmdLines -Encoding ASCII
}

# 3. Update User PATH Environment Variable
if (-not $NoPath) {
  Write-Step "3/5" "Configuring user PATH environment variable..."
  $UserPath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::User)
  if ($UserPath -notlike "*$InstallDir*") {
    $NewPath = if ($UserPath) { "$UserPath;$InstallDir" } else { $InstallDir }
    [Environment]::SetEnvironmentVariable("Path", $NewPath, [EnvironmentVariableTarget]::User)
    $env:PATH = "$env:PATH;$InstallDir"
    Write-Success "Added $InstallDir to user PATH (persistent)"
  } else {
    Write-Success "$InstallDir is already in user PATH"
  }
} else {
  Write-Step "3/5" "Skipping PATH modification as requested (-NoPath)"
}

# 4. Optional Desktop and Start Menu Shortcuts
if ($Desktop) {
  Write-Step "4/5" "Creating Windows Desktop and Start Menu shortcuts..."
  try {
    $WshShell = New-Object -ComObject WScript.Shell

    # Desktop shortcut
    $DesktopFolder = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
    $DesktopShortcut = $WshShell.CreateShortcut((Join-Path $DesktopFolder "AgentOS.lnk"))
    $DesktopShortcut.TargetPath = $ExeTarget
    $DesktopShortcut.Arguments = "desktop"
    $DesktopShortcut.Description = "Launch AgentOS Cyber-Luxe Desktop App"
    $DesktopShortcut.WorkingDirectory = "$env:USERPROFILE"
    $DesktopShortcut.Save()
    Write-Success "Created Desktop shortcut: AgentOS.lnk"

    # Start Menu shortcut
    $StartMenu = [Environment]::GetFolderPath([Environment+SpecialFolder]::Programs)
    $StartShortcut = $WshShell.CreateShortcut((Join-Path $StartMenu "AgentOS.lnk"))
    $StartShortcut.TargetPath = $ExeTarget
    $StartShortcut.Arguments = "desktop"
    $StartShortcut.Description = "Launch AgentOS Cyber-Luxe Desktop App"
    $StartShortcut.WorkingDirectory = "$env:USERPROFILE"
    $StartShortcut.Save()
    Write-Success "Created Start Menu shortcut: AgentOS.lnk"
  } catch {
    Write-Host " Note: Could not create shortcuts: $($_.Exception.Message)" -ForegroundColor Yellow
  }
} else {
  Write-Step "4/5" "Skipping desktop shortcuts (pass -Desktop to create them)"
}

# 5. Verification & Health Check
Write-Step "5/5" "Verifying installation integrity..."
try {
  $Version = & $ExeTarget --version
  Write-Success "AgentOS version verified: $Version"
} catch {
  Write-ErrorMsg "Failed to execute agentos: $($_.Exception.Message)"
  exit 1
}

Write-Host ""
Write-Host "  ================================================================" -ForegroundColor Green
Write-Host "   AgentOS successfully installed to:                            " -ForegroundColor Green
Write-Host "      $InstallDir                                                " -ForegroundColor White
Write-Host "  ================================================================" -ForegroundColor Green
Write-Host ""
Write-Host " Quickstart Commands:" -ForegroundColor Cyan
Write-Host "   agentos                     # Launch interactive AI terminal" -ForegroundColor White
Write-Host "   agentos desktop             # Launch Electron Cyber-Luxe app" -ForegroundColor White
Write-Host "   agentos run `"goal`"          # Run autonomous coding workflow" -ForegroundColor White
Write-Host "   agentos models              # Manage and inspect reasoning models" -ForegroundColor White
Write-Host "   agentos doctor              # Diagnose environment and keys" -ForegroundColor White
Write-Host ""
