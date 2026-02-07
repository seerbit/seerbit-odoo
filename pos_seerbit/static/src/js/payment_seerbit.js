odoo.define('pos_seerbit.payment', function (require) {
    "use strict";

    var core = require('web.core');
    var rpc = require('web.rpc');
    var PaymentInterface = require('point_of_sale.PaymentInterface');
    const { Gui } = require('point_of_sale.Gui');
    var _t = core._t;

    // Import Firebase initialization
    var FirebaseInit = require('pos_seerbit.firebase_init');
    // Import Firebase listener
    var FirebaseListener = require('pos_seerbit.firebase_listener');

    var PaymentSeerbit = PaymentInterface.extend({
        init: function() {
            this._super.apply(this, arguments);
            this.was_cancelled = false;
            this.supports_reversals = false; // Seerbit doesn't support reversals
            this._reconciliationUnsubscribe = null;
            this._reconciliationReject = null;
            console.log('PaymentSeerbit initialized');

            this._initializeFirebase();
        },

        _initializeFirebase: function() {
            FirebaseInit.initializeFirebase().catch(function(error) {
                console.error('Seerbit Firestore init error:', error);
            });
        },

        send_payment_request: function (cid) {
            this._super.apply(this, arguments);
            this._reset_state();
            return this._seerbit_pay(cid);
        },
        send_payment_cancel: function (order, cid) {
            this._super.apply(this, arguments);
            return this._seerbit_cancel();
        },
        close: function () {
            this._seerbit_cancel();
            this._super.apply(this, arguments);
        },

        pending_seerbit_line() {
            return this.pos.get_order().paymentlines.find(
                paymentLine => paymentLine.payment_method.use_payment_terminal === 'seerbit' && (!paymentLine.is_done()));
        },

        /**
         * Verify reconciliation doc and mark payment line as done. Reusable by main flow and reconnect flow.
         * @param {Object} line - Payment line
         * @param {Object} data - Reconciliation doc data
         * @param {string} orderId - Expected order id (payload.id)
         * @param {string} posid - Expected posid (payload.posid)
         * @returns {boolean} true on success
         */
        _markPaymentSuccessful: function (line, data, orderId, posid) {
            var docId = String(data?.id || '');
            var docPosid = String(data?.posid || '');
            var meta = {};
            try {
                meta = data && data.metadata ? JSON.parse(data.metadata) : {};
            } catch (e) {
                meta = {};
            }
            var docAmount = parseFloat(meta && meta.odoo_amount ? meta.odoo_amount : 0);
            var lineAmount = parseFloat(line.amount || 0);
            if (docId !== String(orderId) || docPosid !== String(posid)) {
                throw new Error('Reconciliation doc does not match order');
            }
            if (Math.abs(docAmount - lineAmount) > 0.01) {
                throw new Error('Reconciliation amount does not match order line');
            }

            line.set_payment_status('done');
            line.set_receipt_info('Transaction ID: ' + (data?.sessionId || data?.transactionRef || data?.id || ''));
            line.transaction_id = data?.sessionId || data?.transactionRef || data?.id || '';
            line.card_type = 'Seerbit';
            line.cardholder_name = 'Seerbit Payment';

            console.log('Seerbit payment completed', {
                orderId: orderId,
                posid: posid,
                amount: lineAmount,
                transactionId: line.transaction_id,
            });

            Gui.showPopup('ConfirmPopup', {
                title: _t('Payment Successful'),
                body: _t('Payment has been successfully processed.'),
            });
            return true;
        },

        _reset_state: function () {
            this.was_cancelled = false;
            this._reconciliationUnsubscribe = null;
            this._reconciliationReject = null;
        },

        _seerbit_pay_data: function () {
            // Construct the payload as per your spec
            const order = this.pos.get_order();
            if (!order?.selected_paymentline) {
                throw new Error('No order or payment line selected');
            }

            const paymentline = order.selected_paymentline;
            const paymentMethod = paymentline?.payment_method;
            
            // Get current date in dd/mm/yyyy format
            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            const hour = String(now.getHours()).padStart(2, '0');
            const minute = String(now.getMinutes()).padStart(2, '0');
            const receivedDateTime = `${day}/${month}/${year} ${hour}:${minute}`;
            
            // Create metadata with additional server fields
            const metadata = JSON.stringify({
                'created_by': 'odoo_pos_seerbit',
                'created_time': now.toISOString(),
                'order_id': order.uid,
                'pos_config_id': this.pos.config?.id,
                'user_id': this.pos.user?.id,
                'odoo_amount': paymentline.amount?.toFixed(2),
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
        },

        _seerbit_pay: function (cid) {
            var order = this.pos.get_order();
            var line = order.paymentlines.find(paymentLine => paymentLine.cid === cid);

            if (line.amount < 0.01) {
                this._show_error(_t('Cannot process transactions with invalid amount.'), 'Amount Error');
                return Promise.resolve();
            }

            line.set_payment_status('waitingSeerbit');
            
            // Send payment request to Firestore instead of webhook
            return this._send_payment_request_to_firestore(cid);
        },

        _send_payment_request_to_firestore: function(cid) {
            var self = this;
            var order = self.pos.get_order();
            if (!order) {
                return Promise.reject(new Error('No order available'));
            }

            var payload;
            try {
                payload = self._seerbit_pay_data();
            } catch (error) {
                return Promise.reject(error);
            }

            return rpc.query({
                model: 'pos.payment.method',
                method: 'send_seerbit_payment_request',
                args: [[order.selected_paymentline?.payment_method?.id], payload],
            }).then(function () {
                return FirebaseListener.waitForReconciliationByOrderId(payload.id, payload.posid, {
                    timeoutMs: 1200000,
                    onReady: function (unsubscribe, rejectOnce) {
                        self._reconciliationUnsubscribe = unsubscribe;
                        self._reconciliationReject = rejectOnce;
                    },
                }).then(function (data) {
                    var line = self.pending_seerbit_line();
                    if (!line) return Promise.reject(new Error('No pending payment line'));
                    self._markPaymentSuccessful(line, data, payload.id, payload.posid);
                }).catch(function (err) {
                    var line = self.pending_seerbit_line();
                    // Cancellation: just propagate, no popup
                    if (err && err.message === 'cancelled') {
                        return Promise.reject(err);
                    }
                    // Timeout: offer Retry / Confirm manually
                    if (err && err.message === 'Reconciliation timeout') {
                        if (line) {
                            line.set_payment_status('waitingSeerbit');
                        }
                        return new Promise(function (resolve, reject) {
                            Gui.showPopup('ConfirmPopup', {
                                title: _t('Seerbit Timeout'),
                                body: _t('No confirmation was received from Seerbit within the expected time.\n\nYou can retry the payment request, or confirm manually if you have independently verified that the customer has paid.'),
                                confirmText: _t('Retry'),
                                cancelText: _t('Confirm Manually'),
                                confirm: function () {
                                    self._seerbit_pay(line.cid).then(resolve).catch(reject);
                                },
                                cancel: function () {
                                    resolve(); // operator may force-confirm using standard POS flow
                                },
                            });
                        });
                    }
                    // Other errors: mark as error and show message
                    if (line) {
                        line.set_payment_status('errorSeerbit');
                    }
                    var msg = (err && err.message) ? err.message : _t('Payment could not be confirmed.');
                    self._show_error(msg, _t('Seerbit'));
                    return Promise.reject(err);
                }).finally(function () {
                    self._reset_state();
                });
            }).catch(function (error) {
                var line = order.paymentlines.find(function (pl) { return pl.cid === cid; });
                if (line && line.set_payment_status) {
                    line.set_payment_status('waitingSeerbit');
                }
                self._show_error(_t('Could not send payment request. You can force confirm if payment was made.'), 'Seerbit Warning');
                return Promise.resolve();
            });
        },

        _seerbit_cancel: function () {
            console.log('Cancelling Seerbit payment');
            var line = this.pending_seerbit_line();
            if (!line) {
                console.log('No pending Seerbit line – payment already completed; skip cancel so parent close()');
                // No pending Seerbit line – payment already completed; skip cancel so parent close()
                return;
            }
            this.was_cancelled = true;
            if (this._reconciliationUnsubscribe) {
                this._reconciliationUnsubscribe();
                this._reconciliationUnsubscribe = null;
            }
            if (this._reconciliationReject) {
                this._reconciliationReject(new Error('cancelled'));
                this._reconciliationReject = null;
            }
            
        },

        _show_error: function (msg, title) {
            if (!title) {
                title = _t('Seerbit Error');
            }
            Gui.showPopup('ErrorPopup', {
                'title': title,
                'body': msg,
            });
        },
    });

    return PaymentSeerbit;
});
