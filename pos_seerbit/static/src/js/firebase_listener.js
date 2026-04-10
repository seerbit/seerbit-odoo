/** @odoo-module **/

import FirebaseInit from './firebase_init';

const SUCCESS_STATUSES = ['success', 'completed', 'complete', 'done', 'successful'];

function isSuccessStatus(status) {
    return status && SUCCESS_STATUSES.includes(String(status).toLowerCase());
}

/**
 * Wait until Firestore has a reconciliation doc matching order id + terminal posid.
 * No localStorage — caller applies the resolved data to the active payment line after verification.
 *
 * @param {string} orderId - Order id from payload (order uuid)
 * @param {string} posid - Terminal id
 * @param {Object} [options]
 * @param {function} [options.onReady] - (unsubscribe, rejectOnce) => void
 * @param {{ cancelled?: boolean }} [options.cancelRef]
 * @returns {Promise<Object>} reconciliation document fields
 */
function waitForReconciliationByOrderId(orderId, posid, options) {
    options = options || {};
    const onReady = options.onReady || function () {};
    const cancelRef = options.cancelRef || { cancelled: false };

    return new Promise(function (resolve, reject) {
        if (!FirebaseInit.isFirebaseAvailable()) {
            reject(new Error('Firestore not available'));
            return;
        }

        const firestoreDb = FirebaseInit.getFirestoreDb();
        if (!firestoreDb) {
            reject(new Error('Firestore database not available'));
            return;
        }

        let settled = false;
        let unsubscribe = null;
        let isFirstSnapshot = true;

        function finish(err, data) {
            if (settled) {
                return;
            }
            settled = true;
            if (unsubscribe) {
                unsubscribe();
            }
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        }

        function rejectOnce(err) {
            if (settled) {
                return;
            }
            settled = true;
            if (unsubscribe) {
                unsubscribe();
            }
            reject(err);
        }

        const reconciliationsRef = firestoreDb.collection('reconciliations');
        unsubscribe = reconciliationsRef.onSnapshot(
            function (snapshot) {
                if (cancelRef.cancelled) {
                    rejectOnce(new Error('cancelled'));
                    return;
                }
                if (isFirstSnapshot) {
                    isFirstSnapshot = false;
                    return;
                }
                snapshot.docChanges().forEach(function (change) {
                    if (change.type !== 'added' && change.type !== 'modified') {
                        return;
                    }
                    const data = change.doc.data();
                    if (
                        String(data?.id) === String(orderId) &&
                        String(data?.posid) === String(posid) &&
                        isSuccessStatus(data?.status)
                    ) {
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

export default {
    waitForReconciliationByOrderId,
    isSuccessStatus,
};
