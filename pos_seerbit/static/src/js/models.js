odoo.define('pos_seerbit.models', ['point_of_sale.models', 'pos_seerbit.payment_seerbit'], function (require) {
    'use strict';

    const { register_payment_method } = require("point_of_sale.models");
    const PaymentSeerbit = require('pos_seerbit.payment_seerbit');

    register_payment_method('seerbit', PaymentSeerbit);
});