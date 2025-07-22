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
            this.polling = null;
            this.was_cancelled = false;
            this.supports_reversals = false;
            
            // Initialize Firebase when payment interface is created
            this._initializeFirebase();
        },

        _initializeFirebase: function() {
            FirebaseInit.initializeFirebase().then(function(success) {
                if (success) {
                    // Firestore initialized successfully
                } else {
                    console.warn('Firestore initialization failed. Status:', FirebaseInit.getFirebaseStatus());
                }
            }).catch(function(error) {
                console.error('Firestore initialization error:', error);
            });
        },

        // Odoo 17/18: Proper payment request method
        send_payment_request: function (cid) {
            this._super.apply(this, arguments);
            this._reset_state();
            
            const order = this.pos.get_order();
            const line = order.paymentlines.find(paymentLine => paymentLine.cid === cid);
            
            if (!line) {
                return Promise.reject(new Error('Payment line not found'));
            }

            // Set initial status
            line.set_payment_status('waitingSeerbit');
            
            return this._send_payment_request_to_firestore(cid);
        },

        send_payment_cancel: function (order, cid) {
            this._super.apply(this, arguments);
            this._seerbit_cancel();
            return Promise.resolve();
        },

        close: function () {
            this._seerbit_cancel();
            this._super.apply(this, arguments);
        },

        pending_seerbit_line: function() {
            return this.pos.get_order().paymentlines.find(
                paymentLine => paymentLine.payment_method.use_payment_terminal === 'seerbit' && (!paymentLine.is_done()));
        },

        // private methods
        _reset_state: function () {
            this.was_cancelled = false;
            this.remaining_polls = 4;
            clearTimeout(this.polling);
        },

        _seerbit_pay_data: function () {
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
            const receivedDateTime = `${day}/${month}/${year}`;
            
            // Create metadata with additional server fields
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
        },

        _send_payment_request_to_firestore: function(cid) {
            const order = this.pos.get_order();
            if (!order) {
                return Promise.reject(new Error('No order available'));
            }

            let payload;
            try {
                payload = this._seerbit_pay_data();
            } catch (error) {
                console.error('Error creating payment payload:', error);
                return Promise.reject(error);
            }

            // Send to backend to push to Firestore
            return rpc.query({
                model: 'pos.payment.method',
                method: 'send_seerbit_payment_request',
                args: [[order.selected_paymentline?.payment_method?.id], payload],
            }).then(() => {
                // Save to localStorage for tracking
                localStorage.setItem('pending_transaction', JSON.stringify(payload));
                
                // Start Firebase listener for reconciliation
                FirebaseListener.listenForReconciliation(payload.id);
                
                // Start polling for completion
                return this.start_get_status_polling();
            }).catch((error) => {
                console.error('Payment request failed:', error);
                
                // Set UI to waiting even on error to show force confirm option
                const line = order.paymentlines?.find(paymentLine => paymentLine.cid === cid);
                if (line?.set_payment_status) {
                    line.set_payment_status('waitingSeerbit');
                }
                
                // Show error but don't throw - allow user to force confirm
                this._show_error(_t('Could not send payment request. You can force confirm if payment was made.'), 'Seerbit Warning');
                
                return Promise.resolve();
            });
        },

        _seerbit_cancel: function () {
            this.was_cancelled = !!this.polling;
        },

        start_get_status_polling: function() {
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
        },

        _poll_for_response: function (resolve, reject) {
            var self = this;
            if (this.was_cancelled || !this.pos.get_order().selected_paymentline) {
                return resolve(true);
            }

            // Check localStorage for completed transaction first
            const completedTransaction = localStorage.getItem('completed_transaction');
            if (completedTransaction) {
                try {
                    const transactionData = JSON.parse(completedTransaction);
                    
                    var line = self.pending_seerbit_line();
                    if (line) {
                        // Mark payment as done
                        line.set_payment_status('done');
                        line.set_receipt_info('Transaction ID: ' + transactionData.id);
                        line.transaction_id = transactionData.id;
                        line.card_type = 'Seerbit';
                        line.cardholder_name = 'Seerbit Payment';
                        
                        // Clear localStorage
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
