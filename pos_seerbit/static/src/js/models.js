/** @odoo-module **/

import { register_payment_method } from 'point_of_sale.models';
import PaymentSeerbit from './payment_seerbit';

register_payment_method('seerbit', PaymentSeerbit);