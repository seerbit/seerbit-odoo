odoo.define('pos_seerbit.PaymentScreen', function(require) {
    "use strict";

    const PaymentScreen = require('point_of_sale.PaymentScreen');
    const Registries = require('point_of_sale.Registries');
    const { onMounted } = owl;

    const PosSeerbitPaymentScreen = PaymentScreen => class extends PaymentScreen {
        setup() {
        super.setup();
            onMounted(() => {
                console.log('PosSeerbitPaymentScreen: onMounted called');
                
                if (!this.currentOrder || !this.currentOrder.paymentlines) {
                    console.log('No current order or payment lines available');
                    return;
                }

                const pendingPaymentLine = this.currentOrder.paymentlines.find(
                    paymentLine => paymentLine.payment_method.use_payment_terminal === 'seerbit' &&
                        (!paymentLine.is_done() && paymentLine.get_payment_status() !== 'pending')
                );
                
                if (pendingPaymentLine) {
                    console.log('Found pending Seerbit payment line:', pendingPaymentLine);
                    const paymentTerminal = pendingPaymentLine.payment_method.payment_terminal;
                    
                    console.log('Payment terminal:', paymentTerminal);
                    console.log('Payment terminal methods:', paymentTerminal ? Object.getOwnPropertyNames(paymentTerminal) : 'No terminal');
                    
                    // Check if payment terminal and its methods are available
                    if (paymentTerminal && typeof paymentTerminal.start_get_status_polling === 'function') {
                        console.log('Starting payment polling...');
                    pendingPaymentLine.set_payment_status('waitingSeerbit');
                    paymentTerminal.start_get_status_polling().then(isPaymentSuccessful => {
                            console.log('Payment polling result:', isPaymentSuccessful);
                        if (isPaymentSuccessful) {
                            pendingPaymentLine.set_payment_status('done');
                                pendingPaymentLine.can_be_reversed = paymentTerminal.supports_reversals || false;
                        } else {
                            pendingPaymentLine.set_payment_status('retry');
                        }
                        }).catch(error => {
                            console.error('Error during payment polling:', error);
                            pendingPaymentLine.set_payment_status('errorSeerbit');
                        });
                    } else {
                        console.warn('Payment terminal or start_get_status_polling method not available');
                        console.warn('Payment terminal:', paymentTerminal);
                        console.warn('start_get_status_polling method:', paymentTerminal ? typeof paymentTerminal.start_get_status_polling : 'undefined');
                        // Set a default status if terminal is not available
                        pendingPaymentLine.set_payment_status('waitingSeerbit');
                    }
                } else {
                    console.log('No pending Seerbit payment line found');
                }
            });
        }
    };

    Registries.Component.extend(PaymentScreen, PosSeerbitPaymentScreen);

    return PaymentScreen;
});
