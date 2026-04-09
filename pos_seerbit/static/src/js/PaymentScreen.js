/** @odoo-module **/

import { PaymentScreen } from '@point_of_sale/app/screens/payment_screen/payment_screen';
import { patch } from '@web/core/utils/patch';
import { onWillUnmount } from '@odoo/owl';
import { _t } from '@web/core/l10n/translation';
import { AlertDialog } from '@web/core/confirmation_dialog/confirmation_dialog';

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
        if (!line || !line.payment_method_id || !line.payment_method_id.payment_terminal) {
            console.warn('Payment terminal not available for line:', line);
            return;
        }
        const payment_terminal = line.payment_method_id.payment_terminal;
        await payment_terminal.sendPaymentRequest(line.uuid);
    },
    async addNewPaymentLine(paymentMethod) {
        if (paymentMethod && paymentMethod.use_payment_terminal) {
            if (paymentMethod.use_payment_terminal === 'seerbit') {
                if (this.pos.paymentTerminalInProgress) {
                    this.dialog.add(AlertDialog, {
                        title: _t("Error"),
                        body: _t("There is already an electronic payment in progress."),
                    });
                    return;
                }
                if (this.paymentLines.length === 0) {
                    this.makeAnimation();
                }
                const result = this.currentOrder.addPaymentline(paymentMethod);
                if (result.status) {
                    this.numberBuffer.set(result.data.amount.toString());
                    const newPaymentLine = this.paymentLines.at(-1);
                    if (newPaymentLine && newPaymentLine.payment_method_id && newPaymentLine.payment_method_id.payment_terminal) {
                        this.sendPaymentRequest(newPaymentLine);
                    } else {
                        this.pos.paymentTerminalInProgress = false;
                    }
                    return true;
                } else {
                    this.dialog.add(AlertDialog, {
                        title: _t("Error"),
                        body: result.data,
                    });
                    return false;
                }
            }
            try {
                if (this.pos.paymentTerminalInProgress) {
                    this.dialog.add(AlertDialog, {
                        title: _t("Error"),
                        body: _t("There is already an electronic payment in progress."),
                    });
                    return;
                }
                if (this.paymentLines.length === 0) {
                    this.makeAnimation();
                }
                const result = this.currentOrder.addPaymentline(paymentMethod);
                if (result.status) {
                    this.numberBuffer.set(result.data.amount.toString());
                    if (paymentMethod.payment_terminal && paymentMethod.payment_terminal.fastPayments) {
                        const newPaymentLine = this.paymentLines.at(-1);
                        if (newPaymentLine && newPaymentLine.payment_method_id && newPaymentLine.payment_method_id.payment_terminal) {
                            this.sendPaymentRequest(newPaymentLine);
                        }
                    }
                    return true;
                } else {
                    this.dialog.add(AlertDialog, {
                        title: _t("Error"),
                        body: result.data,
                    });
                    return false;
                }
            } catch (e) {
                return super.addNewPaymentLine(paymentMethod);
            }
        }
        return super.addNewPaymentLine(paymentMethod);
    },

    _startPaymentLineReconciliation(line) {
        console.log('Started payment line reconciliation for line:', line.uuid);
    },
    paymentMethodImage(id) {
        if (this.paymentMethod && this.paymentMethod.use_payment_terminal === "seerbit") {
            return "/pos_seerbit/static/description/icon.png";
        }
        if (this.paymentMethod && this.paymentMethod.image) {
            return `/web/image/pos.payment.method/${id}/image`;
        } else if (this.paymentMethod && this.paymentMethod.type === "cash") {
            return "/point_of_sale/static/src/img/money.png";
        } else if (this.paymentMethod && this.paymentMethod.type === "pay_later") {
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
            this.currentOrder.removePaymentline(line);
            this.numberBuffer.reset();
            return;
        }
        const paymentStatus = line.getPaymentStatus ? line.getPaymentStatus() : undefined;
        if (["waiting", "waitingCancel", "waitingCard", "timeout"].includes(paymentStatus) && line.payment_method_id.payment_terminal) {
            line.setPaymentStatus("waitingCancel");
            this.sendPaymentCancel(line).then( () => {
                this.currentOrder.removePaymentline(line);
                this.numberBuffer.reset();
            });
        } else if (paymentStatus !== "waitingCancel") {
            this.currentOrder.removePaymentline(line);
            this.numberBuffer.reset();
        }
    }

    
});