# coding: utf-8
import json
import logging

from odoo import http
from odoo.http import Response, request
from werkzeug.exceptions import Forbidden

from ..config import config

_logger = logging.getLogger(__name__)


class SeerbitController(http.Controller):
    @http.route('/pos_seerbit/notification', type='json', auth='public', methods=['POST'], csrf=False)
    def seerbit_notification(self, **kwargs):
        """
        Handle reconciliation notifications from frontend (fallback webhook).
        This endpoint receives reconciliation data from the frontend
        and processes it to update the payment status.
        Can be used as fallback if RPC approach fails.
        """
        try:
            # Validate the request
            if not kwargs:
                _logger.error("Empty notification received")
                return {'status': 'error', 'message': 'Empty notification'}

            # Log the notification
            _logger.info("Received reconciliation notification via webhook: %s", json.dumps(
                kwargs, indent=2))

            # Extract transaction details
            transaction_id = kwargs.get('id')
            status = kwargs.get('status', 'unknown')

            if not transaction_id:
                _logger.error("Missing transaction ID in notification")
                return {'status': 'error', 'message': 'Missing transaction ID'}

            # Find the payment method and update status
            payment_method = request.env['pos.payment.method'].sudo().search([
                ('use_payment_terminal', '=', 'seerbit')
            ], limit=1)

            if not payment_method:
                _logger.error("No Seerbit payment method found")
                return {'status': 'error', 'message': 'No Seerbit payment method configured'}

            # Process the reconciliation
            result = payment_method.reconcile_payment(kwargs)

            if result['status'] == 'success':
                _logger.info(
                    "Reconciliation successful for transaction %s: %s", transaction_id, status)
            elif result['status'] == 'failed':
                _logger.warning(
                    "Payment failed for transaction %s: %s", transaction_id, status)
            else:
                _logger.warning("Reconciliation issue for transaction %s: %s",
                                transaction_id, result.get('message', ''))

            return result

        except Exception as e:
            _logger.error(
                "Error processing reconciliation notification: %s", str(e))
            return {'status': 'error', 'message': f'Processing error: {str(e)}'}

    @http.route('/pos_seerbit/config', type='http', auth='user', methods=['GET'])
    def get_config(self):
        """
        Get configuration for frontend.
        This endpoint provides configuration data to the frontend.
        """
        try:
            config_data = {
                'firebase_config': config.get_firebase_config_for_frontend()
            }
            return Response(
                json.dumps(config_data),
                content_type='application/json'
            )
        except Exception as e:
            _logger.error("Error getting configuration: %s", str(e))
            return Response(
                json.dumps(
                    {'status': 'error', 'message': f'Configuration error: {str(e)}'}),
                content_type='application/json',
                status=500
            )
