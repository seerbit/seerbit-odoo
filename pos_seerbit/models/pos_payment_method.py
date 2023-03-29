# coding: utf-8
import json
import logging
import pprint
import random
import string
from werkzeug.exceptions import Forbidden

from odoo import fields, models, api, _
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)

class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    def _get_payment_terminal_selection(self):
        return super(PosPaymentMethod, self)._get_payment_terminal_selection() + [('seerbit', 'Seerbit')]

    # Seerbit
    seerbit_public_key = fields.Char(string="Seerbit Public Key", help='As provided on Seerbit dashboard', copy=False)
    seerbit_secret_key = fields.Char(string="Seerbit secret Key", help='As provided on Seerbit dashboard', copy=False)
    seerbit_terminal_identifier = fields.Char(help='Written with hypen under the terminal, for example: KM0EB1BEL-GPVRTZ', copy=False)
    
    seerbit_latest_response = fields.Char(copy=False, groups='base.group_erp_manager') # used to buffer the latest asynchronous notification from Seerbit.
    #seerbit_latest_diagnosis = fields.Char(copy=False, groups='base.group_erp_manager') # used to determine if the terminal is still connected.

    @api.constrains('seerbit_public_key', 'seerbit_terminal_identifier')
    def _check_seerbit_autoconfirm(self):
        for payment_method in self:
            if not (payment_method.seerbit_public_key):
                continue
            # When terminal id is given, payment methods are expected to be for separate terminals
            if payment_method.seerbit_terminal_identifier:
                existing_terminal = self.search(
                    [('id', '!=', payment_method.id),
                     ('seerbit_terminal_identifier', '=', payment_method.seerbit_terminal_identifier)],
                    limit=1)
                if existing_terminal:
                    raise ValidationError(_('Terminal %s is already used on payment method %s.')
                                      % (payment_method.seerbit_terminal_identifier, existing_terminal.display_name))
            
            else:
                # Payment methods are now expected to separate at the account levels irrepective of the number of terminals
                existing_key = self.search(
                    [('id', '!=', payment_method.id),
                     ('seerbit_public_key', '=', payment_method.seerbit_public_key)],
                    limit=1)
            
                if existing_key:
                    raise ValidationError(_('Seerbit key %s is already used on payment method %s.')
                                    % (payment_method.seerbit_public_key, existing_key.display_name))


    def _is_write_forbidden(self, fields):
        whitelisted_fields = set(('seerbit_latest_response', 'seerbit_latest_diagnosis'))
        return super(PosPaymentMethod, self)._is_write_forbidden(fields - whitelisted_fields)


    def get_latest_seerbit_status(self):
        self.ensure_one
        latest_response = self.sudo().seerbit_latest_response
        self.sudo().seerbit_latest_response = '' # Avoid reusing responses
        latest_response = json.loads(latest_response) if latest_response else False
        return {
            'latest_response': latest_response,
        }
