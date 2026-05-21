import logging
import json
from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)

class SeerbitWebhookController(http.Controller):

    @http.route('/api/seerbit/webhook', type='http', auth='public', methods=['POST'], csrf=False)
    def handle_webhook(self, **kwargs):
        """
        Endpoint to receive webhook notifications from Seerbit.
        Handles Virtual Account payments (inbound).
        """
        try:
            payload = json.loads(request.httprequest.data)
        except Exception as e:
            _logger.warning(f"Seerbit Webhook failed to parse JSON: {e}")
            return request.make_response(json.dumps({"status": "error", "message": "Invalid JSON"}), headers={'Content-Type': 'application/json'})

        if not payload:
            _logger.warning("Seerbit Webhook received empty payload.")
            return request.make_response(json.dumps({"status": "error", "message": "Empty payload"}), headers={'Content-Type': 'application/json'})

        _logger.info(f"Seerbit Webhook received: {json.dumps(payload)}")
        
        # Parse standard Seerbit structure
        notification_items = payload.get('notificationItems', [])
        if not notification_items:
            # Fallback if it's sent differently
            payment_data = payload.get('data', payload)
            items = [payment_data] if payment_data else []
        else:
            items = [item.get('notificationRequestItem', {}).get('data', {}) 
                     for item in notification_items 
                     if item.get('notificationRequestItem', {}).get('eventType') == 'transaction']
            
        for payment_data in items:
            account_number = payment_data.get('creditAccountNumber') or payment_data.get('accountNumber')
            amount = payment_data.get('amount')
            reference = payment_data.get('reference') or payment_data.get('paymentReference')
            gateway_code = payment_data.get('gatewayCode')
            public_key = payment_data.get('publicKey')
            
            if not account_number or not amount:
                _logger.warning(f"Seerbit Webhook missing critical payment info: account={account_number}, amount={amount}")
                continue
                
            if str(gateway_code) != '00':
                _logger.info(f"Seerbit Webhook ignoring non-success gatewayCode: {gateway_code}")
                continue

            # Verify public key if provided in webhook
            from ..services.seerbit_api import SeerbitAPI
            api_client = SeerbitAPI(request.env)
            if public_key and public_key != api_client.public_key:
                _logger.warning(f"Seerbit Webhook public key mismatch! Received: {public_key}, Expected: {api_client.public_key}")
                continue

            # Find Partner
            partner = request.env['res.partner'].sudo().search([('seerbit_va_account_number', '=', account_number)], limit=1)
            if not partner:
                _logger.warning(f"Seerbit Webhook: No partner found for VA {account_number}")
                continue

            # Prevent duplicate processing based on reference
            if reference:
                existing_payment = request.env['account.payment'].sudo().search([('move_id.ref', '=', reference)], limit=1)
                if existing_payment:
                    if existing_payment.state == 'draft':
                        _logger.info(f"Seerbit Webhook: Found existing pending payment {reference}. Posting it...")
                        existing_payment.sudo().action_post()
                    if existing_payment.state == 'in_process':
                        partner.sudo()._reconcile_seerbit_payment(existing_payment)
                        
                    _logger.info(f"Seerbit Webhook: Payment {reference} already processed/posted.")
                    continue

            try:
                # Process the payment using the partner's model method
                partner.sudo()._process_seerbit_va_payment(partner, amount, reference or "Webhook Payment")
                _logger.info(f"Seerbit Webhook: Processed payment of {amount} for {partner.name}")
            except Exception as e:
                _logger.error(f"Seerbit Webhook Error processing payment: {e}")

        return request.make_response(json.dumps({"status": "success", "message": "Processed"}), headers={'Content-Type': 'application/json'})
