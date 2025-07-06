# coding: utf-8
import json
import logging
import pprint
import random
import string
import warnings
import sys

# Suppress all warnings from firebase_admin before importing
warnings.filterwarnings("ignore", category=SyntaxWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

# Suppress specific firebase_admin warnings
if 'firebase_admin' in sys.modules:
    warnings.filterwarnings("ignore", module="firebase_admin")

try:
    import firebase_admin
    from firebase_admin import credentials, db
    FIREBASE_AVAILABLE = True
except ImportError as e:
    FIREBASE_AVAILABLE = False
    firebase_admin = None
    credentials = None
    db = None
    logging.getLogger(__name__).warning("Firebase Admin SDK not available: %s", str(e))

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from werkzeug.exceptions import Forbidden

from odoo.addons.pos_seerbit.utils import format_erp_ref

_logger = logging.getLogger(__name__)

# Initialize Firebase only once
_firebase_initialized = False

def initialize_firebase(env):
    """Initialize Firebase with proper error handling"""
    global _firebase_initialized

    # Check if Firebase is available
    if not FIREBASE_AVAILABLE:
        _logger.warning("Firebase Admin SDK not available. Skipping initialization.")
        return False

    if _firebase_initialized or firebase_admin._apps:
        return True

    try:
        # Get Firebase config from Odoo settings
        config = env['ir.config_parameter'].sudo()
        cred_json = config.get_param('pos_seerbit.seerbit_firebase_cred')
        db_url = config.get_param('pos_seerbit.seerbit_firebase_db_url')

        if not cred_json or not db_url:
            _logger.warning("Firebase configuration not available in settings. Skipping initialization.")
            return False

        # Validate JSON format
        try:
            json.loads(cred_json)
        except json.JSONDecodeError:
            _logger.error("Invalid JSON format in Firebase service account credentials")
            return False

        # Save credentials to a temporary file
        import tempfile
        import os
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as temp_cred_file:
            temp_cred_file.write(cred_json)
            cred_path = temp_cred_file.name

        try:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred, {
                'databaseURL': db_url
            })
            _firebase_initialized = True
            _logger.info("Firebase initialized successfully")
            return True
        finally:
            # Clean up the temporary file
            try:
                os.unlink(cred_path)
            except OSError:
                pass  # File might already be deleted
                
    except Exception as e:
        _logger.warning("Failed to initialize Firebase: %s", str(e))
        return False

# Try to initialize Firebase on module load
# Note: This will only work if the module is enabled and configured
try:
    # We need an environment to initialize Firebase
    # This will be done when the first payment method is accessed
    pass
except Exception as e:
    _logger.debug("Firebase initialization deferred: %s", str(e))


def send_to_firebase_transactions(env, payload):
    """
    Send payment request to Firebase.
    """
    # Check if Firebase is available
    if not FIREBASE_AVAILABLE:
        _logger.warning("Firebase Admin SDK not available. Cannot send payment request.")
        return False
    
    if not initialize_firebase(env):
        _logger.warning("Firebase not initialized. Cannot send payment request.")
        return False
    
    try:
        _logger.info('Sending payment request to Firebase: %s',
                     pprint.pformat(payload))
        ref = db.reference('transactions')
        ref.push(payload)
        _logger.info('Sent payment request to Firebase: %s',
                     pprint.pformat(payload))
        return True
    except Exception as e:
        _logger.error("Failed to send payment request to Firebase: %s", str(e))
        return False


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    def _get_payment_terminal_selection(self):
        return super(PosPaymentMethod, self)._get_payment_terminal_selection() + [("seerbit", "Seerbit")]

    # Seerbit Fields
    seerbit_public_key = fields.Char(
        string="Seerbit Public Key", help="As provided on Seerbit dashboard", copy=False)
    seerbit_latest_response = fields.Char(
        copy=False, groups="base.group_erp_manager"
    )  # used to buffer the latest asynchronous notification from Seerbit.
    
    @api.constrains("seerbit_public_key")
    def _check_seerbit_autoconfirm(self):
        for payment_method in self:
            if not (payment_method.seerbit_public_key):
                continue
            # Payment methods are now expected to separate at the account levels irrepective of the number of terminals
            existing_key = self.search(
                [("id", "!=", payment_method.id), ("seerbit_public_key",
                                                   "=", payment_method.seerbit_public_key)],
                limit=1,
            )
        
            if existing_key:
                raise ValidationError(
                    _("Seerbit key %s is already used on payment method %s.")
                    % (payment_method.seerbit_public_key, existing_key.display_name)
                )

    def _is_write_forbidden(self, fields):
        whitelisted_fields = {"seerbit_latest_response"}
        return super(PosPaymentMethod, self)._is_write_forbidden(fields - whitelisted_fields)

    @staticmethod
    def _format_erp_ref(ref):
        """
        Format ERP reference to ensure consistent format with 'odoo_' prefix.

        Args:
            ref (str): The ERP reference to format

        Returns:
            str: Formatted reference with 'odoo_' prefix, normalized to lowercase,
                 with whitespace removed, or empty string if ref is None/empty
        """
        return format_erp_ref(ref)

    def send_seerbit_payment_request(self, payload):
        self.ensure_one()
        # Always format erpTransactionRef
        if payload.get('erpTransactionRef'):
            payload['erpTransactionRef'] = self._format_erp_ref(
                payload['erpTransactionRef'])
        
        # Save to Odoo for tracking first
        self.seerbit_latest_response = json.dumps(payload)
        self.env.cr.commit()
        
        # Try to send to Firebase
        firebase_success = send_to_firebase_transactions(self.env, payload)
        
        if firebase_success:
            _logger.info(
                "Seerbit payment request saved to Odoo and sent to Firebase: %s", pprint.pformat(payload))
        else:
            _logger.warning(
                "Seerbit payment request saved to Odoo but Firebase send failed: %s", pprint.pformat(payload))
        
        return True

    def get_latest_seerbit_status(self, expected):
        self.ensure_one()
        stored = self.sudo().seerbit_latest_response
        if stored:
            stored = json.loads(stored)
            # Support both legacy and new payloads
            expected_amount = expected.get(
                "RequestedAmount") or expected.get("transactionValue")
            expected_currency = expected.get(
                "Currency") or stored.get("currency")
            stored_amount = stored.get(
                "transactionValue") or stored.get("RequestedAmount")
            stored_currency = stored.get("currency") or stored.get("Currency")
            expected_erp_ref = self._format_erp_ref(
                expected.get("erpTransactionRef"))
            stored_erp_ref = self._format_erp_ref(
                stored.get("erpTransactionRef"))
            if (
                expected_currency == stored_currency
                and round(float(expected_amount or 0), 2) == float(stored_amount or 0)
                and expected_erp_ref == stored_erp_ref
            ):
                self.sudo().seerbit_latest_response = ""  # Avoid reusing responses
                return {
                    "latest_response": stored,
                }
        return False

    @api.model
    def reconcile_payment(self, reconciliation_data):
        """
        Reconcile payment and update order status.

        Args:
            reconciliation_data (dict): Reconciliation data from frontend

        Returns:
            dict: Result of reconciliation
        """
        try:
            # Extract transaction details
            transaction_id = reconciliation_data.get('id')
            status = reconciliation_data.get('status', 'unknown')
            amount = reconciliation_data.get(
                'transactionValue') or reconciliation_data.get('RequestedAmount')
            currency = reconciliation_data.get(
                'currency') or reconciliation_data.get('Currency')
            erp_ref = reconciliation_data.get('erpTransactionRef')

            if not transaction_id:
                return {'status': 'error', 'message': 'Missing transaction ID'}

            # Find the POS order by transaction ID
            pos_order = self.env['pos.order'].sudo().search([
                ('uid', '=', transaction_id)
            ], limit=1)

            if not pos_order:
                _logger.warning(
                    "No POS order found for transaction ID: %s", transaction_id)
                return {'status': 'warning', 'message': 'No matching order found'}

            # Check if order is already paid
            if pos_order.state in ['paid', 'done']:
                _logger.info("Order %s is already paid", pos_order.name)
                return {'status': 'success', 'message': 'Order already paid'}

            # Process payment based on status
            if status in ['successful', 'success', 'completed']:
                # Mark order as paid
                pos_order.write({
                    'state': 'paid',
                    'payment_status': 'paid'
                })

                # Update payment lines
                for payment_line in pos_order.payment_ids:
                    if payment_line.payment_method_id.use_payment_terminal == 'seerbit':
                        payment_line.write({
                            'payment_status': 'done',
                            'transaction_id': transaction_id
                        })

                # Create payment record if not exists
                self._create_payment_record(
                    pos_order, amount, currency, transaction_id, erp_ref)

                _logger.info(
                    "Payment reconciled successfully for order %s: %s", pos_order.name, transaction_id)
                return {
                    'status': 'success',
                    'message': 'Payment reconciled successfully',
                    'order_name': pos_order.name,
                    'amount': amount
                }

            elif status in ['failed', 'failed', 'cancelled', 'closed']:
                # Mark order as failed
                pos_order.write({
                    'state': 'draft',
                    'payment_status': 'failed'
                })

                # Update payment lines
                for payment_line in pos_order.payment_ids:
                    if payment_line.payment_method_id.use_payment_terminal == 'seerbit':
                        payment_line.write({
                            'payment_status': 'failed',
                            'transaction_id': transaction_id
                        })

                _logger.info("Payment failed for order %s: %s",
                             pos_order.name, transaction_id)
                return {
                    'status': 'failed',
                    'message': 'Payment failed',
                    'order_name': pos_order.name
                }

            else:
                _logger.warning(
                    "Unknown payment status: %s for transaction %s", status, transaction_id)
                return {'status': 'warning', 'message': f'Unknown status: {status}'}

        except Exception as e:
            _logger.error("Error reconciling payment: %s", str(e))
            return {'status': 'error', 'message': f'Reconciliation error: {str(e)}'}

    def _create_payment_record(self, pos_order, amount, currency, transaction_id, erp_ref):
        """
        Create payment record for the reconciled transaction.

        Args:
            pos_order: POS order record
            amount: Payment amount
            currency: Payment currency
            transaction_id: Seerbit transaction ID
            erp_ref: ERP reference
        """
        try:
            # Create account.payment record
            payment_vals = {
                'payment_type': 'inbound',
                'partner_type': 'customer',
                'partner_id': pos_order.partner_id.id if pos_order.partner_id else False,
                'amount': float(amount),
                'currency_id': self.env['res.currency'].search([('name', '=', currency)], limit=1).id,
                'payment_method_id': self.env.ref('account.account_payment_method_manual_in').id,
                'journal_id': pos_order.session_id.config_id.journal_id.id,
                'ref': f"Seerbit: {transaction_id}",
                'communication': erp_ref or transaction_id,
                'state': 'posted',
            }

            payment = self.env['account.payment'].sudo().create(payment_vals)

            # Link payment to POS order
            pos_order.write({
                'payment_ids': [(4, payment.id)]
            })

            _logger.info("Created payment record %s for order %s",
                         payment.name, pos_order.name)

        except Exception as e:
            _logger.error("Error creating payment record: %s", str(e))

    @api.model
    def get_firebase_config(self):
        """
        Get Firebase configuration for frontend.
        This method is called by the frontend to get the Firebase config.

        Returns:
            dict: Firebase configuration for frontend
        """
        return self.env['res.config.settings'].sudo().get_firebase_config_for_frontend()
