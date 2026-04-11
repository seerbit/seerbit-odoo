/** @odoo-module **/

import { PaymentScreen } from '@point_of_sale/app/screens/payment_screen/payment_screen';
import { patch } from '@web/core/utils/patch';
import { onWillUnmount } from '@odoo/owl';

patch(PaymentScreen.prototype, {
    setup() {
        super.setup();
        onWillUnmount(() => this._posSeerbitOnLeavePaymentScreen());
    },

    /**
     * Leaving payment screen (Back): clear terminal wait, reset Seerbit lines stuck in "request sent", deselect line.
     */
    _posSeerbitOnLeavePaymentScreen() {
        const order = this.currentOrder;
        if (!order) {
            return;
        }
        const pending = ['waiting', 'waitingCancel', 'waitingCapture'];
        for (const line of this.paymentLines) {
            if (line.payment_method_id?.use_payment_terminal !== 'seerbit') {
                continue;
            }
            const st = line.getPaymentStatus?.() ?? line.payment_status;
            if (pending.includes(st)) {
                line.payment_method_id.payment_terminal?.close?.();
                line.setPaymentStatus('retry');
            }
        }
        order.selectPaymentline(undefined);
        this.numberBuffer?.reset?.();
    },

    /**
     * Resend: cancel in-flight Firestore wait, then start a new terminal pay flow (same as Retry after abort).
     */
    async resendPaymentRequest(line) {
        if (!line?.payment_method_id?.payment_terminal) {
            return this.sendPaymentRequest(line);
        }
        if (line.payment_method_id.use_payment_terminal !== 'seerbit') {
            return this.sendPaymentRequest(line);
        }
        await line.payment_method_id.payment_terminal.sendPaymentCancel(this.currentOrder, line.uuid);
        await new Promise((resolve) => queueMicrotask(resolve));
        line.setPaymentStatus('waiting');
        return this.sendPaymentRequest(line);
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
