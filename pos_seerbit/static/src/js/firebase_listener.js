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
     * @param {Object} options - { onReady(unsubscribe, rejectOnce), cancelRef }
     * @returns {Promise<Object>} - Resolves with reconciliation doc data, or rejects
     */
    function waitForReconciliationByOrderId(orderId, posid, options) {
        options = options || {};
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
            var isFirstSnapshot = true;

            function finish(err, data) {
                if (settled) return;
                settled = true;
                if (unsubscribe) unsubscribe();
                if (err) reject(err);
                else resolve(data);
            }

            function rejectOnce(err) {
                if (settled) return;
                settled = true;
                if (unsubscribe) unsubscribe();
                reject(err);
            }

            // Listen for new documents in reconciliations collection (like old impl, no filtered query)
            var reconciliationsRef = firestoreDb.collection('reconciliations');
            unsubscribe = reconciliationsRef.onSnapshot(
                function (snapshot) {
                    if (cancelRef.cancelled) {
                        console.log('[Seerbit] reconciliation listener cancelled');
                        finish(new Error('cancelled'));
                        return;
                    }
                    // Skip initial snapshot: Firestore fires immediately with existing docs as 'added'
                    if (isFirstSnapshot) {
                        isFirstSnapshot = false;
                        return;
                    }
                    snapshot.docChanges().forEach(function (change) {
                        if (change.type !== 'added') return;
                        var data = change.doc.data();
                        // Match by id and posid (no localStorage), check success status
                        if (data?.id === orderId && data?.posid === posid && isSuccessStatus(data?.status)) {
                            console.log('[Seerbit firebase_listener] reconciliation received', {
                                orderId: orderId,
                                posid: posid,
                                docId: data?.id,
                                docPosid: data?.posid,
                                status: data?.status,
                                data:data
                            });
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
