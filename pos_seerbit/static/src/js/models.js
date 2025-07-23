/** @odoo-module **/

const { register_payment_method } = require("point_of_sale.models");
import PaymentSeerbit from './payment_seerbit';

register_payment_method('seerbit', PaymentSeerbit);