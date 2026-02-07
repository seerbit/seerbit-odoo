odoo.define('pos_seerbit.PaymentScreen', function(require) {
    "use strict";

    const PaymentScreen = require('point_of_sale.PaymentScreen');
    const Registries = require('point_of_sale.Registries');
    const { Gui } = require('point_of_sale.Gui');
    const core = require('web.core');
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
                    if (!l || l !== line) return;

                    const docId = String(data?.id || '');
                    const docPosid = String(data?.posid || '');
                    let meta = {};
                    try {
                        meta = data && data.metadata ? JSON.parse(data.metadata) : {};
                    } catch (e) {}
                    const docAmount = parseFloat(meta?.odoo_amount || 0);
                    const lineAmount = parseFloat(l.amount || 0);

                    if (docId !== orderId || docPosid !== posid) return;
                    if (Math.abs(docAmount - lineAmount) > 0.01) return;

                    l.set_payment_status('done');
                    l.set_receipt_info('Transaction ID: ' + (data?.sessionId || data?.transactionRef || data?.id || ''));
                    l.transaction_id = data?.sessionId || data?.transactionRef || data?.id || '';
                    l.card_type = 'Seerbit';
                    l.cardholder_name = 'Seerbit Payment';

                    console.log('Seerbit payment completed (reconnect)', {
                        orderId,
                        posid,
                        amount: lineAmount,
                        transactionId: l.transaction_id,
                    });

                    Gui.showPopup('ConfirmPopup', {
                        title: core._t('Payment Successful'),
                        body: core._t('Payment has been successfully processed.'),
                    });
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
