/** @odoo-module **/

import { PaymentInterface } from '@point_of_sale/app/payment/payment_interface';
import { _t } from '@web/core/l10n/translation';
import { AlertDialog } from '@web/core/confirmation_dialog/confirmation_dialog';
import FirebaseInit from './firebase_init';
import FirebaseListener from './firebase_listener';

// Initialize Firebase for Seerbit payments
function initializeSeerbitFirebase(orm) {
    FirebaseInit.initializeFirebase(orm).then(function(success) {
        if (!success) {
                    console.warn('Firestore initialization failed for Seerbit payments. Status:', FirebaseInit.getFirebaseStatus());
                }
            }).catch(function(error) {
                console.error('Firestore initialization error:', error);
            });
}

export default class SeerbitPayment extends PaymentInterface {
    constructor(pos, payment_method_id) {
        super(pos, payment_method_id);
        this.payment_method_id = payment_method_id;
        this.env = pos.env;
        this.pos = pos;
        this.seerbit_polling = null;
        this.seerbit_was_cancelled = false;
        this.supports_reversals = false; // Seerbit doesn't support reversals
        initializeSeerbitFirebase(this.pos.env.services.orm);
    }

    async send_payment_request(cid) {
            const order = this.pos.get_order();
        const paymentLine = order.get_selected_paymentline();
        if (paymentLine.amount < 0.01) {
            await this.env.services.dialog.add(AlertDialog, {
                title: _t('Amount Error'),
                body: _t('Cannot process transactions with invalid amount.'),
            });
            return false;
        }
        paymentLine.set_payment_status('waitingSeerbit');
        return this._send_seerbit_payment_request_to_firestore(paymentLine);
    }

    async send_payment_cancel(order, uuid) {

        this.seerbit_was_cancelled = true;
        clearTimeout(this.seerbit_polling);
        localStorage.removeItem('pending_transaction');
        localStorage.removeItem('completed_transaction');
        this._reset_seerbit_state();

        return true;
    }


    _seerbit_pay_data(paymentLine) {
            const order = this.pos.get_order();
            const paymentMethod = this.payment_method_id;

            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            const receivedDateTime = `${day}/${month}/${year}`;
            const metadata = JSON.stringify({
                'created_by': 'odoo_pos_seerbit',
                'created_time': now.toISOString(),
                'order_id': order.uid,
                'pos_config_id': this.pos.config?.id,
                'user_id': this.pos.user?.id
            });
        return {
                "id": order.uid?.toString(),
                "posid": paymentMethod?.seerbit_terminal_id || "",
                "merchantid": "",
                "metadata": metadata,
            "transactionValue": paymentLine.amount?.toFixed(2),
                "status": "open",
                "transactionTime": "",
                "sessionId": "",
                "receivedDateTime": receivedDateTime,
                "transactionRef": "",
                "pubkey": paymentMethod?.seerbit_public_key || "",
            };
    }

    _send_seerbit_payment_request_to_firestore(paymentLine) {
            let payload;
            try {
            payload = this._seerbit_pay_data(paymentLine);
            } catch (error) {
                console.error('Error creating payment payload:', error);
                return Promise.reject(error);
            }
        return this.pos.env.services.orm.call(
            'pos.payment.method',
            'send_seerbit_payment_request',
            [[paymentLine.payment_method?.id], payload],
            {}
        ).then(() => {
                localStorage.setItem('pending_transaction', JSON.stringify(payload));
            FirebaseListener.listenForReconciliation(payload.id, this.pos.env);
            return this._seerbit_start_get_status_polling(paymentLine);
        }).catch(async (error) => {
                console.error('Payment request failed:', error);
            if (paymentLine?.set_payment_status) {
                paymentLine.set_payment_status('waitingSeerbit');
            }
            await this.env.services.dialog.add(AlertDialog, {
                title: _t('Seerbit Warning'),
                body: _t('Could not send payment request. You can force confirm if payment was made.'),
            });
            return false;
        });
    }

    _seerbit_start_get_status_polling(paymentLine) {
        const self = this;
        return new Promise(function (resolve, reject) {
            clearTimeout(self.seerbit_polling);
            self._seerbit_poll_for_response(paymentLine, resolve, reject);
            self.seerbit_polling = setInterval(function () {
                self._seerbit_poll_for_response(paymentLine, resolve, reject);
                }, 3500);
        }).finally(function () {
            self._reset_seerbit_state();
        });
    }

    _seerbit_poll_for_response(paymentLine, resolve, reject) {
        if (this.seerbit_was_cancelled) {
            console.log('seerbit_was_cancelled', this.seerbit_was_cancelled);
            paymentLine.set_payment_status('waitingSeerbit');
            return reject(); 
        }
        if (!this.pos.get_order().get_selected_paymentline()) {
            console.log('No payment line');
            return;
            }
            const completedTransaction = localStorage.getItem('completed_transaction');
            if (completedTransaction) {
                try {
                    const transactionData = JSON.parse(completedTransaction);
                if (paymentLine) {
                    paymentLine.set_payment_status('done');
                    paymentLine.set_receipt_info('Transaction ID: ' + transactionData.id);
                    paymentLine.transaction_id = transactionData.id;
                    paymentLine.card_type = 'Seerbit';
                    paymentLine.cardholder_name = 'Seerbit Payment';
                        localStorage.removeItem('completed_transaction');
                        localStorage.removeItem('pending_transaction');
                        resolve(true);
                        return;
                    }
                } catch (error) {
                    console.error('Error parsing completed transaction:', error);
                    localStorage.removeItem('completed_transaction');
                if (paymentLine) {
                    paymentLine.set_payment_status('errorSeerbit');
                }
                this.env.services.dialog.add(AlertDialog, {
                    title: _t('Odoo Error'),
                    body: _t('Error Marking payment as done'),
                });
                reject();
            }
        }
    }

    _reset_seerbit_state() {
        this.seerbit_polling = null;
        this.seerbit_was_cancelled = false;
        this.supports_reversals = false;
        
        initializeSeerbitFirebase(this.pos.env.services.orm);
    }


    async send_force_done(line) {
        if (line && line.payment_method_id && line.payment_method_id.use_payment_terminal === 'seerbit') {
            line.set_payment_status('done');
            line.set_receipt_info('Transaction ID: ' + line.pos_order_id?.uuid?.toString());
            clearTimeout(this.seerbit_polling);
            
            // Clean up localStorage to prevent "electronic payment in progress" error
            localStorage.removeItem('pending_transaction');
            localStorage.removeItem('completed_transaction');
            
            await this.env.services.dialog.add(AlertDialog, {
                title: 'Seerbit Payment',
                body: 'Payment forcibly confirmed as done.',
            });
            this.pos.paymentTerminalInProgress = false;
        
            return Promise.resolve();
        }
    }

    close() {
        this.seerbit_was_cancelled = true;
        clearTimeout(this.seerbit_polling);
        
        // Clean up localStorage when closing to prevent stale state
        localStorage.removeItem('pending_transaction');
        localStorage.removeItem('completed_transaction');
    }
}