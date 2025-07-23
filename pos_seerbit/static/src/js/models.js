/** @odoo-module **/

import { paymentMethods } from 'point_of_sale.models';
import PaymentSeerbit from './payment_seerbit';

paymentMethods.add('seerbit', PaymentSeerbit);
