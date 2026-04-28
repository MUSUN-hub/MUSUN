@echo off
setlocal enabledelayedexpansion

echo ================================================
echo   AE SJE Copy-Paste Pro Installer
echo ================================================
echo.

set "SCRIPT_FILE=%~dp0AE SJE Copy-Paste Pro.jsxbin"
if not exist "%SCRIPT_FILE%" (
    echo [ERROR] AE SJE Copy-Paste Pro.jsxbin not found.
    echo Place this bat file in the same folder as the jsxbin file.
    pause
    exit /b 1
)

set "AE_BASE=C:\Program Files\Adobe"
set "INSTALL_COUNT=0"

echo Searching for After Effects installations...
echo.

for /d %%D in ("%AE_BASE%\Adobe After Effects*") do (
    set "PANEL_DIR=%%D\Support Files\Scripts\ScriptUI Panels"
    if exist "!PANEL_DIR!" (
        echo [FOUND] %%~nD
        copy /y "%SCRIPT_FILE%" "!PANEL_DIR!\AE SJE Copy-Paste Pro.jsxbin" >nul 2>&1
        if !errorlevel! == 0 (
            echo        [OK] Install successful
            set /a INSTALL_COUNT+=1
        ) else (
            echo        [FAIL] Try running as Administrator
        )
        echo.
    )
)

if %INSTALL_COUNT% == 0 (
    echo [ERROR] No After Effects installation found.
) else (
    echo ================================================
    echo   Installed to %INSTALL_COUNT% version(s)!
    echo ================================================
    echo.
    echo Please restart After Effects.
    echo Go to: Window ^> AE SJE Copy-Paste Pro
)

echo.
pause
