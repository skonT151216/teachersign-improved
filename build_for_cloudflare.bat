@echo off
echo.
echo ===================================================
echo Cloudflare 배포용 빌드를 시작합니다...
echo ===================================================
echo.

call npm run build

if %ERRORLEVEL% neq 0 (
    echo.
    echo [오류] 빌드에 실패했습니다. 에러 메시지를 확인해주세요.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ===================================================
echo 빌드가 성공적으로 완료되었습니다!
echo 'dist' 폴더가 열립니다.
echo.
echo [배포 방법]
echo 1. Cloudflare 대시보드에 로그인합니다.
echo 2. Pages (또는 Workers ^& Pages) 메뉴에서 프로젝트를 선택합니다.
echo 3. 'Create deployment' (또는 자산 업로드/배포) 메뉴로 이동합니다.
echo 4. 방금 열린 'dist' 폴더 안의 내용물을 드래그 앤 드롭으로 업로드하세요.
echo    (또는 dist 폴더 자체를 압축하거나 선택해서 업로드하세요)
echo ===================================================
echo.

explorer "%~dp0dist"
pause
