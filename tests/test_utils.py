"""
Standalone tests for utility functions.
These tests don't require Odoo and can run independently.
"""

import json

import pytest


def format_erp_ref(ref):
    """
    Format ERP reference to ensure consistent format with 'odoo_' prefix.

    Args:
        ref (str): The ERP reference to format

    Returns:
        str: Formatted reference with 'odoo_' prefix, normalized to lowercase,
             with whitespace removed, or empty string if ref is None/empty
    """
    if not ref:
        return ''

    # Remove whitespace and convert to lowercase
    normalized = ref.strip().lower().replace(' ', '')

    # If after normalization we have nothing, return empty string
    if not normalized:
        return ''

    # Add prefix if not already present
    if not normalized.startswith('odoo_'):
        normalized = f'odoo_{normalized}'

    return normalized


class TestFormatErpRef:
    """Test cases for the format_erp_ref utility function"""

    def test_format_erp_ref_adds_prefix_and_normalizes(self):
        """Test that the function adds prefix and normalizes input"""
        assert format_erp_ref('TestRef') == 'odoo_testref'
        assert format_erp_ref(
            ' odoo_AlreadyPrefixed ') == 'odoo_alreadyprefixed'
        assert format_erp_ref('  test ref 123 ') == 'odoo_testref123'
        assert format_erp_ref('') == ''
        assert format_erp_ref(None) == ''

    def test_format_erp_ref_idempotent(self):
        """Test that applying the function twice gives the same result"""
        assert format_erp_ref(format_erp_ref('TestRef')) == 'odoo_testref'
        assert format_erp_ref(format_erp_ref(
            ' odoo_AlreadyPrefixed ')) == 'odoo_alreadyprefixed'

    def test_format_erp_ref_with_numbers(self):
        """Test formatting with numbers and special characters"""
        assert format_erp_ref('Order123') == 'odoo_order123'
        assert format_erp_ref('Test-Order_456') == 'odoo_test-order_456'
        assert format_erp_ref('  POS-001  ') == 'odoo_pos-001'

    def test_format_erp_ref_edge_cases(self):
        """Test edge cases and boundary conditions"""
        assert format_erp_ref('') == ''
        assert format_erp_ref(None) == ''
        assert format_erp_ref('   ') == ''
        assert format_erp_ref('odoo_') == 'odoo_'
        assert format_erp_ref('ODOO_TEST') == 'odoo_test'


class DummyPaymentMethod:
    """Dummy payment method for testing without Odoo dependencies"""

    def __init__(self):
        self.seerbit_latest_response = ''

    def send_seerbit_payment_request(self, payload):
        """Simulate formatting and saving"""
        if payload.get('erpTransactionRef'):
            payload['erpTransactionRef'] = format_erp_ref(
                payload['erpTransactionRef'])
        self.seerbit_latest_response = json.dumps(payload)
        return True

    def get_latest_seerbit_status(self, expected):
        """Simulate getting latest status and matching"""
        if self.seerbit_latest_response:
            stored = json.loads(self.seerbit_latest_response)
            expected_amount = expected.get(
                "RequestedAmount") or expected.get("transactionValue")
            expected_currency = expected.get(
                "Currency") or expected.get("currency")
            stored_amount = stored.get(
                "transactionValue") or stored.get("RequestedAmount")
            stored_currency = stored.get("currency") or stored.get("Currency")
            expected_erp_ref = format_erp_ref(
                expected.get("erpTransactionRef"))
            stored_erp_ref = format_erp_ref(stored.get("erpTransactionRef"))
            if (
                expected_currency == stored_currency
                and round(float(expected_amount or 0), 2) == float(stored_amount or 0)
                and expected_erp_ref == stored_erp_ref
            ):
                self.seerbit_latest_response = ""
                return {"latest_response": stored}
        return False


def test_send_and_reconcile_with_various_erp_refs():
    """Test the complete send and reconcile flow with various ERP references"""
    pm = DummyPaymentMethod()
    payload = {
        'erpTransactionRef': 'Test Order 1',
        'transactionValue': '100.00',
        'currency': 'USD',
    }
    pm.send_seerbit_payment_request(payload.copy())
    # Should be normalized
    stored = json.loads(pm.seerbit_latest_response)
    assert stored['erpTransactionRef'] == 'odoo_testorder1'

    # Should match with various forms
    for ref in ['Test Order 1', 'odoo_testorder1', '  test order 1  ']:
        expected = {
            'erpTransactionRef': ref,
            'transactionValue': '100.00',
            'Currency': 'USD',
        }
        result = pm.get_latest_seerbit_status(expected)
        assert result and result['latest_response']['erpTransactionRef'] == 'odoo_testorder1'
        # After match, should clear
        assert pm.seerbit_latest_response == ''
        # Reset for next test
        pm.send_seerbit_payment_request(payload.copy())

    # Should not match with wrong ref
    expected = {
        'erpTransactionRef': 'otherorder',
        'transactionValue': '100.00',
        'Currency': 'USD',
    }
    assert pm.get_latest_seerbit_status(expected) is False


def test_reconciliation_with_different_payload_formats():
    """Test reconciliation with different payload field names"""
    pm = DummyPaymentMethod()

    # Test with legacy format
    payload = {
        'erpTransactionRef': 'Legacy Order',
        'RequestedAmount': '50.00',
        'Currency': 'EUR',
    }
    pm.send_seerbit_payment_request(payload.copy())

    # Should match with new format (same currency and amount)
    expected = {
        'erpTransactionRef': 'Legacy Order',
        'transactionValue': '50.00',
        'currency': 'EUR',
    }
    result = pm.get_latest_seerbit_status(expected)
    assert result is not False
    assert result['latest_response']['erpTransactionRef'] == 'odoo_legacyorder'


def test_reconciliation_amount_mismatch():
    """Test that reconciliation fails when amounts don't match"""
    pm = DummyPaymentMethod()

    payload = {
        'erpTransactionRef': 'Test Order',
        'transactionValue': '100.00',
        'currency': 'USD',
    }
    pm.send_seerbit_payment_request(payload.copy())

    # Try to match with different amount
    expected = {
        'erpTransactionRef': 'Test Order',
        'transactionValue': '200.00',  # Different amount
        'currency': 'USD',
    }
    result = pm.get_latest_seerbit_status(expected)
    assert result is False


def test_reconciliation_currency_mismatch():
    """Test that reconciliation fails when currencies don't match"""
    pm = DummyPaymentMethod()

    payload = {
        'erpTransactionRef': 'Test Order',
        'transactionValue': '100.00',
        'currency': 'USD',
    }
    pm.send_seerbit_payment_request(payload.copy())

    # Try to match with different currency
    expected = {
        'erpTransactionRef': 'Test Order',
        'transactionValue': '100.00',
        'currency': 'EUR',  # Different currency
    }
    result = pm.get_latest_seerbit_status(expected)
    assert result is False


def test_reconciliation_erp_ref_mismatch():
    """Test that reconciliation fails when ERP references don't match"""
    pm = DummyPaymentMethod()

    payload = {
        'erpTransactionRef': 'Test Order',
        'transactionValue': '100.00',
        'currency': 'USD',
    }
    pm.send_seerbit_payment_request(payload.copy())

    # Try to match with different ERP ref
    expected = {
        'erpTransactionRef': 'Different Order',
        'transactionValue': '100.00',
        'currency': 'USD',
    }
    result = pm.get_latest_seerbit_status(expected)
    assert result is False
