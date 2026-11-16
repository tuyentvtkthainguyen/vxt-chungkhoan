@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul && (py -3 server.py & goto :eof)
where python >nul 2>nul && (python server.py & goto :eof)
echo Chua cai Python. Tai tai https://www.python.org/downloads/ (tick "Add Python to PATH").
pause
