/** @odoo-module **/

import { PaymentScreen } from '@point_of_sale/app/screens/payment_screen/payment_screen';
import { patch } from '@web/core/utils/patch';
import { onMounted, onWillUnmount } from '@odoo/owl';

// Patch PaymentScreen to handle Seerbit payment line status
patch(PaymentScreen.prototype, {
    setup() {
        super.setup();
        // onMounted(() => {
        //     // Set pending Seerbit payments to waiting status
        //     const pendingPaymentLine = this.env.services.pos.getPendingPaymentLine('seerbit')
        //     if (pendingPaymentLine) {
        //         console.log('Found pending Seerbit line')
        //         pendingPaymentLine.set_payment_status('waitingSeerbit');
        //     }
        // });

        onWillUnmount(() => {
            // When leaving the payment screen, ensure any Seerbit processes are stopped.
            this.paymentLines.forEach(line => {
                console.log('Checking payment line:', line);
                if (line.payment_method_id.use_payment_terminal === 'seerbit') {
                    console.log('Found Seerbit payment line');
                    // The payment_terminal is the SeerbitPayment instance
                    if (line.payment_method_id.payment_terminal) {
                        console.log('Closing Seerbit payment line');
                        line.payment_method_id.payment_terminal.close();
                    }
                }
            });
        });
    },

    
    async sendForceDone(line) {
        const payment_terminal = line.payment_method_id.payment_terminal;
        await payment_terminal.sendForceDone(line);
    },

    async sendPaymentCancel(line) {
        const payment_terminal = line.payment_method_id.payment_terminal;
        await payment_terminal.sendPaymentCancel(line.order, line.uuid);
    },

    async sendPaymentRequest(line) {
        const payment_terminal = line.payment_method_id.payment_terminal;
        await payment_terminal.sendPaymentRequest(line.uuid);
    },
    addNewPaymentLine(paymentMethod) {
        if (paymentMethod && paymentMethod.use_payment_terminal === 'seerbit') {
            if (paymentMethod.payment_terminal && typeof paymentMethod.payment_terminal.fastPayments !== 'undefined') {
                const line = super.addNewPaymentLine(paymentMethod);
                if (paymentMethod.payment_terminal.fastPayments && line) {
                    this._startPaymentLineReconciliation(line);
                }
                return line;
            }
        }
        return super.addNewPaymentLine(paymentMethod);
    },

    _startPaymentLineReconciliation(line) {
        console.log('Started payment line reconciliation for line:', line.uuid);
    },
    paymentMethodImage(id) {
        if (this.paymentMethod.use_payment_terminal === "seerbit") {
            return "/pos_seerbit/static/description/icon.png";
        }
        if (this.paymentMethod.image) {
            return `/web/image/pos.payment.method/${id}/image`;
        } else if (this.paymentMethod.type === "cash") {
            return "/point_of_sale/static/src/img/money.png";
        } else if (this.paymentMethod.type === "pay_later") {
            return "/point_of_sale/static/src/img/pay-later.png";
        }  else {
            return "/point_of_sale/static/src/img/card-bank.png";
        }
    },
    deletePaymentLine(uuid) {
        const line = this.paymentLines.find( (line) => line.uuid === uuid);
        if (!line) {
            console.warn('Payment line not found for uuid:', uuid);
            return;
        }
        if (line.payment_method_id.payment_method_type === "qr_code") {
            this.currentOrder.remove_paymentline(line);
            this.numberBuffer.reset();
            return;
        }
        const paymentStatus = line.get_payment_status ? line.get_payment_status() : undefined;
        if (["waiting", "waitingCancel"].includes(paymentStatus) && line.payment_method_id.payment_terminal) {
            line.set_payment_status("waitingCancel");
            this.sendPaymentCancel(line).then( () => {
                this.currentOrder.remove_paymentline(line);
                this.numberBuffer.reset();
            });
        } else if (paymentStatus !== "waitingCancel") {
            this.currentOrder.remove_paymentline(line);
            this.numberBuffer.reset();
        }
    }

    
});