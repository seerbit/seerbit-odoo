/** @odoo-module **/

import { PaymentInterface } from '@point_of_sale/app/utils/payment/payment_interface';
import { register_payment_method } from '@point_of_sale/app/services/pos_store';
import { _t } from '@web/core/l10n/translation';
import { AlertDialog } from '@web/core/confirmation_dialog/confirmation_dialog';
import FirebaseInit from './firebase_init';
import FirebaseListener from './firebase_listener';

function initializeSeerbitFirebase(orm) {
    FirebaseInit.initializeFirebase(orm)
        .then(function (success) {
            if (!success) {
                console.warn(
                    'Firestore initialization failed for Seerbit payments. Status:',
                    FirebaseInit.getFirebaseStatus()
                );
            }
        })
        .catch(function (error) {
            console.error('Firestore initialization error:', error);
        });
}

export default class SeerbitPayment extends PaymentInterface {
    setup() {
        super.setup(...arguments);
        this.seerbit_was_cancelled = false;
        this.supports_reversals = false;
        this._reconciliationUnsubscribe = null;
        this._reconciliationReject = null;
        this._seerbit_cancel_ref = null;
        initializeSeerbitFirebase(this.env.services.orm);
    }

    get fastPayments() {
        return true;
    }

    /**
     * Resolve the payment line that must receive reconciliation — always from the current POS order.
     */
    _getActiveSeerbitLine(lineUuid) {
        const order = this.pos.getOrder();
        if (!order || !lineUuid) {
            return null;
        }
        return order.payment_ids.find((pl) => pl.uuid === lineUuid) || null;
    }

    /**
     * Verify Firestore doc against expected ids and the live line amount; then mark done.
     */
    _markPaymentSuccessful(line, data, expectedOrderId, expectedPosid) {
        const docId = String(data?.id ?? '');
        const docPosid = String(data?.posid ?? '');
        let meta = {};
        try {
            meta = data?.metadata ? JSON.parse(data.metadata) : {};
        } catch (e) {
            meta = {};
        }
        const docAmount = parseFloat(meta.odoo_amount != null ? meta.odoo_amount : 0);
        const lineAmount = parseFloat(line.getAmount ? line.getAmount() : line.amount || 0);

        if (docId !== String(expectedOrderId) || docPosid !== String(expectedPosid)) {
            throw new Error('Reconciliation doc does not match order');
        }
        if (Math.abs(docAmount - lineAmount) > 0.01) {
            throw new Error('Reconciliation amount does not match order line');
        }

        const transactionId = data?.sessionId || data?.transactionRef || data?.id || '';
        line.setReceiptInfo('Transaction ID: ' + transactionId);
        line.transaction_id = transactionId;
        line.card_type = 'Seerbit';
        line.cardholder_name = 'Seerbit Payment';

        line.setPaymentStatus('done'); // Mark the payment line as done

        setTimeout(() => {
            this.env.services.dialog.add(AlertDialog, {
                title: _t('Payment Successful'),
                body: _t('Payment has been successfully processed.'),
            });
        }, 0);
        return true;
    }

    async sendPaymentRequest(uuid) {
        const order = this.pos.getOrder();
        if (!order) {
            console.error('Order not found in sendPaymentRequest for uuid:', uuid);
            return false;
        }
        const line = order.payment_ids.find((paymentLine) => paymentLine.uuid === uuid);
        if (!line) {
            console.error('Payment line not found for uuid:', uuid);
            return false;
        }
        if (line.amount < 0.01) {
            await this.env.services.dialog.add(AlertDialog, {
                title: _t('Amount Error'),
                body: _t('Cannot process transactions with invalid amount.'),
            });
            return false;
        }
        line.setPaymentStatus('waiting');
        return this._send_seerbit_payment_request_to_firestore(line);
    }

    async sendPaymentCancel(order, uuid) {
        this.seerbit_was_cancelled = true;
        if (this._reconciliationUnsubscribe) {
            this._reconciliationUnsubscribe();
            this._reconciliationUnsubscribe = null;
        }
        if (this._reconciliationReject) {
            this._reconciliationReject(new Error('cancelled'));
            this._reconciliationReject = null;
        }
        if (this._seerbit_cancel_ref) {
            this._seerbit_cancel_ref.cancelled = true;
        }
        this._reset_seerbit_state();
        return true;
    }

    _seerbit_pay_data(paymentLine) {
        const order = this.pos.getOrder();
        const paymentMethod = paymentLine.payment_method_id;
        const orderId = order?.uuid || order?.id;

        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const receivedDateTime = `${day}/${month}/${year} ${hour}:${minute}`;
        const amountStr =
            paymentLine.getAmount != null
                ? paymentLine.getAmount().toFixed(2)
                : Number(paymentLine.amount || 0).toFixed(2);

        const metadata = JSON.stringify({
            created_by: 'odoo_pos_seerbit',
            created_time: now.toISOString(),
            order_id: orderId,
            pos_config_id: this.pos.config?.id,
            user_id: this.pos.user?.id,
            odoo_amount: amountStr,
        });

        return {
            id: String(orderId),
            posid: paymentMethod?.seerbit_terminal_id || '',
            merchantid: '',
            metadata,
            transactionValue: amountStr,
            status: 'open',
            transactionTime: '',
            sessionId: '',
            receivedDateTime,
            transactionRef: '',
            pubkey: paymentMethod?.seerbit_public_key || '',
        };
    }

    _send_seerbit_payment_request_to_firestore(paymentLine) {
        const self = this;
        let payload;
        try {
            payload = self._seerbit_pay_data(paymentLine);
        } catch (error) {
            console.error('Error creating payment payload:', error);
            return Promise.reject(error);
        }
        if (!paymentLine.payment_method_id?.id) {
            return Promise.resolve(false);
        }

        const lineUuid = paymentLine.uuid;
        const expectedOrderId = payload.id;
        const expectedPosid = payload.posid;

        self._reset_seerbit_state();
        self._seerbit_cancel_ref = { cancelled: false };

        return self.env.services.orm
            .call(
                'pos.payment.method',
                'send_seerbit_payment_request',
                [[paymentLine.payment_method_id.id], payload],
                {}
            )
            .then(function () {
                console.log('[Seerbit] Payment request sent, waiting for Firestore reconciliation');
                return FirebaseListener.waitForReconciliationByOrderId(expectedOrderId, expectedPosid, {
                    cancelRef: self._seerbit_cancel_ref,
                    onReady: function (unsubscribe, rejectOnce) {
                        self._reconciliationUnsubscribe = unsubscribe;
                        self._reconciliationReject = rejectOnce;
                    },
                }).then(function (data) {
                    const line = self._getActiveSeerbitLine(lineUuid);
                    const order = self.pos.getOrder();
                    if (!line || !order) {
                        throw new Error('No pending payment line');
                    }
                    if (String(order.uuid || order.id) !== String(expectedOrderId)) {
                        throw new Error('Order changed during reconciliation');
                    }
                    self._markPaymentSuccessful(line, data, expectedOrderId, expectedPosid);
                    return true;
                });
            })
            .catch(async function (error) {
                const line = self._getActiveSeerbitLine(lineUuid);
                const msg = error && error.message;
                // User removed line / cancelled terminal — must resolve (false), not reject, or line.pay() throws.
                if (msg === 'cancelled') {
                    if (line && line.getPaymentStatus && line.getPaymentStatus() !== 'waitingCancel') {
                        line.setPaymentStatus('waitingCancel');
                    }
                    return false;
                }
                console.error('[Seerbit] Payment / reconciliation failed:', error);
                if (line) {
                    line.setPaymentStatus('retry');
                }
                await self.env.services.dialog.add(AlertDialog, {
                    title: _t('Seerbit'),
                    body:
                        msg || _t('Could not confirm payment. You can retry or force done if the customer paid.'),
                });
                return false;
            })
            .finally(function () {
                self._reconciliationUnsubscribe = null;
                self._reconciliationReject = null;
                self._seerbit_cancel_ref = null;
                self.seerbit_was_cancelled = false;
                if (self.pos) {
                    self.pos.paymentTerminalInProgress = false;
                }
            });
    }

    _reset_seerbit_state() {
        if (this._reconciliationUnsubscribe) {
            this._reconciliationUnsubscribe();
        }
        this._reconciliationUnsubscribe = null;
        this._reconciliationReject = null;
        if (this._seerbit_cancel_ref) {
            this._seerbit_cancel_ref.cancelled = true;
        }
        this._seerbit_cancel_ref = null;
    }

    async sendForceDone(line) {
        if (line && line.payment_method_id && line.payment_method_id.use_payment_terminal === 'seerbit') {
            line.setPaymentStatus('done');
            line.setReceiptInfo(
                'Transaction ID: ' + String(line.pos_order_id?.uuid || line.order_id?.uuid || '')
            );
            this._reset_seerbit_state();

            await this.env.services.dialog.add(AlertDialog, {
                title: _t('Seerbit Payment'),
                body: _t('Payment forcibly confirmed as done.'),
            });
            this.pos.paymentTerminalInProgress = false;

            return Promise.resolve();
        }
    }

    close() {
        this.seerbit_was_cancelled = true;
        this._reset_seerbit_state();
    }
}

register_payment_method('seerbit', SeerbitPayment);
