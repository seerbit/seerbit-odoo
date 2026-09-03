# -*- coding: utf-8 -*-
from odoo import models


class PosSession(models.Model):
    _inherit = "pos.session"

    # Seerbit POS fields are loaded via pos.payment.method._load_pos_data_fields
    # (Odoo 19). The old _loader_params_pos_payment_method hook no longer exists.
