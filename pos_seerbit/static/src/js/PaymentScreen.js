odoo.define('pos_seerbit.PaymentScreen', function(require) {
    "use strict";

    const { patch } = require('web.utils');
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
            this.env.bus.on('send-payment-request', this, this._onSendPaymentRequest);
        }

        async sendPaymentRequestSeerbit(line) {
            if (line.payment_method.use_payment_terminal === 'seerbit') {
                if (line.payment_terminal && line.payment_terminal.send_payment_request) {
                    await line.payment_terminal.send_payment_request(line.cid);
                }
            }
        }

        async _onSendPaymentRequest(ev) {
            const line = ev.detail;
            await this.sendPaymentRequestSeerbit(line);
        }
    }

    Registries.Component.extend(PaymentScreen, PosSeerbitPaymentScreen);
    return PaymentScreen;
});

odoo.define('pos_seerbit.PaymentScreenPaymentLines', function(require) {
    "use strict";

    const { patch } = require('web.utils');
    const PaymentScreenPaymentLines = require('point_of_sale.PaymentScreenPaymentLines');

    patch(PaymentScreenPaymentLines.prototype, {
        setup() {
            super.setup();
            console.log('[Seerbit] PaymentScreenPaymentLines loaded');
        },
        async _onSendPaymentRequest(ev) {
            const line = ev.detail;
            console.log('[Seerbit] Send Payment Request triggered for line:', line);
            if (line.payment_method.use_payment_terminal === 'seerbit') {
                if (line.payment_terminal && line.payment_terminal.send_payment_request) {
                    await line.payment_terminal.send_payment_request(line.cid);
                }
            }
        },
    });
});
