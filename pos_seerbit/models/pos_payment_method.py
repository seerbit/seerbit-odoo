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

    # Seerbit Fields
    seerbit_public_key = fields.Char(string="Seerbit Public Key", help='As provided on Seerbit dashboard', copy=False)
    seerbit_latest_response = fields.Char(copy=False, groups='base.group_erp_manager') # used to buffer the latest asynchronous notification from Seerbit.
    
    @api.constrains('seerbit_public_key')
    def _check_seerbit_autoconfirm(self):
        for payment_method in self:
            if not (payment_method.seerbit_public_key):
                continue
            # Payment methods are now expected to separate at the account levels irrepective of the number of terminals
            existing_key = self.search(
                [('id', '!=', payment_method.id),
                    ('seerbit_public_key', '=', payment_method.seerbit_public_key)],
                limit=1)
        
            if existing_key:
                raise ValidationError(_('Seerbit key %s is already used on payment method %s.')
                                % (payment_method.seerbit_public_key, existing_key.display_name))


    def _is_write_forbidden(self, fields):
        whitelisted_fields = {'seerbit_latest_response'}
        return super(PosPaymentMethod, self)._is_write_forbidden(fields - whitelisted_fields)


    def get_latest_seerbit_status(self, expected):
        self.ensure_one()
        stored = self.sudo().seerbit_latest_response
        if stored:
            stored=json.loads(stored)
            # A notification exists, we now have to compare with expected val
            if (expected["Currency"] == stored['data']['currency'] and
                round(float(expected['RequestedAmount']),2) == stored['data']['amount']):
                self.sudo().seerbit_latest_response = '' # Avoid reusing responses
                return {'latest_response': stored,}
        return False
