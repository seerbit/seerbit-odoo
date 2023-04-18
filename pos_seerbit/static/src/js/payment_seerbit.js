odoo.define('pos_seerbit.payment', function (require) {
    "use strict";

    var core = require('web.core');
    var rpc = require('web.rpc');
    var PaymentInterface = require('point_of_sale.PaymentInterface');
    const { Gui } = require('point_of_sale.Gui');
    var _t = core._t;

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
            this.remaining_polls = 4;
            clearTimeout(this.polling);
        },

        _seerbit_pay_data: function () {
            return {
                'Currency': this.pos.currency.name,
                'RequestedAmount': this.pos.get_order().selected_paymentline.amount,
            };
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
            return this.start_get_status_polling()
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
            return rpc.query({
                model: 'pos.payment.method',
                method: 'get_latest_seerbit_status',
                args: [[this.payment_method.id], self._seerbit_pay_data()],
            }, {
                timeout: 3000,
                shadow: true,
            }).then(function (status) {
                console.log(status);
                var notification = status.latest_response;
                var line = self.pending_seerbit_line();
                if (line) {
                    if (line.payment_status == 'done') {
                    } else if (notification) {
                        // A matching payment has been received
                        line.set_receipt_info('Session ID: ' + notification.data.reference);
                        line.transaction_id = notification.data.reference;
                        line.card_type = notification.data.channelType;
                        line.cardholder_name = notification.data.fullname;
                        resolve(true);
                    } else {
                        line.set_payment_status('waitingSeerbit');
                    }
                } else {
                    console.log("Cancelling");
                    reject();
                }
            }).catch(error => {
                console.log(error);
                let line = this.pending_seerbit_line();
                if (line) {
                    line.set_payment_status('errorSeerbit');
                };
                this._show_error(
                    _t('Could not connect to the Odoo server, please check your internet connection and try again.'),
                    'Odoo Server Error'
                );
                reject();
            });
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
