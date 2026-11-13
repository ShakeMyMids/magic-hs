@echo off
rem MAGIC HS - avvio dalla cartella in cui si e' estratto MAGIC HS.
rem La prima volta copia il programma su questo computer (in %LOCALAPPDATA%\MAGIC HS\programma), poi lo avvia
rem e lo apre nel browser. Le versioni nuove le scarica il programma stesso da GitHub nella stessa cartella e le
rem indica in attuale.txt: da li' si usa sempre la piu' recente.
rem Questo file deve restare solo ASCII, senza lettere accentate, e senza blocchi tra parentesi.
setlocal EnableExtensions DisableDelayedExpansion
title MAGIC HS
if not defined LOCALAPPDATA goto manca_profilo

set "CARTELLA=%~dp0"
set "CARTELLA=%CARTELLA:~0,-1%"
set "LOCALE=%LOCALAPPDATA%\MAGIC HS\programma"

set "VERS="
if exist "%CARTELLA%\programma\versione.txt" set /p VERS=<"%CARTELLA%\programma\versione.txt"
set "PREC="
if exist "%LOCALE%\attuale.txt" set /p PREC=<"%LOCALE%\attuale.txt"

if not defined VERS goto usa_precedente
if exist "%LOCALE%\%VERS%\python\pythonw.exe" goto gia_copiata
if not exist "%CARTELLA%\programma\magic-hs-%VERS%.zip" goto usa_precedente

echo.
echo  Preparo MAGIC HS %VERS% su questo computer.
echo  Succede solo la prima volta: ci vuole circa un minuto.
echo.
if not exist "%LOCALE%" mkdir "%LOCALE%"
if exist "%LOCALE%\%VERS%.tmp" rmdir /s /q "%LOCALE%\%VERS%.tmp"
mkdir "%LOCALE%\%VERS%.tmp"
tar -xf "%CARTELLA%\programma\magic-hs-%VERS%.zip" -C "%LOCALE%\%VERS%.tmp" 2>nul
if exist "%LOCALE%\%VERS%.tmp\python\pythonw.exe" goto estratto

rem senza tar (Windows molto vecchi) si usa PowerShell
set "PACCHETTO=%CARTELLA%\programma\magic-hs-%VERS%.zip"
set "DESTINAZIONE=%LOCALE%\%VERS%.tmp"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath $env:PACCHETTO -DestinationPath $env:DESTINAZIONE -Force"
if not exist "%LOCALE%\%VERS%.tmp\python\pythonw.exe" goto errore_copia

:estratto
if exist "%LOCALE%\%VERS%" rmdir /s /q "%LOCALE%\%VERS%"
move "%LOCALE%\%VERS%.tmp" "%LOCALE%\%VERS%" >nul
if not exist "%LOCALE%\%VERS%\python\pythonw.exe" goto errore_copia
goto avvia

:gia_copiata
rem la versione di questa cartella e' gia' sul PC: se il programma ne ha installata una piu' recente si usa quella
if not defined PREC goto avvia
if exist "%LOCALE%\%PREC%\python\pythonw.exe" set "VERS=%PREC%"
goto avvia

:usa_precedente
rem nella cartella non c'e' il pacchetto: si usa la versione gia' copiata su questo computer
if not defined PREC goto manca_programma
if not exist "%LOCALE%\%PREC%\python\pythonw.exe" goto manca_programma
set "VERS=%PREC%"

:avvia
> "%LOCALE%\attuale.txt" echo %VERS%
start "" "%LOCALE%\%VERS%\python\pythonw.exe" -I -m taric.programma --avvio "%CARTELLA%"
exit /b 0

:manca_programma
echo.
echo  Non trovo il programma in questa cartella:
echo  "%CARTELLA%\programma"
echo.
echo  Estrai di nuovo MAGIC-HS-versione.zip scaricato dalla pagina delle versioni di MAGIC HS su GitHub.
goto fine_errore

:errore_copia
echo.
echo  Non riesco a copiare MAGIC HS su questo computer, in:
echo  "%LOCALE%"
echo.
echo  Controlla che ci sia spazio sul disco, poi riprova.
echo  Se il problema resta, chiedi all'IT se il PC blocca i programmi copiati nella cartella dell'utente.
goto fine_errore

:manca_profilo
echo.
echo  Non trovo la cartella dell'utente di Windows (LOCALAPPDATA): MAGIC HS non puo' partire.
goto fine_errore

:fine_errore
echo.
pause
exit /b 1
