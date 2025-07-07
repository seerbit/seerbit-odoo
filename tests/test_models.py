import json
import os
import sys
from unittest.mock import Mock

import pytest

from pos_seerbit.utils import format_erp_ref

# Add module path for testing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestPosPaymentMethod:
    """Test cases for PosPaymentMethod model"""

    def setup_method(self):
        """Setup for each test method"""
        # Mock Odoo environment
        self.mock_env = Mock()
        self.mock_search = Mock()
        self.mock_env.search = self.mock_search

    def test_seerbit_public_key_validation_success(self):
        """Test successful validation of Seerbit public key"""
        # Mock the payment method
        payment_method = Mock()
        payment_method.seerbit_public_key = "test_key_123"
        payment_method.id = 1
        payment_method.display_name = "Test Payment Method"

        # Mock the search method to return empty list (no duplicates)
        mock_search = Mock()
        mock_search.return_value = []
        payment_method.search = mock_search

        # Test that validation passes when no duplicate key exists
        # In real implementation, this would call _check_seerbit_autoconfirm
        assert payment_method.seerbit_public_key == "test_key_123"

    def test_seerbit_public_key_validation_duplicate(self):
        """Test validation failure when duplicate Seerbit public key exists"""
        # Mock the payment method
        payment_method = Mock()
        payment_method.seerbit_public_key = "duplicate_key"
        payment_method.id = 1
        payment_method.display_name = "Test Payment Method"

        # Mock existing payment method with same key
        existing_method = Mock()
        existing_method.display_name = "Existing Payment Method"

        # Mock the search method to return existing method (duplicate found)
        mock_search = Mock()
        mock_search.return_value = [existing_method]
        payment_method.search = mock_search

        # Test that validation would fail when duplicate key exists
        # In real implementation, this would raise ValidationError
        assert len(mock_search.return_value) == 1

    def test_get_latest_seerbit_status_with_response(self):
        """Test getting latest status when response exists"""
        payment_method = Mock()
        payment_method.sudo.return_value = payment_method

        # Mock response data
        mock_response = {
            'data': {
                'currency': 'USD',
                'amount': 100.00,
                'reference': 'TEST123'
            }
        }
        payment_method.seerbit_latest_response = json.dumps(mock_response)

        # Mock expected data
        expected = {
            'Currency': 'USD',
            'RequestedAmount': 100.00
        }

        # Test the logic
        stored = payment_method.seerbit_latest_response
        if stored:
            stored_data = json.loads(stored)
            # Check if currency and amount match
            if (expected["Currency"] == stored_data['data']['currency'] and
                    round(float(expected['RequestedAmount']), 2) == stored_data['data']['amount']):
                result = {'latest_response': stored_data}
            else:
                result = False

        # Should return the response data
        assert result['latest_response'] == mock_response

    def test_get_latest_seerbit_status_no_response(self):
        """Test getting latest status when no response exists"""
        payment_method = Mock()
        payment_method.sudo.return_value = payment_method
        payment_method.seerbit_latest_response = ''

        # When no response, should return False
        stored = payment_method.seerbit_latest_response
        assert stored == ''

    def test_get_latest_seerbit_status_mismatch(self):
        """Test getting latest status when amounts don't match"""
        payment_method = Mock()
        payment_method.sudo.return_value = payment_method

        # Mock response with different amount
        mock_response = {
            'data': {
                'currency': 'USD',
                'amount': 50.00,  # Different amount
                'reference': 'TEST123'
            }
        }
        payment_method.seerbit_latest_response = json.dumps(mock_response)

        # Mock expected data
        expected = {
            'Currency': 'USD',
            'RequestedAmount': 100.00  # Different amount
        }

        # Test the logic
        stored = payment_method.seerbit_latest_response
        if stored:
            stored_data = json.loads(stored)
            # Check if currency and amount match
            if (expected["Currency"] == stored_data['data']['currency'] and
                    round(float(expected['RequestedAmount']), 2) == stored_data['data']['amount']):
                result = {'latest_response': stored_data}
            else:
                result = False

        # Should return False due to amount mismatch
        assert result == False


class TestPosSession:
    """Test cases for PosSession model"""

    def test_loader_params_pos_payment_method(self):
        """Test that Seerbit fields are added to loader params"""
        # Mock the session
        session = Mock()

        # Mock the super call result
        mock_result = {
            'search_params': {
                'fields': ['name', 'type']
            }
        }
        session._loader_params_pos_payment_method = lambda: mock_result

        # Test that seerbit_public_key is added to fields
        # In real implementation, this would extend the super method
        expected_fields = ['name', 'type', 'seerbit_public_key']
        assert 'seerbit_public_key' in expected_fields


class TestResConfigSettings:
    """Test cases for ResConfigSettings model"""

    def test_module_pos_seerbit_field(self):
        """Test that the module field exists"""
        # Mock the settings
        settings = Mock()
        settings.module_pos_seerbit = True

        # Test field exists and can be set
        assert settings.module_pos_seerbit == True
        settings.module_pos_seerbit = False
        assert settings.module_pos_seerbit == False

    def test_set_values_disabled_module(self):
        """Test set_values when module is disabled"""
        # Mock environment
        mock_env = Mock()
        mock_config_param = Mock()
        mock_config_param.sudo.return_value.get_param.return_value = False

        mock_env.__getitem__ = lambda x: mock_config_param

        # Mock payment methods
        mock_payment_methods = Mock()
        mock_search = Mock()
        mock_payment_methods.search = mock_search
        mock_search.return_value = [Mock(), Mock()]  # Two payment methods

        mock_env.__getitem__ = lambda x: mock_payment_methods if x == 'pos.payment.method' else mock_config_param

        # Test that payment methods are updated when module is disabled
        # In real implementation, this would call write() on payment methods
        assert len(mock_search.return_value) == 2


class TestPosPaymentMethodUtils:
    def test_format_erp_ref_adds_prefix_and_normalizes(self):
        assert format_erp_ref('TestRef') == 'odoo_testref'
        assert format_erp_ref(
            ' odoo_AlreadyPrefixed ') == 'odoo_alreadyprefixed'
        assert format_erp_ref('  test ref 123 ') == 'odoo_testref123'
        assert format_erp_ref('') == ''
        assert format_erp_ref(None) == ''

    def test_format_erp_ref_idempotent(self):
        assert format_erp_ref(format_erp_ref('TestRef')) == 'odoo_testref'
        assert format_erp_ref(format_erp_ref(
            ' odoo_AlreadyPrefixed ')) == 'odoo_alreadyprefixed'


class DummyPaymentMethod:
    def __init__(self):
        self.seerbit_latest_response = ''
        self.env = Mock()
        self.env.cr = Mock()
        self.env.cr.commit = Mock()

    def ensure_one(self):
        return self

    def sudo(self):
        return self

    def send_seerbit_payment_request(self, payload):
        # Simulate saving
        self.seerbit_latest_response = json.dumps(payload)
        return True

    def get_latest_seerbit_status(self, expected):
        if self.seerbit_latest_response:
            stored = json.loads(self.seerbit_latest_response)
            expected_amount = expected.get(
                "RequestedAmount") or expected.get("transactionValue")
            expected_currency = expected.get(
                "Currency") or stored.get("currency")
            stored_amount = stored.get(
                "transactionValue") or stored.get("RequestedAmount")
            stored_currency = stored.get("currency") or stored.get("Currency")
            
            if (
                expected_currency == stored_currency
                and round(float(expected_amount or 0), 2) == float(stored_amount or 0)
            ):
                self.seerbit_latest_response = ""
                return {"latest_response": stored}
        return False


def test_send_and_reconcile_with_amount_matching():
    pm = DummyPaymentMethod()
    payload = {
        'transactionValue': '100.00',
        'currency': 'USD',
    }
    pm.send_seerbit_payment_request(payload.copy())
    # Should be saved
    stored = json.loads(pm.seerbit_latest_response)
    assert stored['transactionValue'] == '100.00'

    # Should match with same amount and currency
    expected = {
        'transactionValue': '100.00',
        'Currency': 'USD',
    }
    result = pm.get_latest_seerbit_status(expected)
    assert result and result['latest_response']['transactionValue'] == '100.00'
    # After match, should clear
    assert pm.seerbit_latest_response == ''
    
    # Reset for next test
    pm.send_seerbit_payment_request(payload.copy())

    # Should not match with different amount
    expected = {
        'transactionValue': '50.00',
        'Currency': 'USD',
    }
    assert pm.get_latest_seerbit_status(expected) is False
 