@echo off
rem MAGIC HS - avvio dalla cartella condivisa (OneDrive).
rem La prima volta, e a ogni nuova versione, copia il programma su questo computer
rem (in %LOCALAPPDATA%\MAGIC HS\programma); poi lo avvia e lo apre nel browser.
rem Questo file deve restare solo ASCII, senza lettere accentate.
setlocal EnableExtensions DisableDelayedExpansion
title MAGIC HS
if not defined LOCALAPPDATA goto manca_profilo

set "CONDIVISA=%~dp0"
set "CONDIVISA=%CONDIVISA:~0,-1%"
set "LOCALE=%LOCALAPPDATA%\MAGIC HS\programma"

set "VERS="
if exist "%CONDIVISA%\programma\versione.txt" set /p VERS=<"%CONDIVISA%\programma\versione.txt"
set "PREC="
if exist "%LOCALE%\attuale.txt" set /p PREC=<"%LOCALE%\attuale.txt"

if not defined VERS goto usa_precedente
if exist "%LOCALE%\%VERS%\python\pythonw.exe" goto avvia
if not exist "%CONDIVISA%\programma\magic-hs-%VERS%.zip" goto usa_precedente

echo.
echo  Preparo MAGIC HS %VERS% su questo computer.
echo  Succede solo la prima volta e a ogni nuova versione: ci vuole circa un minuto.
echo.
if not exist "%LOCALE%" mkdir "%LOCALE%"
if exist "%LOCALE%\%VERS%.tmp" rmdir /s /q "%LOCALE%\%VERS%.tmp"
mkdir "%LOCALE%\%VERS%.tmp"
tar -xf "%CONDIVISA%\programma\magic-hs-%VERS%.zip" -C "%LOCALE%\%VERS%.tmp" 2>nul
if exist "%LOCALE%\%VERS%.tmp\python\pythonw.exe" goto estratto

rem senza tar (Windows molto vecchi) si usa PowerShell
set "PACCHETTO=%CONDIVISA%\programma\magic-hs-%VERS%.zip"
set "DESTINAZIONE=%LOCALE%\%VERS%.tmp"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath $env:PACCHETTO -DestinationPath $env:DESTINAZIONE -Force"
if not exist "%LOCALE%\%VERS%.tmp\python\pythonw.exe" goto errore_copia

:estratto
if exist "%LOCALE%\%VERS%" rmdir /s /q "%LOCALE%\%VERS%"
move "%LOCALE%\%VERS%.tmp" "%LOCALE%\%VERS%" >nul
if not exist "%LOCALE%\%VERS%\python\pythonw.exe" goto errore_copia
goto avvia

:usa_precedente
rem la nuova versione non e' ancora arrivata da OneDrive: si usa quella gia' copiata su questo computer
if not defined PREC goto manca_programma
if not exist "%LOCALE%\%PREC%\python\pythonw.exe" goto manca_programma
set "VERS=%PREC%"

:avvia
> "%LOCALE%\attuale.txt" echo %VERS%
start "" "%LOCALE%\%VERS%\python\pythonw.exe" -I -m taric.programma --condivisa "%CONDIVISA%"
exit /b 0

:manca_programma
echo.
echo  Non trovo il programma nella cartella condivisa:
echo  "%CONDIVISA%\programma"
echo.
echo  Se hai appena aggiunto la cartella, aspetta che OneDrive finisca di scaricarla e riprova.
goto fine_errore

:errore_copia
echo.
echo  Non riesco a copiare MAGIC HS su questo computer, in:
echo  "%LOCALE%"
echo.
echo  Controlla che OneDrive abbia finito di scaricare la cartella e che ci sia spazio sul disco, poi riprova.
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
