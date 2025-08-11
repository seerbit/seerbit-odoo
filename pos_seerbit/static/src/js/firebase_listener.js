odoo.define('pos_seerbit.firebase_listener', function (require) {
    "use strict";

    var core = require('web.core');
    var rpc = require('web.rpc');
    const { Gui } = require('point_of_sale.Gui');
    var _t = core._t;

    // Import Firebase initialization
    var FirebaseInit = require('pos_seerbit.firebase_init');

    function listenForReconciliation(transactionId) {
        console.log('Setting up reconciliation listener for transaction:', transactionId);
        
        // Ensure Firebase is initialized
        if (!FirebaseInit.isFirebaseAvailable()) {
            console.warn('Firestore not available for reconciliation. Status:', FirebaseInit.getFirebaseStatus());
            
            // Try to reinitialize Firebase
            FirebaseInit.reinitializeFirebase().then(function(success) {
                if (success) {
                    console.log('Firestore reinitialized successfully, setting up listener');
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

        console.log('Setting up Firestore reconciliation listener...');
        
        // Listen for new documents in reconciliations collection
        const reconciliationsRef = firestoreDb.collection('reconciliations');
        const unsubscribe = reconciliationsRef.onSnapshot(function(snapshot) {
            console.log('Reconciliation snapshot received with', snapshot.docChanges().length, 'changes');
            
            snapshot.docChanges().forEach(function(change) {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    console.log('Reconciliation data received:', data);

                    const pending = JSON.parse(localStorage.getItem('pending_transaction') || 'null');
                    if (pending && (data?.id === pending?.id && data?.posid === pending?.posid) && ['success', 'completed', 'complete', 'done', 'successful'].includes(String(data?.status).toLowerCase())) {
                        console.log('Matching transaction found, setting completed_transaction...');
                        
                        // Set completed transaction in localStorage for polling to detect?
                        localStorage.setItem('completed_transaction', JSON.stringify(data));
                        
                        // Show success message
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

    // Auto-start listener for any pending transaction on page load
    function startListenerForPendingTransaction() {
        const pending = JSON.parse(localStorage.getItem('pending_transaction') || 'null');
        if (pending && pending.id) {
            console.log('Found pending transaction, starting listener for:', pending.id);
            listenForReconciliation(pending.id);
        }
    }

    // Start listener when module loads
    startListenerForPendingTransaction();

    return {
        listenForReconciliation: listenForReconciliation,
        startListenerForPendingTransaction: startListenerForPendingTransaction
    };
}); 