from odoo import api, fields, models, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)

class AccountMove(models.Model):
    _inherit = 'account.move'

    synced_with_seerbit = fields.Boolean(string='Synced with Seerbit', default=False, copy=False)
    seerbit_invoice_no = fields.Char(string='Seerbit Invoice No', copy=False, readonly=True)
    seerbit_invoice_status = fields.Char(string='Seerbit Status', copy=False, readonly=True)

    @api.model_create_multi
    def create(self, vals_list):
        moves = super(AccountMove, self).create(vals_list)
        return moves

    def action_post(self):
        res = super(AccountMove, self).action_post()
        for move in self:
            if move.move_type == 'out_invoice' and move.partner_id and not move.synced_with_seerbit:
                try:
                    move.action_sync_seerbit_invoice()
                except Exception as e:
                    _logger.warning(f"Auto-sync Seerbit Invoice failed for {move.name}: {e}")
        return res

    def write(self, vals):
        res = super(AccountMove, self).write(vals)
        # Rerun invoice creation if items change
        if 'invoice_line_ids' in vals or 'line_ids' in vals:
            for move in self:
                if move.synced_with_seerbit and move.state == 'posted' and move.move_type == 'out_invoice':
                    try:
                        move.action_sync_seerbit_invoice()
                    except Exception as e:
                        _logger.warning(f"Re-sync Seerbit Invoice failed for {move.name}: {e}")
        return res

    def action_sync_seerbit_invoice(self):
        self.ensure_one()
        if self.move_type != 'out_invoice':
            raise UserError(_("Only Customer Invoices can be synced to Seerbit."))
            
        from ..services.seerbit_api import SeerbitAPI
        api_client = SeerbitAPI(self.env)
        
        # If already synced, check status before updating
        if self.seerbit_invoice_no:
            existing_invoice = api_client.get_invoice(self.seerbit_invoice_no)
            if existing_invoice:
                status = existing_invoice.get('status', '').upper()
                if status in ['PAID', 'SUCCESS']:
                    raise UserError(_("The Seerbit invoice is already paid. Please create changes on a new invoice instead of modifying this one."))
            # Attempt to delete the existing invoice on Seerbit before creating a new one
            api_client.delete_invoice(self.seerbit_invoice_no)
        
        # Prepare invoice items
        invoice_items = []
        for line in self.invoice_line_ids:
            if line.display_type == 'product':
                tax_amount = sum(line.tax_ids.mapped('amount')) if line.tax_ids else 0.0
                invoice_items.append({
                    "itemName": line.name or line.product_id.name,
                    "quantity": line.quantity,
                    "rate": line.price_unit,
                    "tax": tax_amount
                })
                
        # Handle cases where Seerbit might need at least 1 item
        if not invoice_items:
            invoice_items.append({
                "itemName": "General Description",
                "quantity": 1,
                "rate": self.amount_total,
                "tax": 0.0
            })

        due_date = self.invoice_date_due.strftime('%Y-%m-%d') if self.invoice_date_due else fields.Date.today().strftime('%Y-%m-%d')
        
        res = api_client.create_invoice(
            order_no=self.name or str(self.id),
            due_date=due_date,
            currency=self.currency_id.name,
            receivers_name=self.partner_id.name,
            customer_email=self.partner_id.email or 'no-email@example.com',
            invoice_items=invoice_items
        )
        
        self.write({
            'seerbit_invoice_no': res.get('InvoiceNo'),
            'synced_with_seerbit': True
        })

    def action_check_seerbit_status(self):
        for move in self:
            if not move.seerbit_invoice_no:
                continue
                
            from ..services.seerbit_api import SeerbitAPI
            api_client = SeerbitAPI(self.env)
            
            res = api_client.get_invoice(move.seerbit_invoice_no)
            if res:
                # Update status if needed (e.g., if Seerbit API returns PAID)
                status = res.get('status', '').upper()
                move.seerbit_invoice_status = status
                
                if status in ['PAID', 'SUCCESS'] and move.payment_state in ['not_paid', 'partial']:
                    # Mark the invoice as paid by creating a payment and reconciling it
                    journal = self.env['account.journal'].search([('type', '=', 'bank'), ('name', 'ilike', 'Seerbit')], limit=1)
                    if not journal:
                        journal = self.env['account.journal'].search([('type', '=', 'bank')], limit=1)
                        
                    payment_method = self.env.ref('account.account_payment_method_manual_in')
                    
                    payment_vals = {
                        'payment_type': 'inbound',
                        'partner_type': 'customer',
                        'partner_id': move.partner_id.id,
                        'amount': move.amount_residual,
                        'journal_id': journal.id,
                        'payment_method_line_id': journal.inbound_payment_method_line_ids.filtered(lambda l: l.payment_method_id == payment_method)[:1].id or journal.inbound_payment_method_line_ids[:1].id,
                        'ref': f"Sync: {move.seerbit_invoice_no}",
                    }
                    payment = self.env['account.payment'].create(payment_vals)
                    payment.action_post()
                    
                    # Reconcile specifically with this invoice
                    payment_lines = payment.line_ids.filtered(lambda line: line.account_id.account_type == 'asset_receivable' and not line.reconciled)
                    invoice_lines = move.line_ids.filtered(lambda line: line.account_id.account_type == 'asset_receivable' and not line.reconciled)
                    
                    if payment_lines and invoice_lines:
                        (payment_lines + invoice_lines).reconcile()
                    
    def action_check_all_seerbit_status(self):
        invoices = self.search([('synced_with_seerbit', '=', True), ('state', '=', 'posted')])
        invoices.action_check_seerbit_status()

    def action_send_payment_to_pos(self):
        self.ensure_one()
        # "Pushes the outstanding/due amount based on terms of payment"
        amount_due = self.amount_residual
        if amount_due <= 0:
            raise UserError(_("There is no outstanding amount to send to POS."))
            
        pos_method = self.env['pos.payment.method'].search([('seerbit_public_key', '!=', False)], limit=1)
        if not pos_method:
            raise UserError(_("No Seerbit POS payment method configured."))
            
        payload = {
            'id': str(self.id),
            'posid': pos_method.seerbit_terminal_id,
            'merchantid': "Odoo",
            'metadata': f"Invoice {self.name}",
            'transactionValue': str(amount_due),
            'status': "PENDING",
            'transactionTime': fields.Datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            'sessionId': f"INV-{self.id}",
            'receivedDateTime': fields.Datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            'transactionRef': f"INV-{self.id}",
            'pubkey': pos_method.seerbit_public_key,
        }
        
        # Uses the existing Firestore push logic
        pos_method.send_seerbit_payment_request(payload)
