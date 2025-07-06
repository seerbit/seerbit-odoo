@echo off
setlocal enabledelayedexpansion

REM Odoo.sh Deployment Script for Seerbit Module (Windows Batch)
REM Usage: deploy-to-odoo-sh.bat

echo.
echo 🚀 Seerbit Odoo.sh Deployment Script
echo =====================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Error: Python is not installed or not in PATH
    echo Please install Python 3.7+ and try again
    pause
    exit /b 1
)

REM Check if we're in a git repository
if not exist ".git" (
    echo ❌ Error: Not in a git repository
    echo Please run this script from the project root
    pause
    exit /b 1
)

REM Check if Python script exists
if not exist "deploy-to-odoo-sh.py" (
    echo ❌ Error: deploy-to-odoo-sh.py not found
    echo Please ensure the Python script is in the same directory
    pause
    exit /b 1
)

echo ✅ Prerequisites check passed
echo.

REM Run the Python deployment script
echo 📝 Starting deployment...
python deploy-to-odoo-sh.py

REM Check if Python script succeeded
if errorlevel 1 (
    echo.
    echo ❌ Deployment failed
    pause
    exit /b 1
)

echo.
echo ✅ Deployment completed successfully!
pause 