@echo off
setlocal

echo Clearing SJE license files and CEP extension...
echo.

set LICENSE1=%APPDATA%\PPRS\license.key
set LICENSE2=%APPDATA%\Adobe\UXP\PluginsStorage\PPRO\26\Developer\com.sje.pr.edit.pro\PluginData\SJE_PR_EDIT_PRO\license.key
set LICENSE3=%APPDATA%\Adobe\UXP\PluginsStorage\PPRO\25\Developer\com.sje.pr.edit.pro\PluginData\SJE_PR_EDIT_PRO\license.key
set LICENSE4=%USERPROFILE%\Documents\PPRS\license.key
set CEP_DIR=%APPDATA%\Adobe\CEP\extensions\SJE_NG_Cutter

if exist "%LICENSE1%" (
    del /F /Q "%LICENSE1%"
    echo Deleted: %LICENSE1%
) else (
    echo Not found: %LICENSE1%
)

if exist "%LICENSE2%" (
    del /F /Q "%LICENSE2%"
    echo Deleted: %LICENSE2%
) else (
    echo Not found: %LICENSE2%
)

if exist "%LICENSE3%" (
    del /F /Q "%LICENSE3%"
    echo Deleted: %LICENSE3%
) else (
    echo Not found: %LICENSE3%
)

if exist "%LICENSE4%" (
    del /F /Q "%LICENSE4%"
    echo Deleted: %LICENSE4%
) else (
    echo Not found: %LICENSE4%
)

if exist "%CEP_DIR%" (
    rmdir /S /Q "%CEP_DIR%"
    echo Deleted: %CEP_DIR%
) else (
    echo Not found: %CEP_DIR%
)

echo.
echo Done. Please restart Premiere Pro.
echo.
pause
