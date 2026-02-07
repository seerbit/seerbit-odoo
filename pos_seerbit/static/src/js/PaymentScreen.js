odoo.define('pos_seerbit.PaymentScreen', function(require) {
    "use strict";

    const PaymentScreen = require('point_of_sale.PaymentScreen');
    const Registries = require('point_of_sale.Registries');
    const FirebaseListener = require('pos_seerbit.firebase_listener');
    const { onMounted } = require("@odoo/owl");

    const PosSeerbitPaymentScreen = PaymentScreen => class extends PaymentScreen {
        setup() {
            super.setup();
            onMounted(() => this._resubscribeSeerbitListenerIfPending());
        }

        _resubscribeSeerbitListenerIfPending() {
            const order = this.currentOrder;
            if (!order) return;

            const line = order.paymentlines.find(
                (pl) => pl.payment_method.use_payment_terminal === 'seerbit' && !pl.is_done()
            );
            if (!line || !line.payment_method.seerbit_terminal_id) return;

            const orderId = String(order.uid || '');
            const posid = String(line.payment_method.seerbit_terminal_id || '');
            if (!orderId || !posid) return;

            const terminal = line.payment_method.payment_terminal;

            FirebaseListener.waitForReconciliationByOrderId(orderId, posid, {
                timeoutMs: 1200000,
                onReady: (unsubscribe, rejectOnce) => {
                    if (terminal) {
                        terminal._reconciliationUnsubscribe = unsubscribe;
                        terminal._reconciliationReject = rejectOnce;
                    }
                },
            })
                .then((data) => {
                    const l = order.paymentlines.find(
                        (pl) => pl.payment_method.use_payment_terminal === 'seerbit' && !pl.is_done()
                    );
                    if (!l || l !== line || !terminal || !terminal._markPaymentSuccessful) return;
                    terminal._markPaymentSuccessful(l, data, orderId, posid);
                })
                
                .catch((err) => {
                    if (err && err.message === 'cancelled') return;
                    if (err && err.message === 'Reconciliation timeout') return;
                });
        }
    };

    Registries.Component.extend(PaymentScreen, PosSeerbitPaymentScreen);
    return PaymentScreen;
});
