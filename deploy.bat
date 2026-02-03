@echo off
echo ========================================
echo Econova Deployment Helper
echo ========================================
echo.

REM Check if git is initialized
if not exist .git (
    echo Initializing Git repository...
    git init
    echo.
)

echo Adding all files to Git...
git add .
echo.

set /p commit_msg="Enter commit message (or press Enter for default): "
if "%commit_msg%"=="" set commit_msg=Update Econova platform

echo Committing changes...
git commit -m "%commit_msg%"
echo.

REM Check if remote exists
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo.
    echo ========================================
    echo FIRST TIME SETUP
    echo ========================================
    echo.
    echo Please create a GitHub repository first:
    echo 1. Go to https://github.com/new
    echo 2. Name it: econova-platform
    echo 3. Don't initialize with README
    echo 4. Copy the repository URL
    echo.
    set /p repo_url="Enter your GitHub repository URL: "
    git remote add origin !repo_url!
    git branch -M main
    echo.
)

echo Pushing to GitHub...
git push -u origin main
echo.

echo ========================================
echo SUCCESS!
echo ========================================
echo.
echo Your code has been pushed to GitHub.
echo.
echo Next steps:
echo 1. Deploy backend on Render: https://dashboard.render.com
echo 2. Deploy frontend on Vercel: https://vercel.com/new
echo.
echo See deployment_guide.md for detailed instructions.
echo.
pause
