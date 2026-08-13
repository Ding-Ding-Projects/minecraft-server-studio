@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "MSS_SILENT=0"
if /I "%~1"=="/s" set "MSS_SILENT=1"
if /I "%~1"=="--silent" set "MSS_SILENT=1"
if /I "%SILENT%"=="1" set "MSS_SILENT=1"

set "MSS_ROOT=%~dp0"
pushd "%MSS_ROOT%" >nul || exit /b 1
set "MSS_START=%TIME%"
echo [1/4] Checking Node.js LTS...
where node >nul 2>nul
if errorlevel 1 (
  where winget >nul 2>nul
  if not errorlevel 1 (
    echo Installing Node.js LTS with Winget...
    winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
  ) else (
    echo Winget is unavailable. Downloading a user-scoped Node.js LTS archive...
    for /f "usebackq delims=" %%P in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $root=Join-Path $env:LOCALAPPDATA 'MinecraftServerStudio\toolchain\node'; New-Item -ItemType Directory -Force -Path $root | Out-Null; $release=Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object { $_.lts } | Select-Object -First 1; $zip=Join-Path $root 'node.zip'; Invoke-WebRequest ('https://nodejs.org/dist/'+$release.version+'/node-'+$release.version+'-win-x64.zip') -OutFile $zip; Expand-Archive -LiteralPath $zip -DestinationPath $root -Force; (Get-ChildItem -Path $root -Filter node.exe -Recurse | Select-Object -First 1).DirectoryName"`) do set "MSS_NODE_HOME=%%P"
    if defined MSS_NODE_HOME set "PATH=!MSS_NODE_HOME!;!MSS_NODE_HOME!\node_modules\npm\bin;!PATH!"
  )
)
where node >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js LTS could not be installed or located.
  popd
  exit /b 1
)

echo [2/4] Installing project dependencies...
call npm install
if errorlevel 1 (
  echo ERROR: npm install failed. See the output above for the exact package failure.
  popd
  exit /b 1
)

echo [3/4] Building the runnable Electron directory...
call npm run package:dir
if errorlevel 1 (
  echo ERROR: Electron directory build failed.
  popd
  exit /b 1
)

echo [4/4] Runnable build completed at dist\win-unpacked.
if "%MSS_SILENT%"=="1" goto :done
choice /C YN /N /M "Launch Minecraft Server Studio now?"
if errorlevel 2 goto :done
start "Minecraft Server Studio" "dist\win-unpacked\Minecraft Server Studio.exe"
:done
echo Build finished. Started at %MSS_START%, finished at %TIME%.
popd
exit /b 0
