odoo.define('pos_seerbit.PaymentScreen', function (require) {
    'use strict';

    const { PaymentScreen } = require("point_of_sale.PaymentScreen");
    const { Registries } = require("point_of_sale.Registries");
    const { onMounted } = require("owl");

    const PosSeerbitPaymentScreen = (PaymentScreen) => class extends PaymentScreen {
        setup() {
            super.setup();
            onMounted(() => {
                const pendingPaymentLine = this.currentOrder.paymentlines.find(
                    paymentLine => paymentLine.payment_method.use_payment_terminal === 'seerbit' &&
                        (!paymentLine.is_done() && paymentLine.get_payment_status() !== 'pending')
                );
                if (pendingPaymentLine) {
                    const paymentTerminal = pendingPaymentLine.payment_method.payment_terminal;
                    pendingPaymentLine.set_payment_status('waitingSeerbit');
                }
            });
        }
    };

    Registries.Component.extend(PaymentScreen, PosSeerbitPaymentScreen);

    return PosSeerbitPaymentScreen;
});
