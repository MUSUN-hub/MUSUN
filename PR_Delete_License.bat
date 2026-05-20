@echo off
setlocal

echo ============================================================
echo  SJE PR Edit Pro - 로컬 라이선스 삭제 도구
echo ============================================================
echo.
echo 이 도구는 이 PC에 저장된 로컬 라이선스 파일을 삭제합니다.
echo PC 이전 또는 라이선스 초기화가 필요할 때 사용하세요.
echo.
echo [삭제 대상]
echo  - UXP 라이선스: PluginsStorage/.../SJE_PR_EDIT_PRO/license.key
echo  - UXP 기기 ID:  PluginsStorage/.../SJE_PR_EDIT_PRO/device.id
echo  - CEP 라이선스: APPDATA\SJE_PR_Edit_Pro\license.key
echo.

set /p CONFIRM=정말 삭제하시겠습니까? (y/N):
if /i not "%CONFIRM%"=="y" (
    echo 취소되었습니다.
    pause
    exit /b
)

echo.
echo 삭제 중...

:: ── UXP 라이선스 (Developer 로드 경로) ──────────────────────────────
set UXP_BASE=%APPDATA%\Adobe\UXP\PluginsStorage\PPRO

for /d %%V in ("%UXP_BASE%\*") do (
    set UXP_DEV=%%V\Developer\com.sje.pr.edit.pro\PluginData\SJE_PR_EDIT_PRO
    if exist "%%V\Developer\com.sje.pr.edit.pro\PluginData\SJE_PR_EDIT_PRO\license.key" (
        del /f /q "%%V\Developer\com.sje.pr.edit.pro\PluginData\SJE_PR_EDIT_PRO\license.key"
        echo [OK] 삭제: %%V\Developer\com.sje.pr.edit.pro\PluginData\SJE_PR_EDIT_PRO\license.key
    )
    if exist "%%V\Developer\com.sje.pr.edit.pro\PluginData\SJE_PR_EDIT_PRO\device.id" (
        del /f /q "%%V\Developer\com.sje.pr.edit.pro\PluginData\SJE_PR_EDIT_PRO\device.id"
        echo [OK] 삭제: %%V\Developer\com.sje.pr.edit.pro\PluginData\SJE_PR_EDIT_PRO\device.id
    )
)

:: ── UXP 라이선스 (배포 패키지 경로) ─────────────────────────────────
for /d %%V in ("%UXP_BASE%\*") do (
    if exist "%%V\com.sje.pr.edit.pro\PluginData\SJE_PR_EDIT_PRO\license.key" (
        del /f /q "%%V\com.sje.pr.edit.pro\PluginData\SJE_PR_EDIT_PRO\license.key"
        echo [OK] 삭제: %%V\com.sje.pr.edit.pro\PluginData\SJE_PR_EDIT_PRO\license.key
    )
    if exist "%%V\com.sje.pr.edit.pro\PluginData\SJE_PR_EDIT_PRO\device.id" (
        del /f /q "%%V\com.sje.pr.edit.pro\PluginData\SJE_PR_EDIT_PRO\device.id"
        echo [OK] 삭제: %%V\com.sje.pr.edit.pro\PluginData\SJE_PR_EDIT_PRO\device.id
    )
)

:: ── CEP 라이선스 ──────────────────────────────────────────────────────
set CEP_LIC=%APPDATA%\SJE_PR_Edit_Pro\license.key
if exist "%CEP_LIC%" (
    del /f /q "%CEP_LIC%"
    echo [OK] 삭제: %CEP_LIC%
) else (
    echo [--] CEP 라이선스 파일 없음 (건너뜀)
)

echo.
echo 완료! 이제 플러그인을 열면 라이선스 인증 화면이 나타납니다.
echo.
pause
