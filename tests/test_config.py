"""
Tests for configuration management.
These tests verify that environment variables are loaded correctly.
"""

import json
import os
import tempfile

import pytest


def test_get_env_var_with_default():
    """Test getting environment variable with default value"""
    # Test with non-existent variable
    from pos_seerbit.config import get_env_var
    result = get_env_var('NON_EXISTENT_VAR', 'default_value')
    assert result == 'default_value'


def test_get_env_var_with_actual_value():
    """Test getting environment variable with actual value"""
    from pos_seerbit.config import get_env_var

    # Set a test environment variable
    os.environ['TEST_VAR'] = 'test_value'
    try:
        result = get_env_var('TEST_VAR', 'default_value')
        assert result == 'test_value'
    finally:
        # Clean up
        del os.environ['TEST_VAR']


def test_get_env_var_required():
    """Test getting required environment variable"""
    from pos_seerbit.config import get_env_var

    # Test that it raises ValueError when required but not set
    with pytest.raises(ValueError):
        get_env_var('REQUIRED_VAR', required=True)


def test_seerbit_config_defaults():
    """Test that SeerbitConfig has default values"""
    from pos_seerbit.config import SeerbitConfig

    # Test that default values are set
    assert SeerbitConfig.FIREBASE_CRED_PATH == 'service-account-write.json'
    assert SeerbitConfig.FIREBASE_DB_URL == 'https://your-firebase-db.firebaseio.com'
    assert SeerbitConfig.FIREBASE_API_KEY == 'YOUR_READONLY_API_KEY'
    assert SeerbitConfig.FIREBASE_DATABASE_URL == 'YOUR_DATABASE_URL'
    assert SeerbitConfig.FIREBASE_PROJECT_ID == 'YOUR_PROJECT_ID'


def test_firebase_config_for_frontend():
    """Test getting Firebase config for frontend"""
    from pos_seerbit.config import SeerbitConfig

    config = SeerbitConfig.get_firebase_config_for_frontend()

    assert 'apiKey' in config
    assert 'databaseURL' in config
    assert 'projectId' in config

    assert config['apiKey'] == SeerbitConfig.FIREBASE_API_KEY
    assert config['databaseURL'] == SeerbitConfig.FIREBASE_DATABASE_URL
    assert config['projectId'] == SeerbitConfig.FIREBASE_PROJECT_ID


def test_firebase_config_for_backend():
    """Test getting Firebase config for backend"""
    from pos_seerbit.config import SeerbitConfig

    config = SeerbitConfig.get_firebase_config_for_backend()

    assert 'credPath' in config
    assert 'databaseURL' in config

    assert config['credPath'] == SeerbitConfig.FIREBASE_CRED_PATH
    assert config['databaseURL'] == SeerbitConfig.FIREBASE_DB_URL


def test_config_validation_with_defaults():
    """Test config validation with default values (should fail)"""
    from pos_seerbit.config import SeerbitConfig

    # With default values, validation should fail
    with pytest.raises(ValueError) as exc_info:
        SeerbitConfig.validate_config()

    assert "Missing or invalid configuration" in str(exc_info.value)


def test_config_validation_with_real_values():
    """Test config validation with real values"""
    from pos_seerbit.config import SeerbitConfig

    # Set real values temporarily
    original_values = {
        'FIREBASE_DB_URL': SeerbitConfig.FIREBASE_DB_URL,
        'FIREBASE_API_KEY': SeerbitConfig.FIREBASE_API_KEY,
        'FIREBASE_DATABASE_URL': SeerbitConfig.FIREBASE_DATABASE_URL,
        'FIREBASE_PROJECT_ID': SeerbitConfig.FIREBASE_PROJECT_ID,
    }

    try:
        # Set real values
        os.environ['FIREBASE_DB_URL'] = 'https://real-project.firebaseio.com'
        os.environ['FIREBASE_API_KEY'] = 'real-api-key'
        os.environ['FIREBASE_DATABASE_URL'] = 'https://real-project.firebaseio.com'
        os.environ['FIREBASE_PROJECT_ID'] = 'real-project-id'

        # Reload config
        from importlib import reload

        import pos_seerbit.config
        reload(pos_seerbit.config)

        # Validation should pass
        pos_seerbit.config.SeerbitConfig.validate_config()

    finally:
        # Restore original values
        for key, value in original_values.items():
            if key in os.environ:
                del os.environ[key]

        # Reload config to restore defaults
        from importlib import reload

        import pos_seerbit.config
        reload(pos_seerbit.config)


def test_env_file_loading():
    """Test loading configuration from .env file"""
    from pos_seerbit.config import get_env_var

    # Create a temporary .env file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.env', delete=False) as f:
        f.write("TEST_VAR_FROM_FILE=file_value\n")
        f.write("ANOTHER_VAR=another_value\n")
        env_file = f.name

    try:
        # Load the .env file
        from dotenv import load_dotenv
        load_dotenv(env_file)

        # Test that variables are loaded
        result = get_env_var('TEST_VAR_FROM_FILE', 'default')
        assert result == 'file_value'

        result = get_env_var('ANOTHER_VAR', 'default')
        assert result == 'another_value'

    except ImportError:
        # python-dotenv not installed, skip this test
        pytest.skip("python-dotenv not installed")
    finally:
        # Clean up
        os.unlink(env_file)
        if 'TEST_VAR_FROM_FILE' in os.environ:
            del os.environ['TEST_VAR_FROM_FILE']
        if 'ANOTHER_VAR' in os.environ:
            del os.environ['ANOTHER_VAR']
