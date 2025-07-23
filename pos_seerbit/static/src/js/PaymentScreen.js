/** @odoo-module **/

import { PaymentScreen } from '@point_of_sale/app/screens/payment_screen/payment_screen';
import { patch } from '@web/core/utils/patch';
import { onMounted } from '@odoo/owl';

patch(PaymentScreen.prototype, {
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
    },

    // We are adding the new methods here
    
    /**
     * This method is called when the 'Retry' button is clicked.
     * It finds the correct payment interface and calls its send_payment_request method.
     * @param {Object} line The payment line object passed from the template.
     */
    async send_payment_request(line) {
        const payment_line = this.currentOrder.get_paymentline(line.cid);
        if (payment_line) {
            // This calls the method on our actual PaymentInterface
            payment_line.payment_method.payment_terminal.send_payment_request(line.cid);
        }
    },

    /**
     * This method handles the 'Force Confirm' action.
     * @param {Object} line The payment line object passed from the template.
     */
    async send_force_done(line) {
        const payment_line = this.currentOrder.get_paymentline(line.cid);
        if (payment_line) {
            // This calls the method on our actual PaymentInterface
            payment_line.payment_method.payment_terminal.send_force_done(line.cid);
        }
    },
    
    
});
