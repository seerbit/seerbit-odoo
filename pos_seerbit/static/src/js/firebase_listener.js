odoo.define('pos_seerbit.firebase_listener', ['@web/core/l10n/translation', '@web/core/network/rpc', 'point_of_sale.Gui', './firebase_init'], function (require) {
    'use strict';

    const { _t } = require("@web/core/l10n/translation");
    const { rpc } = require("@web/core/network/rpc");
    const { Gui } = require("point_of_sale.Gui");
    const FirebaseInit = require('./firebase_init');

    function listenForReconciliation(transactionId) {
        if (!FirebaseInit.isFirebaseAvailable()) {
            console.warn('Firestore not available for reconciliation. Status:', FirebaseInit.getFirebaseStatus());
            FirebaseInit.reinitializeFirebase().then(function(success) {
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
        const unsubscribe = reconciliationsRef.onSnapshot(function(snapshot) {
            snapshot.docChanges().forEach(function(change) {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    const pending = JSON.parse(localStorage.getItem('pending_transaction') || 'null');
                    if (pending && (data?.id === pending?.id && data?.posid === pending?.posid) ) {
                        localStorage.setItem('completed_transaction', JSON.stringify(data));
                        Gui.showPopup('ConfirmPopup', {
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

    return {
        listenForReconciliation
    };
}); 