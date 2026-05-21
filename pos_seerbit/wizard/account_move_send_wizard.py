# -*- coding: utf-8 -*-
from odoo import models, fields, api

class AccountMoveSendWizard(models.TransientModel):
    _inherit = 'account.move.send.wizard'

    send_with_seerbit = fields.Boolean(
        string="Send via Seerbit",
        default=lambda self: self.env['ir.config_parameter'].sudo().get_param('pos_seerbit.default_send_with_seerbit', 'False') == 'True'
    )

    def action_send_and_print(self, allow_fallback_pdf=False):
        # Save the preference if it changed
        current_default = self.env['ir.config_parameter'].sudo().get_param('pos_seerbit.default_send_with_seerbit', 'False') == 'True'
        if self.send_with_seerbit != current_default:
            self.env['ir.config_parameter'].sudo().set_param('pos_seerbit.default_send_with_seerbit', str(self.send_with_seerbit))

        # Call the original send and print logic
        res = super().action_send_and_print(allow_fallback_pdf=allow_fallback_pdf)

        for wizard in self:
            if wizard.send_with_seerbit and wizard.move_id:
                # Sync if not already synced
                if not wizard.move_id.synced_with_seerbit:
                    wizard.move_id.action_sync_seerbit_invoice()
                
                # If successfully synced, it will have a seerbit_invoice_no
                if wizard.move_id.seerbit_invoice_no:
                    from ..services.seerbit_api import SeerbitAPI
                    api_client = SeerbitAPI(self.env)
                    api_client.send_invoice(wizard.move_id.seerbit_invoice_no)

        return res
