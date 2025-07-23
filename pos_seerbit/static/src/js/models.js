/** @odoo-module **/

import { register_payment_method } from 'point_of_sale/models';
import PaymentSeerbit from 'pos_seerbit/payment';

// Register seerbit payment terminal interface:
register_payment_method('seerbit', PaymentSeerbit);
