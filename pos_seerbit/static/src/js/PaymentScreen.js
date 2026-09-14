/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { onMounted, onWillUnmount } from "@odoo/owl";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup(...arguments);
        onMounted(() => {
            const pendingPaymentLine = this.pos.getPendingPaymentLine("seerbit");
            if (pendingPaymentLine) {
                pendingPaymentLine.setPaymentStatus("waitingSeerbit");
            }
        });

        onWillUnmount(() => {
            this.paymentLines.forEach((line) => {
                if (line.payment_method_id.use_payment_terminal === "seerbit") {
                    line.payment_method_id.payment_terminal?.close?.();
                }
            });
        });
    },

    async sendForceDone(line) {
        const payment_terminal = line.payment_method_id.payment_terminal;
        if (payment_terminal?.sendForceDone) {
            await payment_terminal.sendForceDone(line);
        }
        return super.sendForceDone(line);
    },

    paymentMethodImage(id) {
        const method = this.payment_methods_from_config.find((m) => m.id === id);
        if (method?.use_payment_terminal === "seerbit") {
            return "/pos_seerbit/static/description/icon.png";
        }
        return super.paymentMethodImage(id);
    },

    deletePaymentLine(uuid) {
        const line = this.paymentLines.find((paymentLine) => paymentLine.uuid === uuid);
        if (
            line &&
            ["waitingSeerbit", "errorSeerbit"].includes(line.getPaymentStatus()) &&
            line.payment_method_id.payment_terminal
        ) {
            line.setPaymentStatus("waitingCancel");
            line.payment_method_id.payment_terminal
                .sendPaymentCancel(this.currentOrder, uuid)
                .then(() => {
                    this.currentOrder.removePaymentline(line);
                    this.numberBuffer.reset();
                });
            return;
        }
        return super.deletePaymentLine(uuid);
    },
});
