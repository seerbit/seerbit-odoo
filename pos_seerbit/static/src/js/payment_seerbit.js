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
        console.log('Setting up reconciliation listener for transaction:', transactionId);
        
        // Ensure Firebase is initialized
        if (!FirebaseInit.isFirebaseAvailable()) {
            console.warn('Firestore not available for reconciliation. Status:', FirebaseInit.getFirebaseStatus());
            
            // Try to reinitialize Firebase
            FirebaseInit.reinitializeFirebase().then(function(success) {
                if (success) {
                    console.log('Firestore reinitialized successfully, setting up listener');
                    listenForReconciliation(transactionId);
                } else {
                    console.error('Failed to reinitialize Firestore');
                }
            });
            return;
        }

        const firestoreDb = FirebaseInit.getFirestoreDb();
        if (!firestoreDb) {
            console.warn('Firestore database not available for reconciliation');
            return;
        }

        console.log('Setting up Firestore reconciliation listener...');
        
        // Listen for new documents in reconciliations collection
        const reconciliationsRef = firestoreDb.collection('reconciliations');
        const unsubscribe = reconciliationsRef.onSnapshot(function(snapshot) {
            console.log('Reconciliation snapshot received with', snapshot.docChanges().length, 'changes');
            
            snapshot.docChanges().forEach(function(change) {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    console.log('Reconciliation data received:', data);

                    const pending = JSON.parse(localStorage.getItem('pending_transaction') || 'null');
                    if (pending && data.id === pending.id) {
                        console.log('Matching transaction found, processing reconciliation...');
                        
                        // Add reconciliation timestamp
                        data.reconciliation_time = new Date().toISOString();
                        data.reconciled_by = 'odoo_pos_frontend';
                        
                        // Ensure all reconciliation data is properly formatted
                        const reconciliationData = {
                            'id': data.id || '',
                            'transactionValue': data.transactionValue || '',
                            'receivedDateTime': data.receivedDateTime || '',
                            'status': data.status || '',
                            'transactionTime': data.transactionTime || '',
                            'posid': data.posid || '',
                            'transactionRef': data.transactionRef || '',
                            'reconciliation_time': data.reconciliation_time,
                            'reconciled_by': data.reconciled_by
                        };
                        
                        rpc.query({
                            model: 'pos.payment.method',
                            method: 'reconcile_payment',
                            args: [reconciliationData],
                        }).then(function(result) {
                            console.log('Reconciliation RPC result:', result);
                            
                            // Update UI and clear localStorage
                            updatePaymentStatusUI(result.status, result.message);
                            localStorage.removeItem('pending_transaction');
                            localStorage.setItem('reconciliation_complete', 'true');
                        }).catch(function(error) {
                            console.error('Reconciliation failed:', error);
                            updatePaymentStatusUI('error', 'Reconciliation failed');
                        });
                    }
                }
            });
        }, function(error) {
            console.error('Firestore listener error:', error);
        });
    }

    function updatePaymentStatusUI(status, message) {
        // Updated to handle "completed" status from Firestore
        if (status === 'success' || status === 'completed') {
            Gui.showPopup('ConfirmPopup', {
                title: _t('Payment Successful'),
                body: message || _t('The payment was successfully reconciled.'),
            });
        } else if (status === 'failed') {
            Gui.showPopup('ErrorPopup', {
                title: _t('Payment Failed'),
                body: message || _t('The payment was not successfully reconciled.'),
            });
        } else if (status === 'error') {
            console.log('Payment error:', message);
        } else {
            console.log('Payment status:', status, message);
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
                console.log('Pending transaction data:', pending);

                // Set up polling to check for reconciliation
                const checkStatus = () => {
                    if (this.was_cancelled) {
                        console.log('Polling cancelled by user');
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

                    console.log('Polling check - no reconciliation yet, continuing...');
                    // Continue polling every 2 seconds
                    this.polling = setTimeout(checkStatus, 2000);
                };

                // Start polling
                checkStatus();

                // Set a timeout to stop polling after 10 minutes
                setTimeout(() => {
                    if (this.polling) {
                        console.log('Polling timeout reached');
                        clearTimeout(this.polling);
                    }
                }, 600000); // 10 minutes
            });
        },

        pending_seerbit_line: function() {
            const order = this.pos.get_order();
            if (!order?.paymentlines) return null;
            
            return order.paymentlines.find(
                paymentLine => paymentLine?.payment_method?.use_payment_terminal === 'seerbit' && 
                              !paymentLine.is_done()
            );
        },

        // Trigger handlers for UI buttons
        send_force_done: function (line) {
            // Force mark payment as done (for manual override)
            if (line?.set_payment_status) {
                line.set_payment_status('done');
                // Clear any pending transaction
                localStorage.removeItem('pending_transaction');
                localStorage.removeItem('reconciliation_complete');
                // Stop any polling
                if (this.polling) {
                    clearTimeout(this.polling);
                    this.polling = null;
                }
                this._show_error(_t('Payment manually confirmed.'), _t('Manual Override'));
            }
        },

        send_payment_request_retry: function (line) {
            // Retry sending payment request
            const order = this.pos.get_order();
            if (!order || !line?.cid) return;
            
            console.log('Retrying payment request for line:', line.cid);
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
                
                // Save to localStorage for recovery
                localStorage.setItem('pending_transaction', JSON.stringify(payload));
                
                // Start listening for reconciliation
                listenForReconciliation(payload.id);
                
                // Set UI to waiting
                const line = order.paymentlines?.find(paymentLine => paymentLine.cid === cid);
                if (line?.set_payment_status) {
                    line.set_payment_status('waitingSeerbit');
                    console.log('Payment request sent and waiting for reconciliation');
                }
                
                return Promise.resolve();
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
