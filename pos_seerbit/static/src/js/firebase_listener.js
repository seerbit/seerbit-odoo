/** @odoo-module **/

import { _t } from '@web/core/l10n/translation';
import { ConfirmPopup } from '@point_of_sale/app/utils/confirm_popup/confirm_popup';
import FirebaseInit from './firebase_init';



function listenForReconciliation(transactionId) {
    if (!FirebaseInit.isFirebaseAvailable()) {
        console.warn('Firestore not available for reconciliation. Status:', FirebaseInit.getFirebaseStatus());
        FirebaseInit.reinitializeFirebase(window.__owl__.root.env).then(function(success) {
            if (success) {
                listenForReconciliation(transactionId);
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
                if (pending && (data?.id === pending?.id && data?.posid === pending?.posid) ) {
                    localStorage.setItem('completed_transaction', JSON.stringify(data));
                    await window.__owl__.root.env.services.popup.add(ConfirmPopup, {
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