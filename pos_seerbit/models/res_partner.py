from odoo import api, fields, models, _
from odoo.exceptions import UserError
import logging
import uuid

_logger = logging.getLogger(__name__)

class ResPartner(models.Model):
    _inherit = 'res.partner'

    seerbit_va_reference = fields.Char(string='Seerbit VA Reference', copy=False, readonly=True)
    seerbit_va_account_number = fields.Char(string='Seerbit VA Account Number', copy=False, readonly=True)
    seerbit_va_bank_name = fields.Char(string='Seerbit VA Bank Name', copy=False, readonly=True)
    seerbit_va_name = fields.Char(string='Seerbit VA Name', copy=False, readonly=True)
    
    seerbit_va_balance = fields.Monetary(
        string='Seerbit VA Balance', 
        compute='_compute_seerbit_va_balance',
        help="Outstanding credits (unreconciled inbound payments) associated with this customer's Virtual Account."
    )

    def _compute_seerbit_va_balance(self):
        for partner in self:
            balance = 0.0
            if partner.seerbit_va_account_number:
                # Find unreconciled inbound payments for this partner
                domain = [
                    ('partner_id', '=', partner.id),
                    ('payment_type', '=', 'inbound'),
                    ('state', '=', 'posted'),
                    ('is_reconciled', '=', False)
                ]
                payments = self.env['account.payment'].search(domain)
                # We consider the residual amount (unallocated portion) as the VA balance
                balance = sum(payments.mapped('amount_residual'))
            partner.seerbit_va_balance = balance

    @api.model_create_multi
    def create(self, vals_list):
        partners = super(ResPartner, self).create(vals_list)
        for partner in partners:
            if not partner.parent_id and partner.email:
                # Attempt to auto-create VA if email is provided and it's a top-level contact (individual or company)
                try:
                    partner.action_create_seerbit_va()
                except Exception as e:
                    _logger.warning(f"Could not auto-create Seerbit VA for {partner.name}: {e}")
        return partners

    def action_create_seerbit_va(self):
        self.ensure_one()
        if self.seerbit_va_account_number:
            raise UserError(_("Virtual Account already exists for this customer."))
        if not self.email:
            raise UserError(_("Customer must have an email address to create a Virtual Account."))
            
        SeerbitAPI = self.env['pos_seerbit.services']._get_api() if hasattr(self.env, 'pos_seerbit.services') else None
        if not SeerbitAPI:
            from ..services.seerbit_api import SeerbitAPI as APIClass
            SeerbitAPI = APIClass(self.env)
            
        reference = f"VA_{self.id}_{uuid.uuid4().hex[:8]}"
        
        try:
            res = SeerbitAPI.create_virtual_account(
                full_name=self.name,
                reference=reference,
                email=self.email
            )
            
            payments_data = res.get('payments', {})
            
            self.write({
                'seerbit_va_reference': payments_data.get('reference', reference),
                'seerbit_va_account_number': payments_data.get('accountNumber'),
                'seerbit_va_bank_name': payments_data.get('bankName'),
                'seerbit_va_name': payments_data.get('walletName'),
            })
            
            # Create a bank account record in Odoo
            bank = self.env['res.bank'].search([('name', '=', payments_data.get('bankName'))], limit=1)
            if not bank:
                bank = self.env['res.bank'].create({'name': payments_data.get('bankName')})
                
            self.env['res.partner.bank'].create({
                'acc_number': payments_data.get('accountNumber'),
                'partner_id': self.id,
                'bank_id': bank.id,
            })
            
        except Exception as e:
            raise UserError(_("Error creating Virtual Account: %s" % str(e)))

    def action_delete_seerbit_va(self):
        self.ensure_one()
        if not self.seerbit_va_reference:
            raise UserError(_("No Virtual Account to delete."))
            
        from ..services.seerbit_api import SeerbitAPI
        api_client = SeerbitAPI(self.env)
        
        try:
            api_client.delete_virtual_account(self.seerbit_va_reference)
        except Exception as e:
            _logger.warning(f"Failed to delete VA from Seerbit API: {e}")
            
        # Archive bank account
        partner_bank = self.env['res.partner.bank'].search([
            ('acc_number', '=', self.seerbit_va_account_number),
            ('partner_id', '=', self.id)
        ], limit=1)
        if partner_bank:
            partner_bank.active = False
            
        self.write({
            'seerbit_va_reference': False,
            'seerbit_va_account_number': False,
            'seerbit_va_bank_name': False,
            'seerbit_va_name': False,
        })

    @api.model
    def _cron_spool_seerbit_payments(self):
        # Spool payments for partners with VAs
        partners = self.search([('seerbit_va_account_number', '!=', False)])
        if not partners:
            return
            
        # Get Payment using account number
        # URL: https://seerbitapi.com/api/v2/virtual-accounts/YOUR_PUBLIC_KEY/{{accountNumber}}
        from ..services.seerbit_api import SeerbitAPI
        api_client = SeerbitAPI(self.env)
        
        import requests
        headers = {
            'Authorization': f'Bearer {api_client.secret_key}'
        }
        
        for partner in partners:
            url = f'https://seerbitapi.com/api/v2/virtual-accounts/{api_client.public_key}/{partner.seerbit_va_account_number}'
            try:
                response = requests.get(url, headers=headers, timeout=10)
                if response.status_code == 200:
                    res_data = response.json()
                    if res_data.get('status') == 'SUCCESS' and 'data' in res_data:
                        payload = res_data['data'].get('payload', [])
                        for payment in payload:
                            # Verify if payment is already processed in Odoo
                            # We can use paymentReference or internalreference as memo/ref
                            ref = payment.get('paymentReference')
                            amount = payment.get('amount')
                            
                            existing_payment = self.env['account.payment'].search([
                                ('ref', '=', ref)
                            ], limit=1)
                            
                            if not existing_payment and amount:
                                _logger.info(f"Cron: Found missing payment {ref} for {partner.name}. Processing...")
                                self._process_seerbit_va_payment(partner, amount, ref)
            except Exception as e:
                _logger.error(f"Error spooling payments for VA {partner.seerbit_va_account_number}: {e}")

    def _process_seerbit_va_payment(self, partner, amount, reference):
        """Processes a VA payment: creates payment, reconciles oldest invoices."""
        # Find Seerbit Bank Journal
        journal = self.env['account.journal'].search([('type', '=', 'bank'), ('name', 'ilike', 'Seerbit')], limit=1)
        if not journal:
            journal = self.env['account.journal'].search([('type', '=', 'bank')], limit=1)
            
        payment_method = self.env.ref('account.account_payment_method_manual_in')
        
        payment_vals = {
            'payment_type': 'inbound',
            'partner_type': 'customer',
            'partner_id': partner.id,
            'amount': float(amount),
            'journal_id': journal.id,
            'payment_method_line_id': journal.inbound_payment_method_line_ids.filtered(lambda l: l.payment_method_id == payment_method)[:1].id or journal.inbound_payment_method_line_ids[:1].id,
            'ref': reference,
        }
        
        payment = self.env['account.payment'].create(payment_vals)
        payment.action_post()
        
        # Settle oldest invoices
        invoices = self.env['account.move'].search([
            ('partner_id', '=', partner.id),
            ('move_type', '=', 'out_invoice'),
            ('state', '=', 'posted'),
            ('payment_state', 'in', ['not_paid', 'partial'])
        ], order='invoice_date asc, id asc')
        
        payment_lines = payment.line_ids.filtered(lambda line: line.account_id.account_type == 'asset_receivable' and not line.reconciled)
        
        for invoice in invoices:
            if not payment_lines:
                break
            invoice_lines = invoice.line_ids.filtered(lambda line: line.account_id.account_type == 'asset_receivable' and not line.reconciled)
            if invoice_lines:
                (payment_lines + invoice_lines).reconcile()
                payment_lines = payment.line_ids.filtered(lambda line: line.account_id.account_type == 'asset_receivable' and not line.reconciled)
