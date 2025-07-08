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
            this.supports_reversals = false; // Seerbit doesn't support reversals
            
            console.log('PaymentSeerbit initialized');
            
            // Initialize Firebase when payment interface is created
            this._initializeFirebase();
        },

        _initializeFirebase: function() {
            console.log('Initializing Firestore for PaymentSeerbit...');
            FirebaseInit.initializeFirebase().then(function(success) {
                if (success) {
                    console.log('Firestore initialized successfully for Seerbit payments');
                } else {
                    console.warn('Firestore initialization failed for Seerbit payments. Status:', FirebaseInit.getFirebaseStatus());
                }
            }).catch(function(error) {
                console.error('Firestore initialization error:', error);
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

        // private methods
        _reset_state: function () {
            this.was_cancelled = false;
            this.remaining_polls = 4;
            clearTimeout(this.polling);
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

        _seerbit_pay: function (cid) {
            var order = this.pos.get_order();

            if (order.selected_paymentline.amount < 0.01) {
                this._show_error(_t('Cannot process transactions with invalid amount.'),
                    'Amount Error');
                return Promise.resolve();
            }

            if (order === this.poll_error_order) {
                delete this.poll_error_order;
                return Promise.resolve();
            }

            var line = order.paymentlines.find(paymentLine => paymentLine.cid === cid);
            line.set_payment_status('waitingSeerbit');
            
            // Send payment request to Firestore instead of webhook
            return this._send_payment_request_to_firestore(cid);
        },

        _send_payment_request_to_firestore: function(cid) {
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

            console.log('Sending payment request with payload:', payload);

            // Send to backend to push to Firestore
            return rpc.query({
                model: 'pos.payment.method',
                method: 'send_seerbit_payment_request',
                args: [[order.selected_paymentline?.payment_method?.id], payload],
            }).then(() => {
                console.log('Payment request sent successfully');
                
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

        start_get_status_polling() {
            var self = this;
            var res = new Promise(function (resolve, reject) {
                // clear previous intervals just in case, otherwise
                // it'll run forever
                clearTimeout(self.polling);
                self._poll_for_response(resolve, reject);
                self.polling = setInterval(function () {
                    self._poll_for_response(resolve, reject);
                }, 3500);
            });

            // make sure to stop polling when we're done
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
                    console.log('Found completed transaction in localStorage:', transactionData);
                    
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
                        };
                        this._show_error(
                            _t('Error Marking payment as done'),
                            'Odoo Error'
                        );
                        reject();
                }
            }
             let line = this.pending_seerbit_line();
                if (line) {
                        line.set_payment_status('waitingSeerbit');
        };

            // Fallback to original polling method for backward compatibility
            // return rpc.query({
            //     model: 'pos.payment.method',
            //     method: 'get_latest_seerbit_status',
            //     args: [[this.payment_method.id], self._seerbit_pay_data()],
            // }, {
            //     timeout: 3000,
            //     shadow: true,
            // }).then(function (status) {
            //     console.log(status);
            //     var notification = status.latest_response;
            //     var line = self.pending_seerbit_line();
            //     if (line) {
            //         if (line.payment_status == 'done') {
            //         } else if (notification) {
            //             // A matching payment has been received
            //             line.set_receipt_info('Session ID: ' + notification.data.reference);
            //             line.transaction_id = notification.data.reference;
            //             line.card_type = notification.data.channelType;
            //             line.cardholder_name = notification.data.fullname;
            //             resolve(true);
            //         } else {
            //             line.set_payment_status('waitingSeerbit');
            //         }
            //     } else {
            //         console.log("Cancelling");
            //         reject();
            //     }
            // }).catch(error => {
            //     console.log(error);
            //     let line = this.pending_seerbit_line();
            //     if (line) {
            //         line.set_payment_status('errorSeerbit');
            //     };
            //     this._show_error(
            //         _t('Could not connect to the Odoo server, please check your internet connection and try again.'),
            //         'Odoo Server Error'
            //     );
            //     reject();
            // });
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
