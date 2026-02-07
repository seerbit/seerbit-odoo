odoo.define('pos_seerbit.firebase_listener', function (require) {
    "use strict";

    var FirebaseInit = require('pos_seerbit.firebase_init');

    var SUCCESS_STATUSES = ['success', 'completed', 'complete', 'done', 'successful'];

    function isSuccessStatus(status) {
        return status && SUCCESS_STATUSES.includes(String(status).toLowerCase());
    }

    /**
     * Wait for a reconciliation document by order id and posid.
     * Resolves when Firestore has a matching doc with success status.
     * No polling, no localStorage. Order line is verified via reconciliation doc only.
     *
     * @param {string} orderId - Order/transaction id (order.uid)
     * @param {string} posid - Terminal id (payload.posid)
     * @param {Object} options - { timeoutMs, onReady(unsubscribe, rejectOnce), cancelRef }
     * @returns {Promise<Object>} - Resolves with reconciliation doc data, or rejects
     */
    function waitForReconciliationByOrderId(orderId, posid, options) {
        options = options || {};
        var timeoutMs = options.timeoutMs !== undefined ? options.timeoutMs : 1200000;
        var onReady = options.onReady || function () {};
        var cancelRef = options.cancelRef || { cancelled: false };

        return new Promise(function (resolve, reject) {
            if (!FirebaseInit.isFirebaseAvailable()) {
                reject(new Error('Firestore not available'));
                return;
            }

            var firestoreDb = FirebaseInit.getFirestoreDb();
            if (!firestoreDb) {
                reject(new Error('Firestore database not available'));
                return;
            }

            var settled = false;
            var unsubscribe = null;

            function finish(err, data) {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                if (unsubscribe) unsubscribe();
                if (err) reject(err);
                else resolve(data);
            }

            function rejectOnce(err) {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                if (unsubscribe) unsubscribe();
                reject(err);
            }

            var timeoutId = setTimeout(function () {
                finish(new Error('Reconciliation timeout'));
            }, timeoutMs);

            var query = firestoreDb.collection('reconciliations')
                .where('id', '==', String(orderId))
                .where('posid', '==', String(posid));

            unsubscribe = query.onSnapshot(
                function (snapshot) {
                    if (cancelRef.cancelled) {
                        finish(new Error('cancelled'));
                        return;
                    }
                    snapshot.docChanges().forEach(function (change) {
                        if (change.type !== 'added' && change.type !== 'modified') return;
                        var data = change.doc.data();
                        if (isSuccessStatus(data?.status)) {
                            finish(null, data);
                        }
                    });
                },
                function (error) {
                    console.error('Firestore reconciliation listener error:', error);
                    finish(error || new Error('Listener error'));
                }
            );

            onReady(unsubscribe, rejectOnce);
        });
    }

    return {
        waitForReconciliationByOrderId: waitForReconciliationByOrderId,
        isSuccessStatus: isSuccessStatus,
    };
});
