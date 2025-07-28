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
            const pendingPaymentLine = this.env.services.pos.getPendingPaymentLine('seerbit')
            if (pendingPaymentLine) {
                pendingPaymentLine.set_payment_status('waitingSeerbit');
            }
        });

    },

    
    async sendForceDone(line) {
        const payment_terminal = line.payment_method_id.payment_terminal;
         await payment_terminal.send_force_done(
            line
        );
    },
    async sendPaymentCancel(line) {
        const payment_terminal = line.payment_method_id.payment_terminal;
        line.set_payment_status("waitingSeerbit");

        console.log('cancelling seerbit payment', line.uuid);
        const isCancelSuccessful = await payment_terminal.send_payment_cancel(
            this.currentOrder,
            line.uuid
        );
        if (isCancelSuccessful) {
            line.set_payment_status("retry");
            this.pos.paymentTerminalInProgress = false;
        } else {
            line.set_payment_status("waitingCard");
        }
    }
});