"""
Tests for payment reconciliation functionality.
These tests verify the reconciliation logic without Odoo dependencies.
"""

import json

import pytest


def format_erp_ref(ref):
    """Utility function for formatting ERP references"""
    if not ref:
        return ''

    normalized = ref.strip().lower().replace(' ', '')

    if not normalized:
        return ''

    if not normalized.startswith('odoo_'):
        normalized = f'odoo_{normalized}'

    return normalized


class MockPosOrder:
    """Mock POS order for testing"""

    def __init__(self, uid, name, state='draft', partner_id=None):
        self.uid = uid
        self.name = name
        self.state = state
        self.partner_id = partner_id
        self.payment_ids = []
        self.session_id = MockPosSession()
        self.payment_status = 'pending'

    def write(self, vals):
        for key, value in vals.items():
            setattr(self, key, value)
        return True


class MockPosSession:
    """Mock POS session for testing"""

    def __init__(self):
        self.config_id = MockPosConfig()


class MockPosConfig:
    """Mock POS config for testing"""

    def __init__(self):
        self.journal_id = MockJournal()


class MockJournal:
    """Mock journal for testing"""

    def __init__(self):
        self.id = 1


class MockPaymentLine:
    """Mock payment line for testing"""

    def __init__(self, payment_method, amount, status='pending'):
        self.payment_method_id = payment_method
        self.amount = amount
        self.payment_status = status

    def write(self, vals):
        for key, value in vals.items():
            setattr(self, key, value)
        return True


class MockPaymentMethod:
    """Mock payment method for testing"""

    def __init__(self):
        self.use_payment_terminal = 'seerbit'
        self.seerbit_latest_response = ''

    def ensure_one(self):
        return self

    @staticmethod
    def _format_erp_ref(ref):
        return format_erp_ref(ref)

    @classmethod
    def reconcile_payment(cls, reconciliation_data):
        """Mock reconciliation method (class method like @api.model)"""
        try:
            transaction_id = reconciliation_data.get('id')
            status = reconciliation_data.get('status', 'unknown')
            amount = reconciliation_data.get(
                'transactionValue') or reconciliation_data.get('RequestedAmount')
            currency = reconciliation_data.get(
                'currency') or reconciliation_data.get('Currency')

            if not transaction_id:
                return {'status': 'error', 'message': 'Missing transaction ID'}

            # Validate required fields
            if not amount or not currency:
                return {'status': 'error', 'message': 'Missing amount or currency'}

            # Mock finding POS order
            pos_order = MockPosOrder(transaction_id, f"Order-{transaction_id}")

            if status in ['successful', 'success', 'completed']:
                pos_order.write({
                    'state': 'paid',
                    'payment_status': 'paid'
                })

                # Mock payment line update
                payment_line = MockPaymentLine(cls(), amount)
                payment_line.write({
                    'payment_status': 'done'
                })

                return {
                    'status': 'success',
                    'message': 'Payment reconciled successfully',
                    'order_name': pos_order.name,
                    'amount': amount
                }

            elif status in ['failed', 'cancelled', 'closed']:
                pos_order.write({
                    'state': 'draft',
                    'payment_status': 'failed'
                })

                payment_line = MockPaymentLine(cls(), amount)
                payment_line.write({
                    'payment_status': 'failed'
                })

                return {
                    'status': 'failed',
                    'message': 'Payment failed',
                    'order_name': pos_order.name
                }

            else:
                return {'status': 'warning', 'message': f'Unknown status: {status}'}

        except Exception as e:
            return {'status': 'error', 'message': f'Reconciliation error: {str(e)}'}


def test_reconciliation_success():
    """Test successful payment reconciliation"""
    reconciliation_data = {
        'id': 'test-transaction-123',
        'status': 'successful',
        'transactionValue': '100.00',
        'currency': 'USD',
        'erpTransactionRef': 'Test Order'
    }

    result = MockPaymentMethod.reconcile_payment(reconciliation_data)

    assert result['status'] == 'success'
    assert 'Payment reconciled successfully' in result['message']
    assert result['order_name'] == 'Order-test-transaction-123'
    assert result['amount'] == '100.00'


def test_reconciliation_failure():
    """Test failed payment reconciliation"""
    reconciliation_data = {
        'id': 'test-transaction-456',
        'status': 'failed',
        'transactionValue': '50.00',
        'currency': 'EUR',
        'erpTransactionRef': 'Failed Order'
    }

    result = MockPaymentMethod.reconcile_payment(reconciliation_data)

    assert result['status'] == 'failed'
    assert 'Payment failed' in result['message']
    assert result['order_name'] == 'Order-test-transaction-456'


def test_reconciliation_missing_transaction_id():
    """Test reconciliation with missing transaction ID"""
    reconciliation_data = {
        'status': 'successful',
        'transactionValue': '100.00',
        'currency': 'USD'
    }

    result = MockPaymentMethod.reconcile_payment(reconciliation_data)

    assert result['status'] == 'error'
    assert 'Missing transaction ID' in result['message']


def test_reconciliation_unknown_status():
    """Test reconciliation with unknown status"""
    reconciliation_data = {
        'id': 'test-transaction-789',
        'status': 'unknown_status',
        'transactionValue': '75.00',
        'currency': 'GBP'
    }

    result = MockPaymentMethod.reconcile_payment(reconciliation_data)

    assert result['status'] == 'warning'
    assert 'Unknown status' in result['message']


def test_reconciliation_different_amount_formats():
    """Test reconciliation with different amount field names"""
    # Test with RequestedAmount
    reconciliation_data_1 = {
        'id': 'test-transaction-1',
        'status': 'successful',
        'RequestedAmount': '100.00',
        'Currency': 'USD'
    }

    result_1 = MockPaymentMethod.reconcile_payment(reconciliation_data_1)
    assert result_1['status'] == 'success'
    assert result_1['amount'] == '100.00'

    # Test with transactionValue
    reconciliation_data_2 = {
        'id': 'test-transaction-2',
        'status': 'successful',
        'transactionValue': '200.00',
        'currency': 'EUR'
    }

    result_2 = MockPaymentMethod.reconcile_payment(reconciliation_data_2)
    assert result_2['status'] == 'success'
    assert result_2['amount'] == '200.00'


def test_erp_ref_formatting():
    """Test ERP reference formatting in reconciliation"""
    # Test basic formatting
    assert format_erp_ref('Test Order') == 'odoo_testorder'
    assert format_erp_ref('  Order 123  ') == 'odoo_order123'
    assert format_erp_ref('odoo_already') == 'odoo_already'

    # Test edge cases
    assert format_erp_ref('') == ''
    assert format_erp_ref(None) == ''
    assert format_erp_ref('   ') == ''
    assert format_erp_ref('odoo_') == 'odoo_'


def test_reconciliation_error_handling():
    """Test error handling in reconciliation"""
    # Test with missing required data
    reconciliation_data = {
        'id': 'test-transaction-error',
        'status': 'successful'
        # Missing transactionValue and currency
    }

    result = MockPaymentMethod.reconcile_payment(reconciliation_data)

    # Should handle the error gracefully
    assert result['status'] in ['error', 'warning', 'failed']
