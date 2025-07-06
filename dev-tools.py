#!/usr/bin/env python3
"""
Development tools for pos_seerbit module
Run without Odoo installation for development and testing
"""

import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def run_command(cmd, description):
    """Run a command and handle errors"""
    print(f"\n🔄 {description}...")
    try:
        result = subprocess.run(
            cmd, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed successfully")
        if result.stdout:
            print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed:")
        print(f"Error: {e.stderr}")
        return False


def validate_xml_files():
    """Validate XML syntax in the module"""
    print("\n🔍 Validating XML files...")
    xml_files = [
        "pos_seerbit/views/res_config_settings_views.xml",
        "pos_seerbit/views/pos_payment_method_views.xml",
        "pos_seerbit/static/src/xml/PaymentScreenPaymentLines.xml",
        "pos_seerbit/data/account_journal.xml"
    ]

    for xml_file in xml_files:
        if os.path.exists(xml_file):
            try:
                ET.parse(xml_file)
                print(f"✅ {xml_file} - Valid XML")
            except ET.ParseError as e:
                print(f"❌ {xml_file} - Invalid XML: {e}")
                return False
        else:
            print(f"⚠️  {xml_file} - File not found")

    return True


def validate_csv_files():
    """Validate CSV format"""
    print("\n🔍 Validating CSV files...")
    csv_file = "pos_seerbit/data/pos.payment.method.csv"

    if os.path.exists(csv_file):
        try:
            with open(csv_file, 'r') as f:
                lines = f.readlines()
                if len(lines) >= 2:  # Header + at least one data row
                    print(f"✅ {csv_file} - Valid CSV format")
                    return True
                else:
                    print(f"❌ {csv_file} - Empty or invalid CSV")
                    return False
        except Exception as e:
            print(f"❌ {csv_file} - Error reading file: {e}")
            return False
    else:
        print(f"⚠️  {csv_file} - File not found")
        return False


def check_python_syntax():
    """Check Python syntax without importing"""
    print("\n🔍 Checking Python syntax...")
    python_files = []

    # Find all Python files
    for root, dirs, files in os.walk("pos_seerbit"):
        for file in files:
            if file.endswith(".py"):
                python_files.append(os.path.join(root, file))

    for py_file in python_files:
        try:
            with open(py_file, 'r') as f:
                compile(f.read(), py_file, 'exec')
            print(f"✅ {py_file} - Valid syntax")
        except SyntaxError as e:
            print(f"❌ {py_file} - Syntax error: {e}")
            return False

    return True


def run_linting():
    """Run code linting tools"""
    print("\n🔍 Running linting tools...")

    # Check if tools are installed
    tools = [
        ("pylint", "pylint pos_seerbit/"),
        ("flake8", "flake8 pos_seerbit/"),
        ("black", "black --check pos_seerbit/"),
        ("isort", "isort --check-only pos_seerbit/")
    ]

    all_passed = True
    for tool_name, command in tools:
        if run_command(command, f"Running {tool_name}"):
            print(f"✅ {tool_name} passed")
        else:
            print(f"❌ {tool_name} failed")
            all_passed = False

    return all_passed


def run_tests():
    """Run unit tests"""
    print("\n🧪 Running tests...")
    return run_command("pytest tests/ -v", "Running unit tests")


def format_code():
    """Format code using black and isort"""
    print("\n🎨 Formatting code...")

    success1 = run_command("black pos_seerbit/", "Formatting with black")
    success2 = run_command("isort pos_seerbit/", "Sorting imports with isort")

    return success1 and success2


def check_manifest():
    """Validate manifest file"""
    print("\n📋 Checking manifest file...")
    manifest_file = "pos_seerbit/__manifest__.py"

    if not os.path.exists(manifest_file):
        print(f"❌ {manifest_file} not found")
        return False

    try:
        # Read and try to evaluate the manifest
        with open(manifest_file, 'r') as f:
            content = f.read()
            # Simple validation - check if it's valid Python dict
            if 'name' in content and 'version' in content and 'depends' in content:
                print(f"✅ {manifest_file} - Valid manifest structure")
                return True
            else:
                print(f"❌ {manifest_file} - Missing required fields")
                return False
    except Exception as e:
        print(f"❌ {manifest_file} - Error reading file: {e}")
        return False


def main():
    """Main development workflow"""
    print("🚀 Seerbit Odoo Module Development Tools")
    print("=" * 50)

    if len(sys.argv) > 1:
        command = sys.argv[1]

        if command == "lint":
            run_linting()
        elif command == "test":
            run_tests()
        elif command == "format":
            format_code()
        elif command == "validate":
            validate_xml_files()
            validate_csv_files()
            check_python_syntax()
            check_manifest()
        elif command == "all":
            print("Running all checks...")
            format_code()
            validate_xml_files()
            validate_csv_files()
            check_python_syntax()
            check_manifest()
            run_linting()
            run_tests()
        else:
            print(f"Unknown command: {command}")
            print_usage()
    else:
        print_usage()


def print_usage():
    """Print usage information"""
    print("\nUsage: python dev-tools.py [command]")
    print("\nCommands:")
    print("  lint     - Run code linting (pylint, flake8, black, isort)")
    print("  test     - Run unit tests")
    print("  format   - Format code with black and isort")
    print("  validate - Validate XML, CSV, and Python syntax")
    print("  all      - Run all checks and formatting")
    print("\nExample: python dev-tools.py all")


if __name__ == "__main__":
    main()
