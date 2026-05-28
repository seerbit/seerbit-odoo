# -*- coding: utf-8 -*-
from odoo import models, fields, api
import re

class SeerbitPaymentLink(models.Model):
    _name = 'pos_seerbit.payment.link'
    _description = 'Seerbit Payment Link'
    _order = 'create_date desc'

    move_id = fields.Many2one('account.move', string="Invoice", required=True, ondelete='cascade')
    name = fields.Char(string="Link Name")
    amount = fields.Float(string="Amount")
    description = fields.Char(string="Description")
    link_url = fields.Char(string="URL", readonly=True)
    seerbit_link_id = fields.Char(string="Seerbit Link ID", readonly=True)
    
    state = fields.Selection([
        ('pending', 'Pending'),
        ('paid', 'Paid')
    ], string="Status", default="pending", readonly=True)
    payment_id = fields.Many2one('account.payment', string="Payment", readonly=True)
    
    def action_open_link(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_url',
            'url': self.link_url,
            'target': 'new',
        }

    def _process_payment(self, amount, reference):
        self.ensure_one()
        if self.state == 'paid':
            return
            
        move = self.move_id
        partner = move.partner_id
        
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
            'memo': reference,
        }
        
        payment = self.env['account.payment'].create(payment_vals)
        payment.action_post()
        
        partner.sudo()._reconcile_seerbit_payment(payment)
        
        # Settle this specific invoice
        payment_lines = payment.move_id.line_ids.filtered(lambda line: line.account_id.account_type == 'asset_receivable' and not line.reconciled)
        invoice_lines = move.line_ids.filtered(lambda line: line.account_id.account_type == 'asset_receivable' and not line.reconciled)
        
        if payment_lines and invoice_lines:
            (payment_lines + invoice_lines).reconcile()
            
        self.write({
            'state': 'paid',
            'payment_id': payment.id
        })

    @api.model_create_multi
    def create(self, vals_list):
        from ..services.seerbit_api import SeerbitAPI
        api_client = SeerbitAPI(self.env)
        
        for vals in vals_list:
            if not vals.get('link_url'):
                move = self.env['account.move'].browse(vals.get('move_id'))
                amount = vals.get('amount') or move.amount_residual
                currency = move.currency_id.name or self.env.company.currency_id.name
                email = move.partner_id.email or 'no-email@example.com'
                desc = vals.get('description') or move.name
                
                name = vals.get('name')
                if not name:
                    import uuid
                    name = f"INV-{move.id}-{uuid.uuid4().hex[:4]}"
                    vals['name'] = name
                    
                if not vals.get('amount'):
                    vals['amount'] = amount
                if not vals.get('description'):
                    vals['description'] = desc
                    
                link_data = api_client.create_payment_link(
                    amount=amount,
                    currency=currency,
                    email=email,
                    description=desc,
                    paymentLinkName=name,
                    oneTime=True
                )
                if link_data:
                    vals['link_url'] = link_data.get('paymentLinkUrl')
                    vals['seerbit_link_id'] = link_data.get('paymentLinkId')
                    
        return super().create(vals_list)

    def write(self, vals):
        res = super().write(vals)
        if any(f in vals for f in ['name', 'amount', 'description']):
            from ..services.seerbit_api import SeerbitAPI
            api_client = SeerbitAPI(self.env)
            for record in self.filtered(lambda r: r.seerbit_link_id):
                move = record.move_id
                currency = move.currency_id.name or self.env.company.currency_id.name
                email = move.partner_id.email or 'no-email@example.com'
                
                api_client.update_payment_link(
                    payment_link_id=record.seerbit_link_id,
                    amount=record.amount,
                    currency=currency,
                    email=email,
                    description=record.description or move.name,
                    paymentLinkName=record.name or move.name,
                    oneTime=True
                )
        return res

    def unlink(self):
        from ..services.seerbit_api import SeerbitAPI
        api_client = SeerbitAPI(self.env)
        for record in self:
            if record.seerbit_link_id:
                api_client.delete_payment_link(record.seerbit_link_id)
        return super().unlink()
