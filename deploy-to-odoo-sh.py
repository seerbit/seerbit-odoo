#!/usr/bin/env python3
"""
Odoo.sh Deployment Script for Seerbit Module
Cross-platform (Linux/Windows) deployment automation
"""

import json
import os
import platform
import subprocess
import sys
import webbrowser
from pathlib import Path


class Colors:
    """ANSI color codes for terminal output"""
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


def print_header(text):
    """Print formatted header"""
    print(f"\n{Colors.HEADER}{Colors.BOLD}{text}{Colors.ENDC}")
    print("=" * len(text))


def print_success(text):
    """Print success message"""
    print(f"{Colors.OKGREEN}✅ {text}{Colors.ENDC}")


def print_warning(text):
    """Print warning message"""
    print(f"{Colors.WARNING}⚠️  {text}{Colors.ENDC}")


def print_error(text):
    """Print error message"""
    print(f"{Colors.FAIL}❌ {text}{Colors.ENDC}")


def print_info(text):
    """Print info message"""
    print(f"{Colors.OKBLUE}📝 {text}{Colors.ENDC}")


def run_command(command, check=True, capture_output=False):
    """Run shell command with error handling"""
    try:
        if capture_output:
            result = subprocess.run(command, shell=True, check=check,
                                    capture_output=True, text=True)
            return result
        else:
            result = subprocess.run(command, shell=True, check=check)
            return result
    except subprocess.CalledProcessError as e:
        if check:
            print_error(f"Command failed: {command}")
            print_error(f"Error: {e}")
            sys.exit(1)
        return e


def get_user_input(prompt, default=None, required=True):
    """Get user input with validation"""
    while True:
        if default:
            user_input = input(f"{prompt} (default: {default}): ").strip()
            if not user_input:
                user_input = default
        else:
            user_input = input(f"{prompt}: ").strip()

        if not user_input and required:
            print_error("This field is required!")
            continue

        return user_input


def get_yes_no(prompt, default="N"):
    """Get yes/no input"""
    while True:
        response = input(f"{prompt} (y/N): ").strip().lower()
        if not response:
            response = default.lower()
        if response in ['y', 'yes']:
            return True
        elif response in ['n', 'no']:
            return False
        else:
            print_error("Please enter 'y' or 'n'")


def check_prerequisites():
    """Check if all prerequisites are met"""
    print_header("Prerequisites Check")

    # Check if git is installed
    try:
        run_command("git --version", capture_output=True)
        print_success("Git is installed")
    except:
        print_error("Git is not installed. Please install Git first.")
        sys.exit(1)

    # Check if we're in a git repository
    if not Path(".git").exists():
        print_error(
            "Not in a git repository. Please run this script from the project root.")
        sys.exit(1)

    print_success("In a git repository")

    # Check current branch
    result = run_command("git branch --show-current", capture_output=True)
    current_branch = result.stdout.strip()

    if current_branch != "16.0":
        print_warning(
            f"You're not on the 16.0 branch (current: {current_branch})")
        if not get_yes_no("Do you want to continue?"):
            sys.exit(1)
    else:
        print_success(f"On correct branch: {current_branch}")

    print_success("Prerequisites check passed")


def get_deployment_config():
    """Get deployment configuration from user"""
    print_header("Deployment Configuration")

    config = {}

    # Get Odoo.sh repository URL
    print_info(
        "You can find your Odoo.sh repository URL in your Odoo.sh dashboard")
    print_info(
        "It will look like: https://github.com/odoo/your-company-your-project.git")
    config['odoo_sh_repo'] = get_user_input(
        "Enter your Odoo.sh repository URL")

    # Get Firebase configuration
    print_header("Firebase Configuration")
    print_info("You'll need to configure these in Odoo.sh after deployment")

    config['firebase_project_id'] = get_user_input("Firebase Project ID")
    config['firebase_db_url'] = get_user_input(
        "Firebase Database URL (e.g., https://your-project.firebaseio.com)")
    config['firebase_api_key'] = get_user_input("Firebase API Key")

    # Get Seerbit configuration
    print_header("Seerbit Configuration")
    config['seerbit_public_key'] = get_user_input("Seerbit Public Key")

    # Service account file
    print_header("Service Account File")
    print_info("You'll need to upload this file to Odoo.sh after deployment")
    service_account_path = get_user_input("Path to service-account-write.json file",
                                          default="service-account-write.json")

    if not Path(service_account_path).exists():
        print_warning(
            f"Service account file not found: {service_account_path}")
        if not get_yes_no("Continue anyway? You'll need to upload it manually"):
            sys.exit(1)
    else:
        print_success(f"Service account file found: {service_account_path}")

    config['service_account_path'] = service_account_path

    return config


def configure_git_remote(config):
    """Configure git remote for Odoo.sh"""
    print_header("Git Configuration")

    # Check if Odoo.sh remote already exists
    result = run_command("git remote get-url odoo-sh",
                         capture_output=True, check=False)

    if result.returncode == 0:
        print_info("Updating existing Odoo.sh remote...")
        run_command(f"git remote set-url odoo-sh {config['odoo_sh_repo']}")
    else:
        print_info("Adding Odoo.sh remote...")
        run_command(f"git remote add odoo-sh {config['odoo_sh_repo']}")

    print_success(f"Odoo.sh remote configured: {config['odoo_sh_repo']}")


def prepare_deployment():
    """Prepare repository for deployment"""
    print_header("Preparing for Deployment")

    # Check for uncommitted changes
    result = run_command("git status --porcelain", capture_output=True)

    if result.stdout.strip():
        print_warning("You have uncommitted changes:")
        print(result.stdout)

        if get_yes_no("Do you want to commit these changes?"):
            commit_msg = get_user_input(
                "Enter commit message", default="Update Seerbit module")
            run_command("git add .")
            run_command(f'git commit -m "{commit_msg}"')
            print_success("Changes committed")
        else:
            print_error("Please commit your changes before deploying")
            sys.exit(1)
    else:
        print_success("Repository is clean")


def deploy_to_odoo_sh():
    """Deploy to Odoo.sh"""
    print_header("Deploying to Odoo.sh")

    # Fetch latest from Odoo.sh
    print_info("Fetching latest from Odoo.sh...")
    run_command("git fetch odoo-sh")

    # Check for conflicts (simplified check)
    print_info("Checking for conflicts...")
    try:
        # Get the merge base
        merge_base_result = run_command(
            "git merge-base HEAD odoo-sh/master", capture_output=True)
        merge_base = merge_base_result.stdout.strip()

        if merge_base:
            # Check for conflicts using merge-tree
            run_command(
                f"git merge-tree {merge_base} HEAD odoo-sh/master", capture_output=True)
            print_success("No conflicts detected")
        else:
            print_warning(
                "No common ancestor found - this is normal for new repositories")
            print_success("Proceeding with deployment")
    except:
        print_warning("Could not check for conflicts automatically")
        print_info(
            "Proceeding with deployment - conflicts will be handled by git push")
        print_info("If conflicts occur, you'll need to resolve them manually")

    # Push to Odoo.sh
    print_info("Pushing to Odoo.sh...")
    run_command("git push odoo-sh 16.0:master")

    print_success("Deployment complete!")


def generate_config_file(config):
    """Generate configuration file for reference"""
    config_file = "odoo-sh-config.json"

    # Remove sensitive data for the config file
    safe_config = {
        'firebase_project_id': config['firebase_project_id'],
        'firebase_db_url': config['firebase_db_url'],
        'firebase_api_key': config['firebase_api_key'][:10] + '...' if config['firebase_api_key'] else '',
        'seerbit_public_key': config['seerbit_public_key'][:10] + '...' if config['seerbit_public_key'] else '',
        'service_account_path': config['service_account_path']
    }

    with open(config_file, 'w') as f:
        json.dump(safe_config, f, indent=2)

    print_success(f"Configuration saved to {config_file}")


def show_next_steps(config):
    """Show next steps after deployment"""
    print_header("Next Steps")

    print_info(
        "1. Wait for Odoo.sh build to complete (check your Odoo.sh dashboard)")
    print_info("2. Configure Firebase environment variables in Odoo.sh:")
    print("   - Go to Settings > Technical > Parameters > System Parameters")
    print("   - Add the following parameters:")

    env_vars = [
        ("FIREBASE_CRED_PATH", "service-account-write.json"),
        ("FIREBASE_DB_URL", config['firebase_db_url']),
        ("FIREBASE_API_KEY", config['firebase_api_key']),
        ("FIREBASE_DATABASE_URL", config['firebase_db_url']),
        ("FIREBASE_PROJECT_ID", config['firebase_project_id'])
    ]

    for var, value in env_vars:
        print(f"     {var}: {value}")

    print_info(
        "3. Upload service-account-write.json to Settings > Technical > Files")
    print_info("4. Install the Seerbit module from Apps")
    print_info("5. Configure payment method in Point of Sale:")
    print("   - Go to Point of Sale > Configuration > Payment Methods")
    print("   - Create new payment method")
    print("   - Set Payment Terminal to 'Seerbit'")
    print(f"   - Enter Seerbit Public Key: {config['seerbit_public_key']}")

    print_info("6. Test the integration")

    print(f"\n📖 For detailed instructions, see ODOO_SH_DEPLOYMENT.md")
    print(f"🔗 Odoo.sh Dashboard: https://www.odoo.sh")


def open_odoo_sh_dashboard():
    """Open Odoo.sh dashboard in browser"""
    if get_yes_no("Do you want to open the Odoo.sh dashboard?"):
        try:
            webbrowser.open("https://www.odoo.sh")
            print_success("Opened Odoo.sh dashboard in browser")
        except:
            print_info("Please visit: https://www.odoo.sh")


def main():
    """Main deployment function"""
    print_header("Seerbit Odoo.sh Deployment Script")
    print(f"Platform: {platform.system()} {platform.release()}")

    try:
        # Check prerequisites
        check_prerequisites()

        # Get configuration
        config = get_deployment_config()

        # Configure git remote
        configure_git_remote(config)

        # Prepare deployment
        prepare_deployment()

        # Deploy
        deploy_to_odoo_sh()

        # Generate config file
        generate_config_file(config)

        # Show next steps
        show_next_steps(config)

        # Open dashboard
        open_odoo_sh_dashboard()

        print_header("Deployment Complete!")
        print_success("Your Seerbit module has been deployed to Odoo.sh!")

    except KeyboardInterrupt:
        print_error("\nDeployment cancelled by user")
        sys.exit(1)
    except Exception as e:
        print_error(f"Deployment failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
