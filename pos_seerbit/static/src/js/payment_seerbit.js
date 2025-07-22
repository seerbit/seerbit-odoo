/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import PaymentInterface from "@point_of_sale/app/store/payment_interface";
import { Gui } from "@point_of_sale/app/gui/gui";
import FirebaseInit from './firebase_init';
import FirebaseListener from './firebase_listener';

class PaymentSeerbit extends PaymentInterface {
    init() {
        super.init(...arguments);
        this.polling = null;
        this.was_cancelled = false;
        this.supports_reversals = false; // Seerbit doesn't support reversals
        this._initializeFirebase();
    }
    _initializeFirebase() {
        FirebaseInit.initializeFirebase().then(function(success) {
            if (!success) {
                console.warn('Firestore initialization failed for Seerbit payments. Status:', FirebaseInit.getFirebaseStatus());
            }
        }).catch(function(error) {
            console.error('Firestore initialization error:', error);
        });
    }
    send_payment_request(cid) {
        super.send_payment_request(cid);
        this._reset_state();
        return this._seerbit_pay(cid);
    }
    send_payment_cancel(order, cid) {
        super.send_payment_cancel(order, cid);
        return this._seerbit_cancel();
    }
    close() {
        this._seerbit_cancel();
        super.close();
    }
    pending_seerbit_line() {
        return this.pos.get_order().paymentlines.find(
            paymentLine => paymentLine.payment_method.use_payment_terminal === 'seerbit' && (!paymentLine.is_done())
        );
    }
    _reset_state() {
        this.was_cancelled = false;
        this.remaining_polls = 4;
        clearTimeout(this.polling);
    }
    _seerbit_pay_data() {
        const order = this.pos.get_order();
        if (!order?.selected_paymentline) {
            throw new Error('No order or payment line selected');
        }
        const paymentline = order.selected_paymentline;
        const paymentMethod = paymentline?.payment_method;
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
        const payload = {
            "id": order.uid?.toString(),
            "posid": paymentMethod?.seerbit_terminal_id || "",
            "merchantid": "",
            "metadata": metadata,
            "transactionValue": paymentline.amount?.toFixed(2),
            "status": "open",
            "transactionTime": "",
            "sessionId": "",
            "receivedDateTime": receivedDateTime,
            "transactionRef": "",
            "pubkey": paymentMethod?.seerbit_public_key || "",
        };
        return payload;
    }
    _seerbit_pay(cid) {
        var order = this.pos.get_order();
        if (order.selected_paymentline.amount < 0.01) {
            this._show_error(_t('Cannot process transactions with invalid amount.'), 'Amount Error');
            return Promise.resolve();
        }
        if (order === this.poll_error_order) {
            delete this.poll_error_order;
            return Promise.resolve();
        }
        var line = order.paymentlines.find(paymentLine => paymentLine.cid === cid);
        line.set_payment_status('waitingSeerbit');
        return this._send_payment_request_to_firestore(cid);
    }
    _send_payment_request_to_firestore(cid) {
        const order = this.pos.get_order();
        if (!order) {
            console.error('No order available for payment');
            return Promise.reject(new Error('No order available'));
        }
        let payload;
        try {
            payload = this._seerbit_pay_data();
        } catch (error) {
            console.error('Error creating payment payload:', error);
            return Promise.reject(error);
        }
        return rpc.query({
            model: 'pos.payment.method',
            method: 'send_seerbit_payment_request',
            args: [[order.selected_paymentline?.payment_method?.id], payload],
        }).then(() => {
            localStorage.setItem('pending_transaction', JSON.stringify(payload));
            FirebaseListener.listenForReconciliation(payload.id);
            return this.start_get_status_polling();
        }).catch((error) => {
            console.error('Payment request failed:', error);
            const line = order.paymentlines?.find(paymentLine => paymentLine.cid === cid);
            if (line?.set_payment_status) {
                line.set_payment_status('waitingSeerbit');
            }
            this._show_error(_t('Could not send payment request. You can force confirm if payment was made.'), 'Seerbit Warning');
            return Promise.resolve();
        });
    }
    _seerbit_cancel() {
        this.was_cancelled = !!this.polling;
    }
    start_get_status_polling() {
        var self = this;
        var res = new Promise(function (resolve, reject) {
            clearTimeout(self.polling);
            self._poll_for_response(resolve, reject);
            self.polling = setInterval(function () {
                self._poll_for_response(resolve, reject);
            }, 3500);
        });
        res.finally(function () {
            self._reset_state();
        });
        return res;
    }
    _poll_for_response(resolve, reject) {
        if (this.was_cancelled || !this.pos.get_order().selected_paymentline) {
            return resolve(true);
        }
        const completedTransaction = localStorage.getItem('completed_transaction');
        if (completedTransaction) {
            try {
                const transactionData = JSON.parse(completedTransaction);
                var line = this.pending_seerbit_line();
                if (line) {
                    line.set_payment_status('done');
                    line.set_receipt_info('Transaction ID: ' + transactionData.id);
                    line.transaction_id = transactionData.id;
                    line.card_type = 'Seerbit';
                    line.cardholder_name = 'Seerbit Payment';
                    localStorage.removeItem('completed_transaction');
                    localStorage.removeItem('pending_transaction');
                    resolve(true);
                    return;
                }
            } catch (error) {
                console.error('Error parsing completed transaction:', error);
                localStorage.removeItem('completed_transaction');
                let line = this.pending_seerbit_line();
                if (line) {
                    line.set_payment_status('errorSeerbit');
                }
                this._show_error(_t('Error Marking payment as done'), 'Odoo Error');
                reject();
            }
        }
    }
    _show_error(msg, title) {
        if (!title) {
            title = _t('Seerbit Error');
        }
        Gui.showPopup('ErrorPopup', {
            'title': title,
            'body': msg,
        });
    }
}

export default PaymentSeerbit;
