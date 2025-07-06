"""
Tests for the new configuration architecture.
These tests verify that configuration is properly managed through Odoo settings.
"""

import json
import pytest
from unittest.mock import patch, MagicMock


class TestResConfigSettings:
    """Test the ResConfigSettings model for Seerbit configuration"""

    def test_get_firebase_config_for_frontend(self, env):
        """Test getting Firebase config for frontend"""
        # Create a mock config parameter
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

    def test_get_firebase_config_for_backend(self, env):
        """Test getting Firebase config for backend"""
        # Create a mock config parameter
        config_param = env['ir.config_parameter'].sudo()
        config_param.set_param('pos_seerbit.seerbit_firebase_cred', '{"type": "service_account"}')
        config_param.set_param('pos_seerbit.seerbit_firebase_db_url', 'https://test-project.firebaseio.com')

        # Get config from settings
        settings = env['res.config.settings'].sudo()
        config = settings.get_firebase_config_for_backend()

        assert config['credJson'] == '{"type": "service_account"}'
        assert config['databaseURL'] == 'https://test-project.firebaseio.com'

    def test_validate_firebase_config_success(self, env):
        """Test Firebase config validation with valid config"""
        # Create a mock config parameter with valid data
        config_param = env['ir.config_parameter'].sudo()
        config_param.set_param('pos_seerbit.seerbit_firebase_cred', '{"type": "service_account", "project_id": "test"}')
        config_param.set_param('pos_seerbit.seerbit_firebase_db_url', 'https://test-project.firebaseio.com')

        # Validate config
        settings = env['res.config.settings'].sudo()
        result = settings.validate_firebase_config()

        assert result['status'] == 'success'
        assert 'valid' in result['message']

    def test_validate_firebase_config_missing_cred(self, env):
        """Test Firebase config validation with missing credentials"""
        # Create a mock config parameter with missing credentials
        config_param = env['ir.config_parameter'].sudo()
        config_param.set_param('pos_seerbit.seerbit_firebase_cred', '')
        config_param.set_param('pos_seerbit.seerbit_firebase_db_url', 'https://test-project.firebaseio.com')

        # Validate config
        settings = env['res.config.settings'].sudo()
        result = settings.validate_firebase_config()

        assert result['status'] == 'error'
        assert 'required' in result['message']

    def test_validate_firebase_config_invalid_json(self, env):
        """Test Firebase config validation with invalid JSON"""
        # Create a mock config parameter with invalid JSON
        config_param = env['ir.config_parameter'].sudo()
        config_param.set_param('pos_seerbit.seerbit_firebase_cred', 'invalid json')
        config_param.set_param('pos_seerbit.seerbit_firebase_db_url', 'https://test-project.firebaseio.com')

        # Validate config
        settings = env['res.config.settings'].sudo()
        result = settings.validate_firebase_config()

        assert result['status'] == 'error'
        assert 'Invalid JSON format' in result['message']

    def test_validate_firebase_config_invalid_url(self, env):
        """Test Firebase config validation with invalid URL"""
        # Create a mock config parameter with invalid URL
        config_param = env['ir.config_parameter'].sudo()
        config_param.set_param('pos_seerbit.seerbit_firebase_cred', '{"type": "service_account"}')
        config_param.set_param('pos_seerbit.seerbit_firebase_db_url', 'http://invalid-url.com')

        # Validate config
        settings = env['res.config.settings'].sudo()
        result = settings.validate_firebase_config()

        assert result['status'] == 'error'
        assert 'must start with https://' in result['message']


class TestPosPaymentMethod:
    """Test the PosPaymentMethod model with new configuration"""

    def test_get_firebase_config(self, env):
        """Test getting Firebase config from payment method"""
        # Create a mock config parameter
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

    @patch('pos_seerbit.models.pos_payment_method.FIREBASE_AVAILABLE', True)
    @patch('pos_seerbit.models.pos_payment_method.firebase_admin')
    def test_firebase_initialization_success(self, mock_firebase_admin, env):
        """Test successful Firebase initialization"""
        # Create a mock config parameter
        config_param = env['ir.config_parameter'].sudo()
        config_param.set_param('pos_seerbit.seerbit_firebase_cred', '{"type": "service_account"}')
        config_param.set_param('pos_seerbit.seerbit_firebase_db_url', 'https://test-project.firebaseio.com')

        # Mock Firebase components
        mock_cred = MagicMock()
        mock_firebase_admin.credentials.Certificate.return_value = mock_cred
        mock_firebase_admin._apps = {}

        # Import and test initialization
        from pos_seerbit.models.pos_payment_method import initialize_firebase
        result = initialize_firebase(env)

        assert result is True
        mock_firebase_admin.initialize_app.assert_called_once()

    @patch('pos_seerbit.models.pos_payment_method.FIREBASE_AVAILABLE', False)
    def test_firebase_initialization_not_available(self, env):
        """Test Firebase initialization when Firebase is not available"""
        from pos_seerbit.models.pos_payment_method import initialize_firebase
        result = initialize_firebase(env)

        assert result is False

    def test_firebase_initialization_missing_config(self, env):
        """Test Firebase initialization with missing configuration"""
        from pos_seerbit.models.pos_payment_method import initialize_firebase
        result = initialize_firebase(env)

        assert result is False


class TestSeerbitController:
    """Test the Seerbit controller with new configuration"""

    def test_get_config_endpoint(self, client):
        """Test the /pos_seerbit/config endpoint"""
        # Mock the configuration
        with patch('pos_seerbit.controllers.main.request') as mock_request:
            mock_env = MagicMock()
            mock_settings = MagicMock()
            mock_settings.get_firebase_config_for_frontend.return_value = {
                'apiKey': 'test-key',
                'databaseURL': 'https://test.firebaseio.com',
                'projectId': 'test-project'
            }
            mock_env.__getitem__.return_value.sudo.return_value = mock_settings
            mock_request.env = mock_env

            # Make request
            response = client.get('/pos_seerbit/config')
            
            assert response.status_code == 200
            data = json.loads(response.data)
            assert 'firebase_config' in data
            assert data['firebase_config']['apiKey'] == 'test-key'

    def test_validate_config_endpoint(self, client):
        """Test the /pos_seerbit/validate_config endpoint"""
        # Mock the configuration validation
        with patch('pos_seerbit.controllers.main.request') as mock_request:
            mock_env = MagicMock()
            mock_settings = MagicMock()
            mock_settings.validate_firebase_config.return_value = {
                'status': 'success',
                'message': 'Firebase configuration is valid'
            }
            mock_env.__getitem__.return_value.sudo.return_value = mock_settings
            mock_request.env = mock_env

            # Make request
            response = client.post('/pos_seerbit/validate_config')
            
            assert response.status_code == 200
            data = json.loads(response.data)
            assert data['status'] == 'success'


class TestConfigurationValidation:
    """Test configuration validation constraints"""

    def test_validate_firebase_cred_json_format(self, env):
        """Test Firebase credentials JSON format validation"""
        settings = env['res.config.settings'].sudo()
        
        # Test with valid JSON
        settings.seerbit_firebase_cred = '{"type": "service_account", "project_id": "test"}'
        settings.module_pos_seerbit = True
        settings._validate_firebase_cred()  # Should not raise exception

        # Test with invalid JSON
        settings.seerbit_firebase_cred = 'invalid json'
        with pytest.raises(Exception) as exc_info:
            settings._validate_firebase_cred()
        assert 'Invalid JSON format' in str(exc_info.value)

    def test_validate_firebase_db_url_format(self, env):
        """Test Firebase database URL format validation"""
        settings = env['res.config.settings'].sudo()
        
        # Test with valid URL
        settings.seerbit_firebase_db_url = 'https://test-project.firebaseio.com'
        settings.module_pos_seerbit = True
        settings._validate_firebase_db_url()  # Should not raise exception

        # Test with invalid URL
        settings.seerbit_firebase_db_url = 'http://test-project.firebaseio.com'
        with pytest.raises(Exception) as exc_info:
            settings._validate_firebase_db_url()
        assert 'must start with https://' in str(exc_info.value)

    def test_validation_only_when_module_enabled(self, env):
        """Test that validation only occurs when module is enabled"""
        settings = env['res.config.settings'].sudo()
        
        # Test with module disabled - should not validate
        settings.seerbit_firebase_cred = 'invalid json'
        settings.seerbit_firebase_db_url = 'http://invalid-url.com'
        settings.module_pos_seerbit = False
        
        # Should not raise exceptions when module is disabled
        settings._validate_firebase_cred()
        settings._validate_firebase_db_url() 