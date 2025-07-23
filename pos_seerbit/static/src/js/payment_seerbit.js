/** @odoo-module **/

import { PaymentScreen } from '@point_of_sale/app/screens/payment_screen/payment_screen';
import { patch } from '@web/core/utils/patch';
import { _t } from '@web/core/l10n/translation';
import { ConfirmPopup } from '@point_of_sale/app/utils/confirm_popup/confirm_popup';
import FirebaseInit from './firebase_init';
import FirebaseListener from './firebase_listener';

function initializeSeerbitFirebase() {
    FirebaseInit.initializeFirebase().then(function(success) {
        if (!success) {
            console.warn('Firestore initialization failed for Seerbit payments. Status:', FirebaseInit.getFirebaseStatus());
        }
    }).catch(function(error) {
        console.error('Firestore initialization error:', error);
    });
}

patch(PaymentScreen.prototype, {
    setup() {
        super.setup();
        // Always initialize Seerbit Firebase on PaymentScreen setup/init
        initializeSeerbitFirebase();
    },
    async send_payment_request(paymentLine) {
        // Only handle Seerbit payment lines, otherwise call the original
        if (paymentLine.payment_method.use_payment_terminal === 'seerbit') {
            this._reset_seerbit_state();
            const { confirmed } = await this.popup.add(ConfirmPopup, {
                title: _t('Seerbit Payment'),
                body: _t('Do you want to proceed with Seerbit payment?'),
            });
            if (!confirmed) {
                return;
            }
            return this._seerbit_pay(paymentLine);
        }
        // Fallback to original method for other payment lines
        return super.send_payment_request(paymentLine);
    },
    _reset_seerbit_state() {
        this.seerbit_polling = null;
        this.seerbit_was_cancelled = false;
        this.seerbit_supports_reversals = false; // Seerbit doesn't support reversals
        initializeSeerbitFirebase();
    },
    async _seerbit_pay(paymentLine) {
        const order = this.currentOrder;
        if (paymentLine.amount < 0.01) {
            await this.popup.add(ConfirmPopup, {
                title: _t('Amount Error'),
                body: _t('Cannot process transactions with invalid amount.'),
            });
            return;
        }
        paymentLine.set_payment_status('waitingSeerbit');
        return this._send_seerbit_payment_request_to_firestore(paymentLine);
    },
    _seerbit_pay_data(paymentLine) {
        const order = this.currentOrder;
        const paymentMethod = paymentLine.payment_method;
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
    },
    _send_seerbit_payment_request_to_firestore(paymentLine) {
        const order = this.currentOrder;
        let payload;
        try {
            payload = this._seerbit_pay_data(paymentLine);
        } catch (error) {
            console.error('Error creating payment payload:', error);
            return Promise.reject(error);
        }
        return this.env.services.rpc.query({
            model: 'pos.payment.method',
            method: 'send_seerbit_payment_request',
            args: [[paymentLine.payment_method?.id], payload],
        }).then(() => {
            localStorage.setItem('pending_transaction', JSON.stringify(payload));
            FirebaseListener.listenForReconciliation(payload.id);
            return this._seerbit_start_get_status_polling(paymentLine);
        }).catch(async (error) => {
            console.error('Payment request failed:', error);
            if (paymentLine?.set_payment_status) {
                paymentLine.set_payment_status('waitingSeerbit');
            }
            await this.popup.add(ConfirmPopup, {
                title: _t('Seerbit Warning'),
                body: _t('Could not send payment request. You can force confirm if payment was made.'),
            });
            return;
        });
    },
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
    },
    _seerbit_poll_for_response(paymentLine, resolve, reject) {
        if (this.seerbit_was_cancelled || !this.currentOrder.selected_paymentline) {
            return resolve(true);
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
                this.popup.add(ConfirmPopup, {
                    title: _t('Odoo Error'),
                    body: _t('Error Marking payment as done'),
                });
                reject();
            }
        }
    },
});
