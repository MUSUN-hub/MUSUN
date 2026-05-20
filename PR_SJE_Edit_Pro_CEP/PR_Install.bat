@echo off
setlocal

set DEST=%APPDATA%\Adobe\CEP\extensions\SJE_PR_Edit_Pro

echo Installing SJE PR Edit Pro...

if not exist "%DEST%" mkdir "%DEST%"
if not exist "%DEST%\CSXS" mkdir "%DEST%\CSXS"

copy /Y "%~dp0bin\index.html"       "%DEST%\index.html"       >nul
copy /Y "%~dp0bin\script.jsxbin"    "%DEST%\script.jsxbin"    >nul
copy /Y "%~dp0bin\CSInterface.js"   "%DEST%\CSInterface.js"   >nul
copy /Y "%~dp0bin\CSXS\manifest.xml" "%DEST%\CSXS\manifest.xml" >nul

:: Copy keyboard shortcuts (.kys) to all Premiere Pro profile folders
set KYS_SRC=%~dp0bin\SJE PR Edit Pro Shortcuts.kys
if exist "%KYS_SRC%" (
    for /d %%V in ("%USERPROFILE%\Documents\Adobe\Premiere Pro\*") do (
        if exist "%%V\Profile-%USERNAME%" (
            if not exist "%%V\Profile-%USERNAME%\Win" mkdir "%%V\Profile-%USERNAME%\Win"
            copy /Y "%KYS_SRC%" "%%V\Profile-%USERNAME%\Win\SJE PR Edit Pro Shortcuts.kys" >nul
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
echo Installation complete.
echo Location: %DEST%
echo.
echo Please restart Premiere Pro.
echo.
pause
