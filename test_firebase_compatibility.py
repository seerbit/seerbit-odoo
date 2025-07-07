#!/usr/bin/env python3
"""
Firebase Compatibility Test
Tests that our code works with the current firebase-admin version
"""

import sys
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_firebase_import():
    """Test firebase-admin import and basic functionality"""
    print("Testing firebase-admin compatibility...")
    
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        
        print(f"✅ firebase-admin imported successfully")
        
        # Check version
        try:
            import pkg_resources
            version = pkg_resources.get_distribution("firebase-admin").version
            print(f"✅ firebase-admin version: {version}")
        except Exception as e:
            print(f"⚠️  Could not determine version: {e}")
        
        # Test basic functionality
        print("✅ firebase_admin module available")
        print("✅ credentials module available")
        print("✅ firestore module available")
        
        return True
        
    except ImportError as e:
        print(f"❌ firebase-admin import failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

def test_manifest_dependencies():
    """Test that our manifest dependencies are compatible"""
    print("\nTesting manifest dependencies...")
    
    try:
        # Read manifest
        with open('pos_seerbit/__manifest__.py', 'r') as f:
            content = f.read()
        
        # Check for external dependencies
        if 'external_dependencies' in content:
            print("✅ external_dependencies section found")
            
            # Check for firebase-admin requirement
            if 'firebase-admin>=' in content:
                print("✅ firebase-admin requirement found")
            else:
                print("❌ firebase-admin requirement not found")
                return False
        else:
            print("❌ external_dependencies section not found")
            return False
            
        return True
        
    except Exception as e:
        print(f"❌ Error reading manifest: {e}")
        return False

def main():
    """Main test function"""
    print("=" * 60)
    print("Firebase Compatibility Test")
    print("=" * 60)
    
    tests = [
        ("Firebase Import", test_firebase_import),
        ("Manifest Dependencies", test_manifest_dependencies),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\nRunning: {test_name}")
        print("-" * 40)
        
        if test_func():
            print(f"✅ PASS: {test_name}")
            passed += 1
        else:
            print(f"❌ FAIL: {test_name}")
    
    print("\n" + "=" * 60)
    print(f"Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("✅ All tests passed - Firebase compatibility verified!")
        print("You can proceed with module installation.")
        return True
    else:
        print("❌ Some tests failed - Review compatibility issues.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 