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
            console.log('[Seerbit] send_payment_request called', { cid: cid });
            this._super.apply(this, arguments);
            this._reset_state();
            return this._seerbit_pay(cid);
        },
        send_payment_cancel: function (order, cid) {
            console.log('[Seerbit] send_payment_cancel called', { order: order?.name, cid: cid });
            this._super.apply(this, arguments);
            return this._seerbit_cancel();
        },
        send_force_done: function (cid) {
            this._reset_state();
            return this._super.apply(this, arguments);
        },
        close: function () {
            var hadPending = !!this.pending_seerbit_line();
            console.log('[Seerbit] close() called', { hadPending: hadPending, stack: new Error().stack });
            this._seerbit_cancel();
            // When payment completed, pending_seerbit_line is null; skip parent close to avoid
            // parent overwriting line with "Transaction Canceled" (parent may set retry when was_cancelled)
            if (hadPending) {
                this._super.apply(this, arguments);
            } else {
                console.log('[Seerbit] skipping _super.close() - payment already completed');
            }
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
            console.log('[Seerbit] _markPaymentSuccessful called', { data:data, orderId:orderId, posid:posid });
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
                console.error('[Seerbit] _markPaymentSuccessful: id/posid mismatch', {
                    expectedOrderId: orderId,
                    expectedPosid: posid,
                    docId: docId,
                    docPosid: docPosid,
                    lineCid: line?.cid,
                    lineAmount: lineAmount,
                });
                throw new Error('Reconciliation doc does not match order');
            }
            if (Math.abs(docAmount - lineAmount) > 0.01) {
                console.error('[Seerbit] _markPaymentSuccessful: amount mismatch', {
                    expectedOrderId: orderId,
                    expectedPosid: posid,
                    lineAmount: lineAmount,
                    docAmount: docAmount,
                    diff: Math.abs(docAmount - lineAmount),
                    metaOdooAmount: meta?.odoo_amount,
                    metadataRaw: typeof data?.metadata === 'string' ? data.metadata : JSON.stringify(data?.metadata),
                    lineCid: line?.cid,
                    transactionValue: data?.transactionValue,
                    caller: new Error().stack,
                });
                throw new Error('Reconciliation amount does not match order line');
            }

            line.set_payment_status('done');
            line.set_receipt_info('Transaction ID: ' + (data?.sessionId || data?.transactionRef || data?.id || ''));
            line.transaction_id = data?.sessionId || data?.transactionRef || data?.id || '';
            line.card_type = 'Seerbit';
            line.cardholder_name = 'Seerbit Payment';

            var statusAfter = line.get_payment_status ? line.get_payment_status() : line.payment_status;
            var isDoneAfter = line.is_done ? line.is_done() : (statusAfter === 'done');
            console.log('[Seerbit] _markPaymentSuccessful: set done', {
                orderId: orderId,
                posid: posid,
                amount: lineAmount,
                transactionId: line.transaction_id,
                statusAfter: statusAfter,
                isDoneAfter: isDoneAfter,
                lineCid: line.cid,
            });

            // Defer popup so status propagates before POS may close/update UI (reactivity fix)
            setTimeout(function () {
                Gui.showPopup('ConfirmPopup', {
                    title: _t('Payment Successful'),
                    body: _t('Payment has been successfully processed.'),
                });
            }, 0);
            return true;
        },

        _reset_state: function () {
            this.was_cancelled = false;
            if (this._reconciliationUnsubscribe) {
                this._reconciliationUnsubscribe();
            }
            if (this._reconciliationReject) {
                this._reconciliationReject(new Error('cancelled')); 
            }
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
                // Unsubscribe any existing listener before starting new one; reject its Promise so it doesn't time out later
                if (self._reconciliationUnsubscribe) {
                    self._reconciliationUnsubscribe();
                    if (self._reconciliationReject) self._reconciliationReject(new Error('cancelled'));
                    self._reconciliationUnsubscribe = null;
                    self._reconciliationReject = null;
                }
                return new Promise(function (resolve, reject) {
                    FirebaseListener.waitForReconciliationByOrderId(payload.id, payload.posid, {
                        timeoutMs: 1200000,
                        onReady: function (unsubscribe, rejectOnce) {
                            self._reconciliationUnsubscribe = unsubscribe;
                            self._reconciliationReject = rejectOnce;
                        },
                    }).then(function (data) {
                        var line = self.pending_seerbit_line();
                        console.log('[Seerbit] reconciliation .then received', {
                            orderId: payload.id,
                            data:data,
                            posid: payload.posid,
                            hasLine: !!line,
                            lineAmount: line ? line.amount : null,
                            lineCid: line ? line.cid : null,
                        });
                        if (!line) {
                            reject(new Error('No pending payment line'));
                            return;
                        }
                        self._markPaymentSuccessful(line, data, payload.id, payload.posid);
                        resolve(true);
                    }).catch(function (err) {
                        var line = self.pending_seerbit_line();
                        if (err && err.message === 'cancelled') {
                            reject(err);
                            return;
                        }
                        if (err && err.message === 'Reconciliation timeout') {
                            var timeoutLine = self.pending_seerbit_line();
                            if (!timeoutLine) {
                                // reject(new Error('No pending payment line'));
                                console.log('No timeout line')
                                return;
                            }
                            timeoutLine.set_payment_status('waitingSeerbit');
                            Gui.showPopup('ConfirmPopup', {
                                title: _t('Seerbit Timeout'),
                                body: _t('No confirmation was received from Seerbit within the expected time.\n\nYou can retry the payment request, or confirm manually if you have independently verified that the customer has paid.'),
                                confirmText: _t('Retry'),
                                cancelText: _t('Confirm Manually'),
                                confirm: function () {
                                    var l = self.pending_seerbit_line();
                                    if (!l) {
                                        reject(new Error('No pending payment line'));
                                        return;
                                    }
                                    self.send_payment_request(l.cid).then(resolve).catch(reject);
                                },
                                cancel: function () {
                                    var l = self.pending_seerbit_line();
                                    if (!l) {
                                        reject(new Error('No pending payment line'));
                                        return;
                                    }
                                    self.send_force_done(l.cid);
                                    resolve(true);
                                },
                            });
                            return;
                        }
                        if (line) line.set_payment_status('errorSeerbit');
                        self._show_error((err && err.message) || _t('Payment could not be confirmed.'), _t('Seerbit'));
                        reject(err);
                    }).finally(function () {
                        self._reset_state();
                    });
                });
            }).catch(function (error) {
                if (error && error.message === 'cancelled') {
                    return Promise.resolve();
                }
                console.log('[Seerbit] _send_payment_request_to_firestore error', { error: error });
                var line = order.paymentlines.find(function (pl) { return pl.cid === cid; });
                if (line && line.set_payment_status) {
                    line.set_payment_status('waitingSeerbit');
                }
                self._show_error(_t('Could not send payment request. You can force confirm if payment was made.'), 'Seerbit Warning');
                return Promise.resolve();
            });
        },

        _seerbit_cancel: function () {
            var line = this.pending_seerbit_line();
            console.log('[Seerbit] _seerbit_cancel called', {
                hasPendingLine: !!line,
                pendingLineStatus: line ? (line.get_payment_status ? line.get_payment_status() : line.payment_status) : null,
                was_cancelled: this.was_cancelled,
            });
            if (!line) {
                console.log('[Seerbit] no pending line, skipping cancel');
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
            console.log('[Seerbit] cancel applied, was_cancelled=true');
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
