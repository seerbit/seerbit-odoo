odoo.define('pos_seerbit.payment', function (require) {
    "use strict";

    var core = require('web.core');
    var rpc = require('web.rpc');
    var PaymentInterface = require('point_of_sale.PaymentInterface');
    const { Gui } = require('point_of_sale.Gui');
    var _t = core._t;

    function listenForReconciliation(transactionId) {
        const reconciliationsRef = window.firebaseDb.ref('reconciliations');
        reconciliationsRef.on('child_added', function(snapshot) {
            const data = snapshot.val();
            const pending = JSON.parse(localStorage.getItem('pending_transaction'));
            if (pending && data.id === pending.id) {
                // Try RPC first, fall back to webhook if it fails
                rpc.query({
                    model: 'pos.payment.method',
                    method: 'reconcile_payment',
                    args: [data],
                }).then(function(result) {
                    // Update UI, clear localStorage, log
                    updatePaymentStatusUI(result.status, result.message);
                    localStorage.removeItem('pending_transaction');
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
            clearTimeout(this.polling);
        },

        _seerbit_pay_data: function () {
            // Construct the payload as per your spec
            const order = this.pos.get_order();
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
            var order = this.pos.get_order();
            var payload = this._seerbit_pay_data();
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
                var line = order.paymentlines.find(paymentLine => paymentLine.cid === cid);
                line.set_payment_status('waitingSeerbit');
            }).catch((error) => {
                this._show_error(_t('Could not send payment request.'), 'Seerbit Error');
                console.error(error);
            });
        },

        _seerbit_cancel: function () {
            this.was_cancelled = !!this.polling;
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
