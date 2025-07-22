odoo.define('pos_seerbit.models', function (require) {
    const { register_payment_method } = require('point_of_sale.models');
    const PaymentSeerbit = require('pos_seerbit.payment');
    register_payment_method('seerbit', PaymentSeerbit);
});