odoo.define('pos_seerbit.PaymentScreen', function(require) {
    "use strict";

    const PaymentScreen = require('point_of_sale.PaymentScreen');
    const Registries = require('point_of_sale.Registries');
    const { onMounted } = owl;

    const PosSeerbitPaymentScreen = PaymentScreen => class extends PaymentScreen {
        setup() {
        super.setup();
            onMounted(() => {
                const pendingPaymentLine = this.currentOrder.paymentlines.find(
                    paymentLine => paymentLine.payment_method.use_payment_terminal === 'seerbit' &&
                        (!paymentLine.is_done() && paymentLine.get_payment_status() !== 'pending')
                );
                if (pendingPaymentLine) {
                    const paymentTerminal = pendingPaymentLine.payment_method.payment_terminal;
                    paymentTerminal.set_most_recent_service_id(pendingPaymentLine.terminalServiceId);
                    pendingPaymentLine.set_payment_status('waitingSeerbit');
                    paymentTerminal.start_get_status_polling().then(isPaymentSuccessful => {
                        if (isPaymentSuccessful) {
                            pendingPaymentLine.set_payment_status('done');
                            pendingPaymentLine.can_be_reversed = paymentTerminal.supports_reversals;
                        } else {
                            pendingPaymentLine.set_payment_status('retry');
                        }
                    });
                }
            });
        }
    };

    Registries.Component.extend(PaymentScreen, PosSeerbitPaymentScreen);

    return PaymentScreen;
});
