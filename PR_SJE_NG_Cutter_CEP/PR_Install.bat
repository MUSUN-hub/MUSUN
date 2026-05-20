@echo off
setlocal

set DEST=%APPDATA%\Adobe\CEP\extensions\SJE_NG_Cutter

echo Installing SJE NG Cutter...

if not exist "%DEST%" mkdir "%DEST%"
if not exist "%DEST%\CSXS" mkdir "%DEST%\CSXS"

copy /Y "%~dp0index.html"       "%DEST%\index.html"       >nul
copy /Y "%~dp0script.jsx"       "%DEST%\script.jsx"       >nul
copy /Y "%~dp0CSInterface.js"   "%DEST%\CSInterface.js"   >nul
copy /Y "%~dp0CSXS\manifest.xml" "%DEST%\CSXS\manifest.xml" >nul

:: Copy keyboard shortcuts (.kys) to all Premiere Pro profile folders
set KYS_SRC=%~dp0SJE NG Cutter Shortcuts.kys
if exist "%KYS_SRC%" (
    for /d %%V in ("%USERPROFILE%\Documents\Adobe\Premiere Pro\*") do (
        if exist "%%V\Profile-%USERNAME%" (
            if not exist "%%V\Profile-%USERNAME%\Win" mkdir "%%V\Profile-%USERNAME%\Win"
            copy /Y "%KYS_SRC%" "%%V\Profile-%USERNAME%\Win\SJE NG Cutter Shortcuts.kys" >nul
            echo Shortcuts copied to %%V\Profile-%USERNAME%\Win
        )
    )
) else (
    echo Shortcuts file not found, skipping.
)

:: Enable Debug Mode for CEP
reg add "HKCU\SOFTWARE\Adobe\CSXS.9"  /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
reg add "HKCU\SOFTWARE\Adobe\CSXS.10" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
reg add "HKCU\SOFTWARE\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
reg add "HKCU\SOFTWARE\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul

echo.
echo Installation complete. (SJE NG Cutter)
echo Location: %DEST%
echo.
echo Please restart Premiere Pro.
echo.
pause
