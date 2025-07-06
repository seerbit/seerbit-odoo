#!/bin/bash

# Odoo.sh Deployment Script for Seerbit Module
# Usage: ./deploy-to-odoo-sh.sh [odoo-sh-repo-url]

set -e

echo "🚀 Seerbit Odoo.sh Deployment Script"
echo "====================================="

# Check if Odoo.sh repo URL is provided
if [ -z "$1" ]; then
    echo "❌ Error: Please provide your Odoo.sh repository URL"
    echo "Usage: ./deploy-to-odoo-sh.sh https://github.com/odoo/your-company-your-project.git"
    exit 1
fi

ODOO_SH_REPO=$1

echo "📋 Prerequisites Check"
echo "======================"

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Error: Git is not installed"
    exit 1
fi

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in a git repository"
    exit 1
fi

# Check if we're on the correct branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "16.0" ]; then
    echo "⚠️  Warning: You're not on the 16.0 branch (current: $CURRENT_BRANCH)"
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "✅ Prerequisites check passed"

echo ""
echo "🔧 Configuration"
echo "================"

# Check if Odoo.sh remote already exists
if git remote get-url odoo-sh &> /dev/null; then
    echo "📝 Updating existing Odoo.sh remote..."
    git remote set-url odoo-sh "$ODOO_SH_REPO"
else
    echo "📝 Adding Odoo.sh remote..."
    git remote add odoo-sh "$ODOO_SH_REPO"
fi

echo "✅ Odoo.sh remote configured: $ODOO_SH_REPO"

echo ""
echo "📦 Preparing for Deployment"
echo "==========================="

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  Warning: You have uncommitted changes"
    git status --short
    read -p "Do you want to commit these changes? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter commit message: " COMMIT_MSG
        git add .
        git commit -m "$COMMIT_MSG"
    else
        echo "❌ Please commit your changes before deploying"
        exit 1
    fi
fi

echo "✅ Repository is clean"

echo ""
echo "🚀 Deploying to Odoo.sh"
echo "======================="

# Fetch latest from Odoo.sh
echo "📥 Fetching latest from Odoo.sh..."
git fetch odoo-sh

# Check if there are conflicts
echo "🔍 Checking for conflicts..."
if git merge-tree $(git merge-base HEAD odoo-sh/master) HEAD odoo-sh/master | grep -q "<<<<<<<"; then
    echo "❌ Conflicts detected. Please resolve conflicts manually:"
    echo "   git pull odoo-sh master"
    echo "   # Resolve conflicts"
    echo "   git add ."
    echo "   git commit -m 'Resolve conflicts'"
    exit 1
fi

echo "✅ No conflicts detected"

# Push to Odoo.sh
echo "📤 Pushing to Odoo.sh..."
git push odoo-sh 16.0:master

echo ""
echo "✅ Deployment Complete!"
echo "======================"
echo ""
echo "📋 Next Steps:"
echo "1. Wait for Odoo.sh build to complete (check your Odoo.sh dashboard)"
echo "2. Configure Firebase environment variables in Odoo.sh:"
echo "   - Go to Settings > Technical > Parameters > System Parameters"
echo "   - Add FIREBASE_CRED_PATH, FIREBASE_DB_URL, etc."
echo "3. Upload service-account-write.json to Settings > Technical > Files"
echo "4. Install the Seerbit module from Apps"
echo "5. Configure payment method in Point of Sale"
echo ""
echo "📖 For detailed instructions, see ODOO_SH_DEPLOYMENT.md"
echo ""
echo "🔗 Odoo.sh Dashboard: https://www.odoo.sh"
echo ""

# Optional: Open Odoo.sh dashboard
read -p "Do you want to open the Odoo.sh dashboard? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v xdg-open &> /dev/null; then
        xdg-open "https://www.odoo.sh"
    elif command -v open &> /dev/null; then
        open "https://www.odoo.sh"
    else
        echo "Please visit: https://www.odoo.sh"
    fi
fi 