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

        // Event handlers for custom buttons
        async onSendForceDone(line) {
            // Force confirm the payment
            line.set_payment_status('done');
            line.set_receipt_info('Force confirmed by user');
            line.transaction_id = 'FORCE_' + Date.now();
            line.card_type = 'Seerbit';
            line.cardholder_name = 'Seerbit Payment (Force)';
            
            // Clear any pending transactions
            localStorage.removeItem('pending_transaction');
            localStorage.removeItem('completed_transaction');
        }

        async onSendPaymentRequest(line) {
            // Retry the payment request
            const paymentTerminal = line.payment_method.payment_terminal;
            if (paymentTerminal) {
                line.set_payment_status('waitingSeerbit');
                try {
                    await paymentTerminal.send_payment_request(line.cid);
                } catch (error) {
                    console.error('Payment retry failed:', error);
                    line.set_payment_status('errorSeerbit');
                }
            }
        }
    }

    Registries.Component.extend(PaymentScreen, PosSeerbitPaymentScreen);
    return PaymentScreen;
});
