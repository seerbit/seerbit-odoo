odoo.define('pos_seerbit.models', function (require) {
    var models = require('point_of_sale.models');
    var PaymentSeerbit = require('pos_seerbit.payment');
    models.register_payment_method('seerbit', PaymentSeerbit);
});
    