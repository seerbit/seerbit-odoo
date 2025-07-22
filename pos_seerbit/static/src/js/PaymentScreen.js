odoo.define('pos_seerbit.PaymentScreen', function(require) {
    "use strict";

    const PaymentScreen = require('point_of_sale.PaymentScreen');
    const Registries = require('point_of_sale.Registries');

    const PosSeerbitPaymentScreen = PaymentScreen => class extends PaymentScreen {
        // Override the send payment method to handle Seerbit specifically
        async sendPayment(cid) {
            const paymentLine = this.currentOrder.paymentlines.find(line => line.cid === cid);
            
            if (paymentLine?.payment_method?.use_payment_terminal === 'seerbit') {
                // For Seerbit, we need to trigger the payment request
                const paymentTerminal = paymentLine.payment_method.payment_terminal;
                if (paymentTerminal && typeof paymentTerminal.send_payment_request === 'function') {
                    try {
                        await paymentTerminal.send_payment_request(cid);
                        // The payment status will be updated by the polling mechanism
                    } catch (error) {
                        console.error('Seerbit payment request failed:', error);
                        paymentLine.set_payment_status('errorSeerbit');
                    }
                }
            } else {
                // For other payment methods, use the default behavior
                await super.sendPayment(cid);
            }
        }

        // Handle force confirm for Seerbit payments
        async forceConfirmPayment(cid) {
            const paymentLine = this.currentOrder.paymentlines.find(line => line.cid === cid);
            if (paymentLine?.payment_method?.use_payment_terminal === 'seerbit') {
                paymentLine.set_payment_status('done');
                // Clear any pending transactions
                localStorage.removeItem('pending_transaction');
                localStorage.removeItem('completed_transaction');
            }
        }

        // Handle retry for Seerbit payments
        async retryPayment(cid) {
            const paymentLine = this.currentOrder.paymentlines.find(line => line.cid === cid);
            if (paymentLine?.payment_method?.use_payment_terminal === 'seerbit') {
                paymentLine.set_payment_status('waitingSeerbit');
                await this.sendPayment(cid);
            }
        }
    }

    Registries.Component.extend(PaymentScreen, PosSeerbitPaymentScreen);
    return PaymentScreen;
});
