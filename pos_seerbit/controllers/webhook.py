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
        Handles three payment types:
          1. Payment Link payments  (matched by paymentLinkId)
          2. Invoice payments       (matched by invoiceNumber)
          3. Virtual Account payments (matched by accountNumber)
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
                     if item.get('notificationRequestItem', {}).get('eventType') in ('transaction', 'transaction.wallet')]
            
        for payment_data in items:
            # -----------------------------------------------------------
            # Extract common fields from the webhook payload
            # -----------------------------------------------------------
            # Virtual Account identifier (VA payments)
            account_number = payment_data.get('creditAccountNumber') or payment_data.get('accountNumber')
            # Payment Link identifier (link-based payments)
            payment_link_id = payment_data.get('paymentLinkId')
            # Seerbit Invoice number (invoice-based payments)
            invoice_number = payment_data.get('invoiceNumber')
            
            # Amount: try top-level first, fall back to paymentBreakdown
            amount = payment_data.get('amount')
            if not amount:
                payment_breakdown = payment_data.get('paymentBreakdown', {})
                amount = payment_breakdown.get('total') or payment_breakdown.get('amount')
                
            # Transaction reference for duplicate detection
            reference = payment_data.get('reference') or payment_data.get('paymentReference')
            # Gateway status code ('00' = success)
            gateway_code = payment_data.get('gatewayCode')
            # Merchant public key for verification
            public_key = payment_data.get('publicKey')
            
            # Skip if amount is missing — can't process without it
            if not amount:
                _logger.warning(f"Seerbit Webhook missing amount: {payment_data}")
                continue
            
            # Skip non-successful transactions (only '00' means approved)
            if str(gateway_code) != '00':
                _logger.info(f"Seerbit Webhook ignoring non-success gatewayCode: {gateway_code}")
                continue

            # Verify public key matches our configured key to prevent spoofing
            from ..services.seerbit_api import SeerbitAPI
            api_client = SeerbitAPI(request.env)
            if public_key and public_key != api_client.public_key:
                _logger.warning(f"Seerbit Webhook public key mismatch! Received: {public_key}, Expected: {api_client.public_key}")
                continue

            # ===========================================================
            # SECTION 1: Payment Link Payments
            # Matched by paymentLinkId → pos_seerbit.payment.link.seerbit_link_id
            # ===========================================================
            if payment_link_id:
                link = request.env['pos_seerbit.payment.link'].sudo().search([('seerbit_link_id', '=', str(payment_link_id))], limit=1)
                if link:
                    # Check if this reference was already processed (duplicate webhook)
                    if reference:
                        existing_payment = request.env['account.payment'].sudo().search([('move_id.ref', '=', reference)], limit=1)
                        if existing_payment:
                            # Post draft payments that were created but not yet confirmed
                            if existing_payment.state == 'draft':
                                existing_payment.sudo().action_post()
                            # Reconcile in-process payments with bank statement
                            if existing_payment.state == 'in_process':
                                link.move_id.partner_id.sudo()._reconcile_seerbit_payment(existing_payment)
                            _logger.info(f"Seerbit Webhook: Payment Link {payment_link_id} already processed.")
                            continue
                    try:
                        # Create payment, post it, and reconcile with the linked invoice
                        link._process_payment(amount, reference or f"Link Payment {payment_link_id}")
                        # Notify all logged-in users via bus broadcast
                        request.env['bus.bus'].sudo()._sendone('broadcast', 'seerbit_payment_received', {
                            'title': 'Seerbit Payment Received',
                            'message': f'Payment received for Link: {link.name}',
                        })
                        _logger.info(f"Seerbit Webhook: Processed payment link for {link.name}")
                    except Exception as e:
                        _logger.error(f"Seerbit Webhook Error processing payment link: {e}")
                else:
                    _logger.warning(f"Seerbit Webhook: Payment Link ID {payment_link_id} not found in DB.")
                continue

            # ===========================================================
            # SECTION 2: Seerbit Invoice Payments
            # Matched by invoiceNumber → account.move.seerbit_invoice_no
            # ===========================================================
            elif invoice_number:
                # Find the Odoo invoice that was synced to Seerbit with this invoice number
                move = request.env['account.move'].sudo().search([
                    ('seerbit_invoice_no', '=', invoice_number),
                    ('move_type', '=', 'out_invoice'),
                ], limit=1)
                if not move:
                    _logger.warning(f"Seerbit Webhook: Invoice number {invoice_number} not found in Odoo.")
                    continue

                # Skip if the invoice is already fully paid
                if move.payment_state in ('paid', 'in_payment', 'reversed'):
                    _logger.info(f"Seerbit Webhook: Invoice {move.name} ({invoice_number}) already settled. Skipping.")
                    continue

                # Prevent duplicate processing based on transaction reference
                if reference:
                    existing_payment = request.env['account.payment'].sudo().search([('move_id.ref', '=', reference)], limit=1)
                    if existing_payment:
                        if existing_payment.state == 'draft':
                            existing_payment.sudo().action_post()
                        if existing_payment.state == 'in_process':
                            move.partner_id.sudo()._reconcile_seerbit_payment(existing_payment)
                        _logger.info(f"Seerbit Webhook: Invoice payment {reference} already processed.")
                        continue

                try:
                    # Find the Seerbit bank journal (or fallback to any bank journal)
                    journal = request.env['account.journal'].sudo().search(
                        [('type', '=', 'bank'), ('name', 'ilike', 'Seerbit')], limit=1
                    )
                    if not journal:
                        journal = request.env['account.journal'].sudo().search(
                            [('type', '=', 'bank')], limit=1
                        )

                    payment_method = request.env.ref('account.account_payment_method_manual_in')

                    # Create the inbound payment record
                    payment_vals = {
                        'payment_type': 'inbound',
                        'partner_type': 'customer',
                        'partner_id': move.partner_id.id,
                        'amount': float(amount),
                        'journal_id': journal.id,
                        'payment_method_line_id': (
                            journal.inbound_payment_method_line_ids.filtered(
                                lambda l: l.payment_method_id == payment_method
                            )[:1].id or journal.inbound_payment_method_line_ids[:1].id
                        ),
                        'memo': reference or f"Invoice {invoice_number}",
                    }
                    payment = request.env['account.payment'].sudo().create(payment_vals)
                    # Post the payment (draft → posted)
                    payment.action_post()

                    # Auto-reconcile: match payment receivable lines with invoice receivable lines
                    payment_lines = payment.move_id.line_ids.filtered(
                        lambda line: line.account_id.account_type == 'asset_receivable' and not line.reconciled
                    )
                    invoice_lines = move.line_ids.filtered(
                        lambda line: line.account_id.account_type == 'asset_receivable'
                        and not line.reconciled
                        and payment_lines and line.account_id == payment_lines[0].account_id
                    )
                    if payment_lines and invoice_lines:
                        (payment_lines + invoice_lines).reconcile()

                    # Force bank statement reconciliation so payment state becomes 'paid'
                    if payment.state == 'in_process':
                        move.partner_id.sudo()._reconcile_seerbit_payment(payment)

                    # Update the Seerbit status on the invoice record
                    move.sudo().write({
                        'seerbit_invoice_status': 'PAID',
                    })

                    # Notify all logged-in users via bus broadcast
                    request.env['bus.bus'].sudo()._sendone('broadcast', 'seerbit_payment_received', {
                        'title': 'Seerbit Invoice Paid',
                        'message': f'Invoice {move.name} paid via Seerbit ({invoice_number})',
                    })
                    _logger.info(f"Seerbit Webhook: Processed invoice payment for {move.name} ({invoice_number})")
                except Exception as e:
                    _logger.error(f"Seerbit Webhook Error processing invoice payment for {invoice_number}: {e}", exc_info=True)
                continue

            # ===========================================================
            # SECTION 3: Virtual Account (VA) Payments
            # Matched by creditAccountNumber/accountNumber → res.partner.seerbit_va_account_number
            # ===========================================================
            elif account_number:
                # Find the partner who owns this virtual account
                partner = request.env['res.partner'].sudo().search([('seerbit_va_account_number', '=', account_number)], limit=1)
                if not partner:
                    _logger.warning(f"Seerbit Webhook: No partner found for VA {account_number}")
                    continue

                # Prevent duplicate processing based on transaction reference
                if reference:
                    existing_payment = request.env['account.payment'].sudo().search([('move_id.ref', '=', reference)], limit=1)
                    if existing_payment:
                        # Post draft payments that were created but not yet confirmed
                        if existing_payment.state == 'draft':
                            _logger.info(f"Seerbit Webhook: Found existing pending payment {reference}. Posting it...")
                            existing_payment.sudo().action_post()
                        # Reconcile in-process payments with bank statement
                        if existing_payment.state == 'in_process':
                            partner.sudo()._reconcile_seerbit_payment(existing_payment)
                            
                        _logger.info(f"Seerbit Webhook: Payment {reference} already processed/posted.")
                        continue

                try:
                    # Process the VA payment: create payment, post, reconcile oldest invoices
                    partner.sudo()._process_seerbit_va_payment(partner, amount, reference or "Webhook Payment")
                    # Notify all logged-in users via bus broadcast
                    request.env['bus.bus'].sudo()._sendone('broadcast', 'seerbit_payment_received', {
                        'title': 'Seerbit Payment Received',
                        'message': f'VA Payment of {amount} received for {partner.name}',
                    })
                    _logger.info(f"Seerbit Webhook: Processed payment of {amount} for {partner.name}")
                except Exception as e:
                    _logger.error(f"Seerbit Webhook Error processing payment: {e}")

            # ===========================================================
            # Unrecognized payload — no paymentLinkId, invoiceNumber, or accountNumber
            # ===========================================================
            else:
                _logger.warning(f"Seerbit Webhook: Unrecognized payment type — no paymentLinkId, invoiceNumber, or accountNumber. Payload: {payment_data}")

        return request.make_response(json.dumps({"status": "success", "message": "Processed"}), headers={'Content-Type': 'application/json'})
