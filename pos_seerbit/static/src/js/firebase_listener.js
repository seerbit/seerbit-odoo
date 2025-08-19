/** @odoo-module **/

import { _t } from '@web/core/l10n/translation';
import { AlertDialog } from '@web/core/confirmation_dialog/confirmation_dialog';
import FirebaseInit from './firebase_init';

// Listen for payment reconciliation updates
function listenForReconciliation(transactionId, env) {
    if (!FirebaseInit.isFirebaseAvailable()) {
        console.warn('Firestore not available for reconciliation. Status:', FirebaseInit.getFirebaseStatus());
        FirebaseInit.reinitializeFirebase(window.__owl__.root.env.services.orm).then(function(success) {
            if (success) {
                listenForReconciliation(transactionId, env);
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
    const reconciliationsRef = firestoreDb.collection('reconciliations');
    const unsubscribe = reconciliationsRef.onSnapshot(async function(snapshot) {
        snapshot.docChanges().forEach(async function(change) {
            if (change.type === 'added') {
                const data = change.doc.data();
                const pending = JSON.parse(localStorage.getItem('pending_transaction') || 'null');
                console.log('Payment reconciliation data received:', data);
                console.log('Payment reconciliation pending:', pending);
                if (pending && (data?.id === pending?.id && data?.posid === pending?.posid) && ['success', 'completed', 'complete', 'done', 'successful'].includes(String(data?.status).toLowerCase())) {
                    localStorage.setItem('completed_transaction', JSON.stringify(data));
                    console.log('Payment reconciliation completed successfully');
                    await env.services.dialog.add(AlertDialog, {
                        title: _t('Payment Successful'),
                        body: _t('Payment has been successfully processed.'),
                    });
                }
            }
        });
    }, function(error) {
        console.error('Firestore listener error:', error);
    });
}

export default {
    listenForReconciliation
}; 