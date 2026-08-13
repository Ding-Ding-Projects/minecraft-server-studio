@echo off
setlocal EnableExtensions
set "MSS_SILENT=0"
if /I "%~1"=="/s" set "MSS_SILENT=1"
if /I "%~1"=="--silent" set "MSS_SILENT=1"
if /I "%SILENT%"=="1" set "MSS_SILENT=1"

pushd "%~dp0" >nul || exit /b 1
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
set "CSC_LINK="
set "CSC_KEY_PASSWORD="
set "WIN_CSC_LINK="
set "WIN_CSC_KEY_PASSWORD="
echo [1/3] Building the runnable application first...
call build.bat /s
if errorlevel 1 (
  echo ERROR: The runnable build failed, so no installer was created.
  popd
  exit /b 1
)
echo [2/3] Packaging unsigned Squirrel.Windows assets...
call npm run package
if errorlevel 1 (
  echo ERROR: Squirrel.Windows packaging failed.
  popd
  exit /b 1
)
set "MSS_SETUP=dist\squirrel-windows\Minecraft.Server.Studio-0.1.0-x64-Setup.exe"
if not exist "%MSS_SETUP%" (
  echo ERROR: Expected installer was not found at %MSS_SETUP%.
  popd
  exit /b 1
)
echo [3/3] Verifying unsigned installer and SHA-256...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$file=Resolve-Path -LiteralPath '%MSS_SETUP%'; $signature=Get-AuthenticodeSignature -LiteralPath $file; if($signature.Status -ne 'NotSigned'){ throw ('Installer must remain unsigned; signature status is '+$signature.Status) }; $hash=Get-FileHash -Algorithm SHA256 -LiteralPath $file; Write-Output ('Installer: '+$file); Write-Output ('SHA-256: '+$hash.Hash); Write-Output 'Signature: NotSigned (expected)';"
if errorlevel 1 (
  echo ERROR: Installer verification failed.
  popd
  exit /b 1
)
echo Unsigned Squirrel.Windows installer is ready. This script did not publish, tag, or create a release.
popd
exit /b 0
