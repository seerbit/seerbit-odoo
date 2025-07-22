odoo.define('pos_seerbit.models', function (require) {
    "use strict";
    
    const { register_payment_method } = require('point_of_sale.models');
    const PaymentSeerbit = require('pos_seerbit.payment');
    
    // Register the Seerbit payment method for Odoo 17/18
    register_payment_method('seerbit', PaymentSeerbit);
});