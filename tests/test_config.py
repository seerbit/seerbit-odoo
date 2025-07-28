"""
Tests for configuration management.
These tests verify that settings-based configuration works correctly.
"""

import json
import os
import tempfile

import pytest


def test_get_firebase_config_for_frontend(env):
    """Test getting Firebase config for frontend from settings"""
    # Set up test configuration
    config_param = env['ir.config_parameter'].sudo()
    config_param.set_param('pos_seerbit.seerbit_firebase_api_key', 'test-api-key')
    config_param.set_param('pos_seerbit.seerbit_firebase_db_url', 'https://test-project.firebaseio.com')
    config_param.set_param('pos_seerbit.seerbit_firebase_project_id', 'test-project-id')

    # Get config from settings
    settings = env['res.config.settings'].sudo()
    config = settings.get_firebase_config_for_frontend()

    assert config['apiKey'] == 'test-api-key'
    assert config['databaseURL'] == 'https://test-project.firebaseio.com'
    assert config['projectId'] == 'test-project-id'


def test_get_firebase_config_for_backend(env):
    """Test getting Firebase config for backend from settings"""
    # Set up test configuration
    config_param = env['ir.config_parameter'].sudo()
    config_param.set_param('pos_seerbit.seerbit_firebase_cred', '{"type": "service_account"}')
    config_param.set_param('pos_seerbit.seerbit_firebase_db_url', 'https://test-project.firebaseio.com')

    # Get config from settings
    settings = env['res.config.settings'].sudo()
    config = settings.get_firebase_config_for_backend()

    assert config['credJson'] == '{"type": "service_account"}'
    assert config['databaseURL'] == 'https://test-project.firebaseio.com'


def test_validate_firebase_config_success(env):
    """Test Firebase config validation with valid config"""
    # Set up valid configuration
    config_param = env['ir.config_parameter'].sudo()
    config_param.set_param('pos_seerbit.seerbit_firebase_cred', '{"type": "service_account", "project_id": "test"}')
    config_param.set_param('pos_seerbit.seerbit_firebase_db_url', 'https://test-project.firebaseio.com')

    # Validate config
    settings = env['res.config.settings'].sudo()
    result = settings.validate_firebase_config()

    assert result['status'] == 'success'
    assert 'valid' in result['message']


def test_validate_firebase_config_missing_cred(env):
    """Test Firebase config validation with missing credentials"""
    # Set up configuration with missing credentials
    config_param = env['ir.config_parameter'].sudo()
    config_param.set_param('pos_seerbit.seerbit_firebase_cred', '')
    config_param.set_param('pos_seerbit.seerbit_firebase_db_url', 'https://test-project.firebaseio.com')

    # Validate config
    settings = env['res.config.settings'].sudo()
    result = settings.validate_firebase_config()

    assert result['status'] == 'error'
    assert 'required' in result['message']


def test_validate_firebase_config_invalid_json(env):
    """Test Firebase config validation with invalid JSON"""
    # Set up configuration with invalid JSON
    config_param = env['ir.config_parameter'].sudo()
    config_param.set_param('pos_seerbit.seerbit_firebase_cred', 'invalid json')
    config_param.set_param('pos_seerbit.seerbit_firebase_db_url', 'https://test-project.firebaseio.com')

    # Validate config
    settings = env['res.config.settings'].sudo()
    result = settings.validate_firebase_config()

    assert result['status'] == 'error'
    assert 'Invalid JSON format' in result['message']


def test_payment_method_get_firebase_config(env):
    """Test getting Firebase config from payment method"""
    # Set up test configuration
    config_param = env['ir.config_parameter'].sudo()
    config_param.set_param('pos_seerbit.seerbit_firebase_api_key', 'test-api-key')
    config_param.set_param('pos_seerbit.seerbit_firebase_db_url', 'https://test-project.firebaseio.com')
    config_param.set_param('pos_seerbit.seerbit_firebase_project_id', 'test-project-id')

    # Get config from payment method
    payment_method = env['pos.payment.method'].sudo()
    config = payment_method.get_firebase_config()

    assert config['apiKey'] == 'test-api-key'
    assert config['databaseURL'] == 'https://test-project.firebaseio.com'
    assert config['projectId'] == 'test-project-id'


def test_settings_save_and_load(env):
    """Test that settings are properly saved and loaded"""
    # Create settings record
    settings = env['res.config.settings'].sudo().create({
        'seerbit_firebase_api_key': 'test-api-key',
        'seerbit_firebase_db_url': 'https://test-project.firebaseio.com',
        'seerbit_firebase_project_id': 'test-project-id',
        'seerbit_firebase_cred': '{"type": "service_account"}',
    })

    # Save settings
    settings.set_values()

    # Load settings
    loaded_settings = env['res.config.settings'].sudo().create({})
    values = loaded_settings.get_values()

    assert values['seerbit_firebase_api_key'] == 'test-api-key'
    assert values['seerbit_firebase_db_url'] == 'https://test-project.firebaseio.com'
    assert values['seerbit_firebase_project_id'] == 'test-project-id'
    assert values['seerbit_firebase_cred'] == '{"type": "service_account"}'


def test_configuration_constraints(env):
    """Test configuration constraints validation"""
    settings = env['res.config.settings'].sudo().create({
        'module_pos_seerbit': True,
        'seerbit_firebase_cred': 'invalid json',
        'seerbit_firebase_db_url': 'http://invalid-url.com',
    })

    # Test validation constraints
    with pytest.raises(Exception) as exc_info:
        settings._validate_firebase_cred()
    assert 'Invalid JSON format' in str(exc_info.value)

    with pytest.raises(Exception) as exc_info:
        settings._validate_firebase_db_url()
    assert "must start with 'https://'" in str(exc_info.value)
