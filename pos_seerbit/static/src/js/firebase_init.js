/** @odoo-module **/

import { _t } from '@web/core/l10n/translation';

    // Global variables to track Firebase state
let firebaseInitialized = false;
let firestoreDb = null;
let initializationPromise = null;

// Accepts an rpc argument (env.services.rpc or useService('rpc'))
function initializeFirebase(rpc) {
        if (initializationPromise) {
            return initializationPromise;
        }
        if (firebaseInitialized && firestoreDb) {
            return Promise.resolve(true);
        }
    if (!rpc) {
        console.error('rpc is required for initializeFirebase');
        return Promise.resolve(false);
    }
    // rpc can be either a function (this.pos.rpc) or an object with .query (useService('rpc'))
    const rpcCall = typeof rpc === 'function' ?
        (params) => rpc(params) :
        (params) => rpc.query(params);
    initializationPromise = rpcCall({
            model: 'pos.payment.method',
            method: 'get_firestore_config',
            args: [],
        }).then(function(config) {
            if (!config) {
                console.error('No Firestore configuration received from server');
                return false;
            }
            if (!config.apiKey || !config.projectId) {
                console.error('Firestore configuration incomplete:', config);
                return false;
            }
            if (typeof firebase === 'undefined') {
                console.error('Firebase SDK not loaded. Check if Firebase CDN is accessible.');
                return false;
            }
            try {
                if (!firebase.apps || !firebase.apps.length) {
                    const firebaseConfig = {
                        apiKey: config.apiKey,
                        projectId: config.projectId,
                        authDomain: config.projectId + '.firebaseapp.com',
                        storageBucket: config.projectId + '.appspot.com',
                    };
                    firebase.initializeApp(firebaseConfig);
                }
                if (firebase.firestore) {
                    firestoreDb = firebase.firestore();
                    firebaseInitialized = true;
                    return true;
                } else {
                    console.error('Firestore module not available');
                    return false;
                }
            } catch (error) {
                console.error('Failed to initialize Firebase:', error);
                return false;
            }
        }).catch(function(error) {
        console.error('Failed to get Firestore configuration:', error);
            return false;
        });
        return initializationPromise;
    }

    function isFirebaseAvailable() {
        return firebaseInitialized && firestoreDb !== null;
    }

    function getFirestoreDb() {
        return firestoreDb;
    }

    function getFirebaseStatus() {
        return {
            initialized: firebaseInitialized,
        firestoreDb: firestoreDb !== null,
        firebaseAvailable: typeof firebase !== 'undefined'
    };
}

function reinitializeFirebase(rpc) {
    firebaseInitialized = false;
    firestoreDb = null;
    initializationPromise = null;
    return initializeFirebase(rpc);
}

export default {
    initializeFirebase,
    isFirebaseAvailable,
    getFirestoreDb,
    getFirebaseStatus,
    reinitializeFirebase
}; 