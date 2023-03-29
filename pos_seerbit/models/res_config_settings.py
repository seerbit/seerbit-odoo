# -*- coding: utf-8 -*-
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    module_pos_seerbit = fields.Boolean(
        string="Seerbit Payment Terminal",
        help='''Transactions will be processed and synced with your Seerbit POS Termial
                Set your terminal credientials on payment method''')

    def set_values(self):
        super(ResConfigSettings, self).set_values()
        payment_methods = self.env['pos.payment.method']
        if not self.env['ir.config_parameter'].sudo().get_param('pos_seerbit.module_pos_seerbit'):
            payment_methods |= payment_methods.search(
                [('use_payment_terminal', '=', 'seerbit')])
            payment_methods.write({'use_payment_terminal': False})
