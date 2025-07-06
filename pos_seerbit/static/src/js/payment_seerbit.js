odoo.define('pos_seerbit.payment', function (require) {
    "use strict";

    var core = require('web.core');
    var rpc = require('web.rpc');
    var PaymentInterface = require('point_of_sale.PaymentInterface');
    const { Gui } = require('point_of_sale.Gui');
    var _t = core._t;

    // Import Firebase initialization
    var FirebaseInit = require('pos_seerbit.firebase_init');

    function listenForReconciliation(transactionId) {
        // Ensure Firebase is initialized
        if (!FirebaseInit.isFirebaseAvailable()) {
            console.warn('Firebase not available for reconciliation');
            return;
        }

        const firebaseDb = FirebaseInit.getFirebaseDb();
        if (!firebaseDb) {
            console.warn('Firebase database not available for reconciliation');
            return;
        }

        const reconciliationsRef = firebaseDb.ref('reconciliations');
        reconciliationsRef.on('child_added', function(snapshot) {
            const data = snapshot.val();
            if (!data) return;

            const pending = JSON.parse(localStorage.getItem('pending_transaction') || 'null');
            if (pending && (data.id === pending.id || data.erpTransactionRef === pending.erpTransactionRef)) {
                rpc.query({
                    model: 'pos.payment.method',
                    method: 'reconcile_payment',
                    args: [data],
                }).then(function(result) {
                    // Update UI, clear localStorage, log
                    updatePaymentStatusUI(result.status, result.message);
                    localStorage.removeItem('pending_transaction');
                    // Set flag for polling to detect completion
                    localStorage.setItem('reconciliation_complete', 'true');
                    console.log('Reconciliation complete via RPC:', result);
                }).catch(function(error) {
                    console.warn('RPC reconciliation failed:', error);
                    console.error('Reconciliation failed:', error);
                    updatePaymentStatusUI('error', 'Reconciliation failed - please contact support');
                });
            }
        });
    }

    function updatePaymentStatusUI(status, message) {
        // Implement UI update logic here (e.g., show Paid/Failed)
        // This can be customized to your POS UI
        if (status === 'success' || status === 'successful') {
            Gui.showPopup('ConfirmPopup', {
                title: _t('Payment Successful'),
                body: message || _t('The payment was successfully reconciled.'),
            });
        } else if (status === 'failed' || status === 'closed') {
            Gui.showPopup('ErrorPopup', {
                title: _t('Payment Failed'),
                body: message || _t('The payment failed or was closed.'),
            });
        } else if (status === 'error') {
            Gui.showPopup('ErrorPopup', {
                title: _t('Payment Error'),
                body: message || _t('An error occurred during payment processing.'),
            });
        } else if (status === 'warning') {
            Gui.showPopup('ConfirmPopup', {
                title: _t('Payment Warning'),
                body: message || _t('Payment processing completed with warnings.'),
            });
        }
    }

    var PaymentSeerbit = PaymentInterface.extend({
        init: function() {
            this._super.apply(this, arguments);
            this.polling = null;
            this.was_cancelled = false;
            this.supports_reversals = false; // Seerbit doesn't support reversals
            
            console.log('PaymentSeerbit initialized');
            
            // Initialize Firebase when payment interface is created
            FirebaseInit.initializeFirebase().then(function(success) {
                if (success) {
                    console.log('Firebase initialized for Seerbit payments');
                } else {
                    console.warn('Firebase initialization failed for Seerbit payments');
                }
            }).catch(function(error) {
                console.error('Firebase initialization error:', error);
            });
        },

        send_payment_request: function (cid) {
            console.log('PaymentSeerbit: send_payment_request called with cid:', cid);
            this._super.apply(this, arguments);
            this._reset_state();
            return this._seerbit_pay(cid);
        },

        send_payment_cancel: function (order, cid) {
            console.log('PaymentSeerbit: send_payment_cancel called');
            this._super.apply(this, arguments);
            return this._seerbit_cancel();
        },

        close: function () {
            console.log('PaymentSeerbit: close called');
            this._seerbit_cancel();
            this._super.apply(this, arguments);
        },

        // Add the missing start_get_status_polling method
        start_get_status_polling: function() {
            console.log('PaymentSeerbit: start_get_status_polling called');
            return new Promise((resolve, reject) => {
                const pending = JSON.parse(localStorage.getItem('pending_transaction') || 'null');
                if (!pending) {
                    console.log('No pending transaction found');
                    resolve(false);
                    return;
                }

                console.log('Starting polling for transaction:', pending.id);

                // Set up polling to check for reconciliation
                const checkStatus = () => {
                    if (this.was_cancelled) {
                        console.log('Polling cancelled');
                        clearTimeout(this.polling);
                        resolve(false);
                        return;
                    }

                    // Check if reconciliation has occurred
                    const reconciled = localStorage.getItem('reconciliation_complete');
                    if (reconciled) {
                        console.log('Reconciliation detected, stopping polling');
                        clearTimeout(this.polling);
                        localStorage.removeItem('reconciliation_complete');
                        resolve(true);
                        return;
                    }

                    // Continue polling every 2 seconds
                    this.polling = setTimeout(checkStatus, 2000);
                };

                // Start polling
                checkStatus();

                // Set a timeout to stop polling after 5 minutes
                setTimeout(() => {
                    if (this.polling) {
                        console.log('Polling timeout reached');
                        clearTimeout(this.polling);
                        resolve(false);
                    }
                }, 300000); // 5 minutes
            });
        },

        pending_seerbit_line: function() {
            const order = this.pos.get_order();
            if (!order || !order.paymentlines) return null;
            
            return order.paymentlines.find(
                paymentLine => paymentLine.payment_method && 
                              paymentLine.payment_method.use_payment_terminal === 'seerbit' && 
                              !paymentLine.is_done()
            );
        },

        // Trigger handlers for UI buttons
        send_force_done: function (line) {
            // Force mark payment as done (for manual override)
            if (line && typeof line.set_payment_status === 'function') {
                line.set_payment_status('done');
                this._show_error(_t('Payment manually confirmed.'), _t('Manual Override'));
            }
        },

        send_payment_request_retry: function (line) {
            // Retry sending payment request
            const order = this.pos.get_order();
            if (!order || !line || !line.cid) return;
            
            const cid = line.cid;
            this._reset_state();
            return this._seerbit_pay(cid);
        },

        // private methods
        _reset_state: function () {
            this.was_cancelled = false;
            if (this.polling) {
                clearTimeout(this.polling);
                this.polling = null;
            }
        },

        _seerbit_pay_data: function () {
            // Construct the payload as per your spec
            const order = this.pos.get_order();
            if (!order || !order.selected_paymentline) {
                throw new Error('No order or payment line selected');
            }

            const paymentline = order.selected_paymentline;
            // Convert order name to id-like string
            let orderRef = order.name ? String(order.name).replace(/\s+/g, '').toLowerCase() : '';
            const payload = {
                id: order.uid, // Odoo order id
                posid: this.pos.config.id, // POS terminal id
                merchantid: this.pos.user.id, // Odoo user id
                transactionValue: paymentline.amount.toFixed(2),
                status: 'open',
                merchatTerminalId: this.pos.config.id,
                transactionRef: '',
                senTime: new Date().toISOString(),
                receivDateTime: '',
                erpTransactionRef: 'odoo_' + orderRef, // Always prefix, id-like
                transactionId: '',
                pubkey: paymentline.payment_method.seerbit_public_key,
            };
            return payload;
        },

        _seerbit_pay: function (cid) {
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

            // Send to backend to push to Firebase
            return rpc.query({
                model: 'pos.payment.method',
                method: 'send_seerbit_payment_request',
                args: [[order.selected_paymentline.payment_method.id], payload],
            }).then(() => {
                // Save to localStorage for recovery
                localStorage.setItem('pending_transaction', JSON.stringify(payload));
                // Start listening for reconciliation
                listenForReconciliation(payload.id);
                // Set UI to waiting
                const line = order.paymentlines.find(paymentLine => paymentLine.cid === cid);
                if (line && typeof line.set_payment_status === 'function') {
                    line.set_payment_status('waitingSeerbit');
                }
            }).catch((error) => {
                // Set error status for retry button
                const line = order.paymentlines.find(paymentLine => paymentLine.cid === cid);
                if (line && typeof line.set_payment_status === 'function') {
                    line.set_payment_status('errorSeerbit');
                }
                this._show_error(_t('Could not send payment request.'), 'Seerbit Error');
                console.error('Payment request failed:', error);
                throw error;
            });
        },

        _seerbit_cancel: function () {
            console.log('PaymentSeerbit: _seerbit_cancel called');
            this.was_cancelled = true;
            if (this.polling) {
                clearTimeout(this.polling);
                this.polling = null;
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

    console.log('PaymentSeerbit class defined with methods:', Object.getOwnPropertyNames(PaymentSeerbit.prototype));
    return PaymentSeerbit;
});
