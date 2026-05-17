import logging
import json
from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)

class SeerbitWebhookController(http.Controller):

    @http.route('/odoo/seerbit/webhook', type='json', auth='public', methods=['POST'], csrf=False)
    def handle_webhook(self, **kwargs):
        """
        Endpoint to receive webhook notifications from Seerbit.
        Handles Virtual Account payments (inbound).
        """
        payload = request.jsonrequest
        if not payload:
            _logger.warning("Seerbit Webhook received empty payload.")
            return json.dumps({"status": "error", "message": "Empty payload"})

        _logger.info(f"Seerbit Webhook received: {json.dumps(payload)}")
        
        # Depending on Seerbit webhook format. 
        # Typically, a webhook payload might contain data inside a 'data' or 'payload' object.
        # Check standard Seerbit structure:
        # payload might have 'payments' or similar.
        # Assuming payload has 'paymentReference', 'amount', 'accountNumber', 'status'
        
        # Webhook V2 structure from docs (Disputes & Webhooks V2):
        # We will attempt to parse typical payment notification fields.
        payment_data = payload.get('data', payload)
        
        # E.g. structure: { "type": "virtual_account_payment", "data": { "accountNumber": "...", "amount": "...", "paymentReference": "..." } }
        account_number = payment_data.get('accountNumber')
        amount = payment_data.get('amount')
        reference = payment_data.get('paymentReference') or payment_data.get('reference')
        status = payment_data.get('status', 'SUCCESS')
        
        if not account_number or not amount:
            _logger.warning(f"Seerbit Webhook missing critical payment info: account={account_number}, amount={amount}")
            return json.dumps({"status": "success", "message": "Ignored - Missing info"})
            
        if status.upper() not in ['SUCCESS', 'PUSHED']:
            _logger.info(f"Seerbit Webhook ignoring non-success status: {status}")
            return json.dumps({"status": "success", "message": "Ignored - Not success"})

        # Find Partner
        partner = request.env['res.partner'].sudo().search([('seerbit_va_account_number', '=', account_number)], limit=1)
        if not partner:
            _logger.warning(f"Seerbit Webhook: No partner found for VA {account_number}")
            return json.dumps({"status": "error", "message": "Partner not found"})

        # Prevent duplicate processing based on reference
        if reference:
            existing_payment = request.env['account.payment'].sudo().search([('ref', '=', reference)], limit=1)
            if existing_payment:
                _logger.info(f"Seerbit Webhook: Payment {reference} already processed.")
                return json.dumps({"status": "success", "message": "Already processed"})

        try:
            # Process the payment using the partner's model method
            partner._process_seerbit_va_payment(partner, amount, reference or "Webhook Payment")
            _logger.info(f"Seerbit Webhook: Processed payment of {amount} for {partner.name}")
        except Exception as e:
            _logger.error(f"Seerbit Webhook Error processing payment: {e}")
            return json.dumps({"status": "error", "message": str(e)})

        return json.dumps({"status": "success", "message": "Processed"})
