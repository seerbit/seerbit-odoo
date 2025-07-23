odoo.define('pos_seerbit.models', ['point_of_sale.models', './payment_seerbit'], function (require) {
    'use strict';

    const { register_payment_method } = require("point_of_sale.models");
    const PaymentSeerbit = require('./payment_seerbit');

    register_payment_method('seerbit', PaymentSeerbit);
});