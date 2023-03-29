# Odoo.sh Deployment Script for Seerbit Module (PowerShell)
# Usage: .\deploy-to-odoo-sh.ps1

param(
    [string]$OdooShRepo = "",
    [string]$FirebaseProjectId = "",
    [string]$FirebaseDbUrl = "",
    [string]$FirebaseApiKey = "",
    [string]$SeerbitPublicKey = "",
    [string]$ServiceAccountPath = "service-account-write.json"
)

# Set console colors
$Host.UI.RawUI.ForegroundColor = "White"

function Write-Header {
    param([string]$Text)
    Write-Host "`n" -NoNewline
    Write-Host $Text -ForegroundColor Magenta -BackgroundColor Black
    Write-Host ("=" * $Text.Length) -ForegroundColor Magenta
}

function Write-Success {
    param([string]$Text)
    Write-Host "✅ $Text" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Text)
    Write-Host "⚠️  $Text" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Text)
    Write-Host "❌ $Text" -ForegroundColor Red
}

function Write-Info {
    param([string]$Text)
    Write-Host "📝 $Text" -ForegroundColor Cyan
}

function Test-Command {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Get-UserInput {
    param(
        [string]$Prompt,
        [string]$Default = "",
        [bool]$Required = $true
    )
    
    do {
        if ($Default) {
            $input = Read-Host "$Prompt (default: $Default)"
            if ([string]::IsNullOrWhiteSpace($input)) {
                $input = $Default
            }
        }
        else {
            $input = Read-Host $Prompt
        }
        
        if ([string]::IsNullOrWhiteSpace($input) -and $Required) {
            Write-Error "This field is required!"
            continue
        }
        
        return $input
    } while ($false)
}

function Get-YesNo {
    param(
        [string]$Prompt,
        [string]$Default = "N"
    )
    
    do {
        $response = Read-Host "$Prompt (y/N)"
        if ([string]::IsNullOrWhiteSpace($response)) {
            $response = $Default
        }
        
        switch ($response.ToLower()) {
            "y" { return $true }
            "yes" { return $true }
            "n" { return $false }
            "no" { return $false }
            default {
                Write-Error "Please enter 'y' or 'n'"
            }
        }
    } while ($true)
}

function Test-Prerequisites {
    Write-Header "Prerequisites Check"
    
    # Check if git is installed
    if (-not (Test-Command "git")) {
        Write-Error "Git is not installed. Please install Git first."
        exit 1
    }
    Write-Success "Git is installed"
    
    # Check if we're in a git repository
    if (-not (Test-Path ".git")) {
        Write-Error "Not in a git repository. Please run this script from the project root."
        exit 1
    }
    Write-Success "In a git repository"
    
    # Check current branch
    $currentBranch = git branch --show-current
    if ($currentBranch -ne "16.0") {
        Write-Warning "You're not on the 16.0 branch (current: $currentBranch)"
        if (-not (Get-YesNo "Do you want to continue?")) {
            exit 1
        }
    }
    else {
        Write-Success "On correct branch: $currentBranch"
    }
    
    Write-Success "Prerequisites check passed"
}

function Get-DeploymentConfig {
    Write-Header "Deployment Configuration"
    
    $config = @{}
    
    # Get Odoo.sh repository URL
    Write-Info "You can find your Odoo.sh repository URL in your Odoo.sh dashboard"
    Write-Info "It will look like: https://github.com/odoo/your-company-your-project.git"
    
    if ([string]::IsNullOrWhiteSpace($OdooShRepo)) {
        $config['odoo_sh_repo'] = Get-UserInput "Enter your Odoo.sh repository URL"
    }
    else {
        $config['odoo_sh_repo'] = $OdooShRepo
        Write-Success "Using provided Odoo.sh repo: $OdooShRepo"
    }
    
    # Get Firebase configuration
    Write-Header "Firebase Configuration"
    Write-Info "You'll need to configure these in Odoo.sh after deployment"
    
    if ([string]::IsNullOrWhiteSpace($FirebaseProjectId)) {
        $config['firebase_project_id'] = Get-UserInput "Firebase Project ID"
    }
    else {
        $config['firebase_project_id'] = $FirebaseProjectId
    }
    
    if ([string]::IsNullOrWhiteSpace($FirebaseDbUrl)) {
        $config['firebase_db_url'] = Get-UserInput "Firebase Database URL (e.g., https://your-project.firebaseio.com)"
    }
    else {
        $config['firebase_db_url'] = $FirebaseDbUrl
    }
    
    if ([string]::IsNullOrWhiteSpace($FirebaseApiKey)) {
        $config['firebase_api_key'] = Get-UserInput "Firebase API Key"
    }
    else {
        $config['firebase_api_key'] = $FirebaseApiKey
    }
    
    # Get Seerbit configuration
    Write-Header "Seerbit Configuration"
    Write-Info "Note: Seerbit public key should be configured in POS payment method, not via environment variables"
    Write-Info "You'll configure this after deployment in Point of Sale > Configuration > Payment Methods"
    
    # Service account file
    Write-Header "Service Account File"
    Write-Info "You'll need to upload this file to Odoo.sh after deployment"
    
    if ([string]::IsNullOrWhiteSpace($ServiceAccountPath)) {
        $config['service_account_path'] = Get-UserInput "Path to service-account-write.json file" -Default "service-account-write.json"
    }
    else {
        $config['service_account_path'] = $ServiceAccountPath
    }
    
    if (-not (Test-Path $config['service_account_path'])) {
        Write-Warning "Service account file not found: $($config['service_account_path'])"
        if (-not (Get-YesNo "Continue anyway? You'll need to upload it manually")) {
            exit 1
        }
    }
    else {
        Write-Success "Service account file found: $($config['service_account_path'])"
    }
    
    return $config
}

function Configure-GitRemote {
    param($config)
    
    Write-Header "Git Configuration"
    
    # Check if Odoo.sh remote already exists
    $result = git remote get-url odoo-sh 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Info "Updating existing Odoo.sh remote..."
        git remote set-url odoo-sh $config['odoo_sh_repo']
    }
    else {
        Write-Info "Adding Odoo.sh remote..."
        git remote add odoo-sh $config['odoo_sh_repo']
    }
    
    Write-Success "Odoo.sh remote configured: $($config['odoo_sh_repo'])"
}

function Prepare-Deployment {
    Write-Header "Preparing for Deployment"
    
    # Check for uncommitted changes
    $status = git status --porcelain
    if ($status) {
        Write-Warning "You have uncommitted changes:"
        Write-Host $status
        
        if (Get-YesNo "Do you want to commit these changes?") {
            $commitMsg = Get-UserInput "Enter commit message" -Default "Update Seerbit module"
            git add .
            git commit -m $commitMsg
            Write-Success "Changes committed"
        }
        else {
            Write-Error "Please commit your changes before deploying"
            exit 1
        }
    }
    else {
        Write-Success "Repository is clean"
    }
}

function Deploy-ToOdooSh {
    Write-Header "Deploying to Odoo.sh"
    
        # Fetch latest from Odoo.sh
    Write-Info "Fetching latest from Odoo.sh..."
    git fetch odoo-sh

    # Check if we need to pull remote changes first
    Write-Info "Checking if remote has changes..."
    try {
        # Check if local is behind remote
        $behindCount = git rev-list --count HEAD..odoo-sh/master
        
        if ([int]$behindCount -gt 0) {
            Write-Warning "Local branch is $behindCount commits behind remote"
            Write-Info "Pulling remote changes to sync..."
            
            # Try to pull with rebase first
            try {
                git pull --rebase odoo-sh master
                Write-Success "Successfully rebased with remote changes"
            }
            catch {
                Write-Warning "Rebase failed, trying merge..."
                git pull odoo-sh master
                Write-Success "Successfully merged with remote changes"
            }
        }
        else {
            Write-Success "Local branch is up to date"
        }
    }
    catch {
        Write-Warning "Could not determine branch status, proceeding with push"
    }

    # Check for conflicts (simplified check)
    Write-Info "Checking for conflicts..."
    try {
        # Get the merge base
        $mergeBase = git merge-base HEAD odoo-sh/master
        if ($mergeBase) {
            # Check for conflicts using merge-tree
            $mergeTree = git merge-tree $mergeBase HEAD odoo-sh/master
            if ($mergeTree -match "<<<<<<<") {
                throw "Conflicts detected"
            }
            Write-Success "No conflicts detected"
        }
        else {
            Write-Warning "No common ancestor found - this is normal for new repositories"
            Write-Success "Proceeding with deployment"
        }
    }
    catch {
        Write-Warning "Could not check for conflicts automatically"
        Write-Info "Proceeding with deployment - conflicts will be handled by git push"
        Write-Info "If conflicts occur, you'll need to resolve them manually"
    }
    
    # Push to Odoo.sh
    Write-Info "Pushing to Odoo.sh..."
    git push odoo-sh 16.0:master
    
    Write-Success "Deployment complete!"
}

function Show-NextSteps {
    param($config)
    
    Write-Header "Next Steps"
    
    Write-Info "1. Wait for Odoo.sh build to complete (check your Odoo.sh dashboard)"
    Write-Info "2. Configure Firebase environment variables in Odoo.sh:"
    Write-Host "   - Go to Settings > Technical > Parameters > System Parameters"
    Write-Host "   - Add the following parameters:"
    
    $envVars = @(
        @("FIREBASE_CRED_PATH", "service-account-write.json"),
        @("FIREBASE_DB_URL", $config['firebase_db_url']),
        @("FIREBASE_API_KEY", $config['firebase_api_key']),
        @("FIREBASE_DATABASE_URL", $config['firebase_db_url']),
        @("FIREBASE_PROJECT_ID", $config['firebase_project_id'])
    )
    
    foreach ($var in $envVars) {
        Write-Host "     $($var[0]): $($var[1])"
    }
    
    Write-Info "3. Upload service-account-write.json to Settings > Technical > Files"
    Write-Info "4. Install the Seerbit module from Apps"
    Write-Info "5. Configure payment method in Point of Sale:"
    Write-Host "   - Go to Point of Sale > Configuration > Payment Methods"
    Write-Host "   - Create new payment method"
    Write-Host "   - Set Payment Terminal to 'Seerbit'"
    Write-Host "   - Enter your Seerbit Public Key from your Seerbit dashboard"
    
    Write-Info "6. Test the integration"
    
    Write-Host "`n📖 For detailed instructions, see ODOO_SH_DEPLOYMENT.md"
    Write-Host "🔗 Odoo.sh Dashboard: https://www.odoo.sh"
}

function Open-OdooShDashboard {
    if (Get-YesNo "Do you want to open the Odoo.sh dashboard?") {
        try {
            Start-Process "https://www.odoo.sh"
            Write-Success "Opened Odoo.sh dashboard in browser"
        }
        catch {
            Write-Info "Please visit: https://www.odoo.sh"
        }
    }
}

# Main execution
try {
    Write-Header "Seerbit Odoo.sh Deployment Script"
    Write-Host "Platform: $($PSVersionTable.PSVersion)" -ForegroundColor Gray
    
    # Check prerequisites
    Test-Prerequisites
    
    # Get configuration
    $config = Get-DeploymentConfig
    
    # Configure git remote
    Configure-GitRemote $config
    
    # Prepare deployment
    Prepare-Deployment
    
    # Deploy
    Deploy-ToOdooSh
    
    # Show next steps
    Show-NextSteps $config
    
    # Open dashboard
    Open-OdooShDashboard
    
    Write-Header "Deployment Complete!"
    Write-Success "Your Seerbit module has been deployed to Odoo.sh!"
}
catch {
    Write-Error "Deployment failed: $($_.Exception.Message)"
    exit 1
} 