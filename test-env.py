#!/usr/bin/env python3
"""
Test Environment Verification Script
Verifies that all development tools and dependencies are properly installed
"""

import importlib
import os
import subprocess
import sys
from pathlib import Path


def check_python_version():
    """Check Python version"""
    print("🐍 Checking Python version...")
    version = sys.version_info
    if version.major == 3 and version.minor >= 8:
        print(f"✅ Python {version.major}.{version.minor}.{version.micro} - OK")
        return True
    else:
        print(
            f"❌ Python {version.major}.{version.minor}.{version.micro} - Need Python 3.8+")
        return False


def check_virtual_environment():
    """Check if running in virtual environment"""
    print("🔧 Checking virtual environment...")
    if hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
        print("✅ Running in virtual environment")
        return True
    else:
        print("⚠️  Not running in virtual environment (recommended but not required)")
        return True


def check_package(package_name, import_name=None):
    """Check if a package is installed"""
    if import_name is None:
        import_name = package_name

    try:
        importlib.import_module(import_name)
        print(f"✅ {package_name} - Installed")
        return True
    except ImportError:
        print(f"❌ {package_name} - Not installed")
        return False


def check_command(command, description):
    """Check if a command is available"""
    try:
        result = subprocess.run([command, '--version'],
                                capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            print(f"✅ {description} - Available")
            return True
        else:
            print(f"❌ {description} - Not working properly")
            return False
    except (subprocess.TimeoutExpired, FileNotFoundError):
        print(f"❌ {description} - Not found")
        return False


def check_file_structure():
    """Check if required files and directories exist"""
    print("📁 Checking file structure...")

    required_files = [
        "pos_seerbit/__manifest__.py",
        "pos_seerbit/__init__.py",
        "pos_seerbit/models/__init__.py",
        "pos_seerbit/controllers/__init__.py",
        "requirements-dev.txt",
        "pytest.ini",
        "pyproject.toml",
        ".gitignore"
    ]

    required_dirs = [
        "pos_seerbit/models",
        "pos_seerbit/controllers",
        "pos_seerbit/views",
        "pos_seerbit/data",
        "pos_seerbit/static",
        "tests"
    ]

    all_good = True

    for file_path in required_files:
        if os.path.exists(file_path):
            print(f"✅ {file_path} - Exists")
        else:
            print(f"❌ {file_path} - Missing")
            all_good = False

    for dir_path in required_dirs:
        if os.path.isdir(dir_path):
            print(f"✅ {dir_path}/ - Exists")
        else:
            print(f"❌ {dir_path}/ - Missing")
            all_good = False

    return all_good


def check_manifest_structure():
    """Check if manifest file has required structure"""
    print("📋 Checking manifest structure...")

    try:
        with open("pos_seerbit/__manifest__.py", 'r') as f:
            content = f.read()

        required_fields = ['name', 'version', 'depends', 'data', 'assets']
        missing_fields = []

        for field in required_fields:
            if field not in content:
                missing_fields.append(field)

        if missing_fields:
            print(f"❌ Missing fields in manifest: {', '.join(missing_fields)}")
            return False
        else:
            print("✅ Manifest structure - OK")
            return True

    except Exception as e:
        print(f"❌ Error reading manifest: {e}")
        return False


def run_quick_tests():
    """Run a quick test to verify everything works"""
    print("🧪 Running quick tests...")

    # Test XML parsing
    try:
        import xml.etree.ElementTree as ET
        ET.parse("pos_seerbit/data/account_journal.xml")
        print("✅ XML parsing - OK")
    except Exception as e:
        print(f"❌ XML parsing failed: {e}")
        return False

    # Test CSV reading
    try:
        with open("pos_seerbit/data/pos.payment.method.csv", 'r') as f:
            lines = f.readlines()
            if len(lines) >= 2:
                print("✅ CSV reading - OK")
            else:
                print("❌ CSV file seems empty")
                return False
    except Exception as e:
        print(f"❌ CSV reading failed: {e}")
        return False

    return True


def check_development_tools():
    """Check if development tools are working"""
    print("🛠️  Checking development tools...")

    tools = [
        ("pylint", "pylint --version"),
        ("flake8", "flake8 --version"),
        ("black", "black --version"),
        ("isort", "isort --version"),
        ("pytest", "pytest --version")
    ]

    all_good = True
    for tool_name, command in tools:
        try:
            result = subprocess.run(command.split(),
                                    capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                print(f"✅ {tool_name} - Working")
            else:
                print(f"❌ {tool_name} - Not working")
                all_good = False
        except Exception as e:
            print(f"❌ {tool_name} - Error: {e}")
            all_good = False

    return all_good


def main():
    """Main verification function"""
    print("🚀 Seerbit Odoo Module - Environment Verification")
    print("=" * 60)

    checks = [
        ("Python Version", check_python_version),
        ("Virtual Environment", check_virtual_environment),
        ("File Structure", check_file_structure),
        ("Manifest Structure", check_manifest_structure),
        ("Development Tools", check_development_tools),
        ("Quick Tests", run_quick_tests)
    ]

    results = []
    for check_name, check_func in checks:
        print(f"\n{check_name}:")
        print("-" * 40)
        result = check_func()
        results.append((check_name, result))

    # Summary
    print("\n" + "=" * 60)
    print("📊 VERIFICATION SUMMARY")
    print("=" * 60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for check_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {check_name}")

    print(f"\nOverall: {passed}/{total} checks passed")

    if passed == total:
        print("\n🎉 Environment is ready for development!")
        print("\nNext steps:")
        print("1. Activate virtual environment: venv\\Scripts\\activate.bat")
        print("2. Run development tools: python dev-tools.py all")
        print("3. Start coding in pos_seerbit/")
    else:
        print(
            f"\n⚠️  {total - passed} issues found. Please fix them before proceeding.")
        print("\nTo fix issues:")
        print("1. Run: setup-dev.bat")
        print("2. Install missing packages: pip install -r requirements-dev.txt")
        print("3. Re-run this verification: python test-env.py")


if __name__ == "__main__":
    main()
