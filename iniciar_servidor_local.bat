@echo off
title Servidor Local PWA - ERGOEXPRESS C.A.
echo ======================================================================
echo ERGOEXPRESS C.A. - Lanzador de Servidor Local PWA
echo ======================================================================
echo Iniciando servidor web local para pruebas sin errores de protocolo...
echo.

where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Node.js detectado. Iniciando servidor HTTP...
    start http://localhost:8080/index.html
    npx --yes serve -l 8080 .
    goto end
)

where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Python detectado. Iniciando servidor HTTP...
    start http://localhost:8080/index.html
    python -m http.server 8080
    goto end
)

echo [INFO] Ni Node.js ni Python estan disponibles en PATH.
echo Abriendo directamente en el navegador predeterminado...
start index.html

:end
