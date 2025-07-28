@echo off
echo Setting up Seerbit Odoo Module Development Environment...
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is not installed or not in PATH
    pause
    exit /b 1
)

REM Create virtual environment
echo Creating virtual environment...
python -m venv venv
if errorlevel 1 (
    echo Error: Failed to create virtual environment
    pause
    exit /b 1
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install development dependencies
echo Installing development dependencies...
pip install -r requirements-dev.txt
if errorlevel 1 (
    echo Error: Failed to install dependencies
    pause
    exit /b 1
)

REM Create necessary directories
echo Creating test directories...
if not exist "tests" mkdir tests
if not exist ".vscode" mkdir .vscode

echo.
echo ✅ Development environment setup complete!
echo.
echo To activate the environment in the future, run:
echo   venv\Scripts\activate.bat
echo.
echo To run development tools:
echo   python dev-tools.py all
echo.
pause 