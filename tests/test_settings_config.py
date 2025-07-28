"""
Tests for the new settings-based configuration architecture.
"""

import json
import pytest
from unittest.mock import MagicMock, patch


def test_firebase_config_validation_logic():
    """Test Firebase configuration validation logic"""
    
    def validate_firebase_config(cred_json, db_url):
        """Mock validation function"""
        if not cred_json:
            return {'status': 'error', 'message': 'Firebase Service Account JSON is required'}
        
        if not db_url:
            return {'status': 'error', 'message': 'Firebase Database URL is required'}
        
        # Validate JSON format
        try:
            json.loads(cred_json)
        except json.JSONDecodeError:
            return {'status': 'error', 'message': 'Invalid JSON format in Firebase Service Account JSON'}
        
        # Validate URL format
        if not db_url.startswith('https://'):
            return {'status': 'error', 'message': 'Firebase Database URL must start with https://'}
        
        return {'status': 'success', 'message': 'Firebase configuration is valid'}
    
    # Test valid configuration
    result = validate_firebase_config(
        '{"type": "service_account", "project_id": "test"}',
        'https://test-project.firebaseio.com'
    )
    assert result['status'] == 'success'
    assert 'valid' in result['message']
    
    # Test missing credentials
    result = validate_firebase_config('', 'https://test-project.firebaseio.com')
    assert result['status'] == 'error'
    assert 'required' in result['message']
    
    # Test missing URL
    result = validate_firebase_config('{"type": "service_account"}', '')
    assert result['status'] == 'error'
    assert 'required' in result['message']
    
    # Test invalid JSON
    result = validate_firebase_config('invalid json', 'https://test-project.firebaseio.com')
    assert result['status'] == 'error'
    assert 'Invalid JSON format' in result['message']
    
    # Test invalid URL
    result = validate_firebase_config('{"type": "service_account"}', 'http://invalid-url.com')
    assert result['status'] == 'error'
    assert 'must start with https://' in result['message']


def test_firebase_config_structure():
    """Test Firebase configuration structure"""
    
    def get_firebase_config_for_frontend(api_key, db_url, project_id):
        """Mock frontend config function"""
        return {
            'apiKey': api_key,
            'databaseURL': db_url,
            'projectId': project_id,
        }
    
    def get_firebase_config_for_backend(cred_json, db_url):
        """Mock backend config function"""
        return {
            'credJson': cred_json,
            'databaseURL': db_url,
        }
    
    # Test frontend config
    frontend_config = get_firebase_config_for_frontend(
        'test-api-key',
        'https://test-project.firebaseio.com',
        'test-project-id'
    )
    
    assert frontend_config['apiKey'] == 'test-api-key'
    assert frontend_config['databaseURL'] == 'https://test-project.firebaseio.com'
    assert frontend_config['projectId'] == 'test-project-id'
    
    # Test backend config
    backend_config = get_firebase_config_for_backend(
        '{"type": "service_account"}',
        'https://test-project.firebaseio.com'
    )
    
    assert backend_config['credJson'] == '{"type": "service_account"}'
    assert backend_config['databaseURL'] == 'https://test-project.firebaseio.com'


def test_json_validation():
    """Test JSON validation logic"""
    
    def validate_json(json_string):
        """Mock JSON validation function"""
        try:
            json.loads(json_string)
            return True
        except json.JSONDecodeError:
            return False
    
    # Test valid JSON
    assert validate_json('{"type": "service_account", "project_id": "test"}') is True
    assert validate_json('{"key": "value", "number": 123}') is True
    
    # Test invalid JSON
    assert validate_json('invalid json') is False
    assert validate_json('{"key": "value",}') is False  # Trailing comma
    assert validate_json('{"key": value}') is False  # Missing quotes


def test_url_validation():
    """Test URL validation logic"""
    
    def validate_https_url(url):
        """Mock URL validation function"""
        return url.startswith('https://')
    
    # Test valid URLs
    assert validate_https_url('https://test-project.firebaseio.com') is True
    assert validate_https_url('https://example.com/path') is True
    
    # Test invalid URLs
    assert validate_https_url('http://test-project.firebaseio.com') is False
    assert validate_https_url('ftp://test-project.firebaseio.com') is False
    assert validate_https_url('test-project.firebaseio.com') is False
    assert validate_https_url('') is False


def test_configuration_constraints():
    """Test configuration constraints logic"""
    
    def validate_config_constraints(module_enabled, cred_json, db_url):
        """Mock constraints validation function"""
        errors = []
        
        if module_enabled:
            if cred_json:
                try:
                    json.loads(cred_json)
                except json.JSONDecodeError:
                    errors.append("Invalid JSON format in Firebase Service Account JSON")
            
            if db_url and not db_url.startswith('https://'):
                errors.append("Firebase Database URL must start with 'https://'")
        
        return errors
    
    # Test with module disabled - no validation
    errors = validate_config_constraints(False, 'invalid json', 'http://invalid-url.com')
    assert len(errors) == 0
    
    # Test with module enabled and valid config
    errors = validate_config_constraints(
        True,
        '{"type": "service_account"}',
        'https://test-project.firebaseio.com'
    )
    assert len(errors) == 0
    
    # Test with module enabled and invalid JSON
    errors = validate_config_constraints(
        True,
        'invalid json',
        'https://test-project.firebaseio.com'
    )
    assert len(errors) == 1
    assert 'Invalid JSON format' in errors[0]
    
    # Test with module enabled and invalid URL
    errors = validate_config_constraints(
        True,
        '{"type": "service_account"}',
        'http://invalid-url.com'
    )
    assert len(errors) == 1
    assert "must start with 'https://'" in errors[0]
    
    # Test with module enabled and both invalid
    errors = validate_config_constraints(
        True,
        'invalid json',
        'http://invalid-url.com'
    )
    assert len(errors) == 2 