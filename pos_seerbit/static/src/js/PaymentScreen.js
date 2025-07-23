/** @odoo-module **/

import { PaymentScreen } from '@point_of_sale/app/screens/payment_screen/payment_screen';
import { patch } from '@web/core/utils/patch';
import { onMounted } from '@odoo/owl';

// Patch PaymentScreen to handle Seerbit payment line status
patch(PaymentScreen.prototype, {
    setup() {
        super.setup();
        onMounted(() => {
            // Set pending Seerbit payments to waiting status
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
});
