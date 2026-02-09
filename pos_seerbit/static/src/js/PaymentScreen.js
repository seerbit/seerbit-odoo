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
            console.log('[Seerbit PaymentScreen] _resubscribeSeerbitListenerIfPending', { hasOrder: !!order, hasPendingLine: !!line, orderUid: order?.uid });
            if (!line || !line.payment_method.seerbit_terminal_id) return;

            const orderId = String(order.uid || '');
            const posid = String(line.payment_method.seerbit_terminal_id || '');
            if (!orderId || !posid) return;

            const terminal = line.payment_method.payment_terminal;

            // Unsubscribe any existing listener (e.g. from main flow) to avoid duplicate handlers
            if (terminal && terminal._reconciliationUnsubscribe) {
                terminal._reconciliationUnsubscribe();
                terminal._reconciliationUnsubscribe = null;
                terminal._reconciliationReject = null;
            }

            FirebaseListener.waitForReconciliationByOrderId(orderId, posid, {
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
                    console.log('[Seerbit PaymentScreen] reconciliation .then (reconnect)', {
                        orderId,
                        posid,
                        hasLine: !!l,
                        lineAmount: l ? l.amount : null,
                    });
                    if (!l || l !== line || !terminal || !terminal._markPaymentSuccessful) return;
                    terminal._markPaymentSuccessful(l, data, orderId, posid);
                })

                .catch((err) => {
                    if (err && err.message === 'cancelled') return;
                });
        }
    };

    Registries.Component.extend(PaymentScreen, PosSeerbitPaymentScreen);
    return PaymentScreen;
});
