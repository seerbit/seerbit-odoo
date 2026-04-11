/** @odoo-module **/

import { PaymentScreen } from '@point_of_sale/app/screens/payment_screen/payment_screen';
import { patch } from '@web/core/utils/patch';
import { onWillUnmount } from '@odoo/owl';

// Odoo 19 wires terminals via register_payment_method → pos.payment.method.payment_terminal.
// Core PaymentScreen.sendPaymentRequest uses line.pay() → terminal.sendPaymentRequest → handlePaymentResponse.
// Only extend what core does not do: Seerbit cleanup on force-done and when leaving the screen.

patch(PaymentScreen.prototype, {
    setup() {
        super.setup();
        // Ensure paymentTerminalInProgress is reset when the PaymentScreen is set up
        // This handles cases where the flag might not have been reset on unmount
        // or when navigating back to the screen.
        this.pos.paymentTerminalInProgress = false;

        onWillUnmount(() => {
            this.paymentLines.forEach((line) => {
                if (
                    line.payment_method_id?.use_payment_terminal === 'seerbit' &&
                    line.payment_method_id.payment_terminal
                ) {
                    line.payment_method_id.payment_terminal.close();
                }
            });
            // Ensure paymentTerminalInProgress is reset when leaving the screen
            this.pos.paymentTerminalInProgress = false;
        });
    },

    async sendForceDone(line) {
        if (
            line.payment_method_id?.use_payment_terminal === 'seerbit' &&
            line.payment_method_id.payment_terminal?.sendForceDone
        ) {
            await line.payment_method_id.payment_terminal.sendForceDone(line);
            return;
        }
        await super.sendForceDone(line);
    },

    paymentMethodImage(id) {
        if (this.paymentMethod && this.paymentMethod.use_payment_terminal === 'seerbit') {
            return '/pos_seerbit/static/description/icon.png';
        }
        return super.paymentMethodImage(id);
    },
});
