// pos_seerbit/static/src/js/firebase_init.js
// This file assumes firebase-app.js and firebase-firestore.js are loaded via CDN in the manifest
// and exposes firebaseApp and firestoreDb globally for use in other modules.

odoo.define('pos_seerbit.firebase_init', function (require) {
    "use strict";

    var core = require('web.core');
    var rpc = require('web.rpc');
    var _t = core._t;

    // Global variables to track Firebase state
    var firebaseInitialized = false;
    var firestoreDb = null;
    var initializationPromise = null;

    /**
     * Initialize Firebase for the Seerbit module
     * This function sets up Firebase configuration and makes it available globally
     */
    function initializeFirebase() {
        // Return existing promise if initialization is already in progress
        if (initializationPromise) {
            return initializationPromise;
        }

        // Return resolved promise if already initialized
        if (firebaseInitialized && firestoreDb) {
            return Promise.resolve(true);
        }

        // Initializing Firebase for Firestore

        initializationPromise = rpc.query({
            model: 'pos.payment.method',
            method: 'get_firestore_config',
            args: [],
        }).then(function(config) {
            // Firestore config received
            
            if (!config) {
                console.error('No Firestore configuration received from server');
                return false;
            }

            if (!config.apiKey || !config.projectId) {
                console.error('Firestore configuration incomplete:', config);
                return false;
            }

            // Check if Firebase SDK is loaded
            if (typeof firebase === 'undefined') {
                console.error('Firebase SDK not loaded. Check if Firebase CDN is accessible.');
                return false;
            }

            try {
                // Initialize Firebase if not already initialized
                if (!firebase.apps || !firebase.apps.length) {
                    const firebaseConfig = {
                        apiKey: config.apiKey,
                        projectId: config.projectId,
                        // Add additional config for better compatibility
                        authDomain: config.projectId + '.firebaseapp.com',
                        storageBucket: config.projectId + '.appspot.com',
                        // messagingSenderId: '123456789', // Placeholder
                        // appId: '1:123456789:web:abcdef123456' // Placeholder
                    };

                    // Initializing Firebase with config
                    firebase.initializeApp(firebaseConfig);
                    // Firebase app initialized successfully
                } else {
                                          // Firebase app already initialized
                }

                // Make Firestore database available
                if (firebase.firestore) {
                    firestoreDb = firebase.firestore();
                    firebaseInitialized = true;
                    // Firestore database initialized successfully
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
            console.error('Failed to get Firestore config from server:', error);
            return false;
        }).finally(function() {
            // Clear the promise so it can be retried
            initializationPromise = null;
        });

        return initializationPromise;
    }

    /**
     * Check if Firebase is available and initialized
     */
    function isFirebaseAvailable() {
        return firebaseInitialized && firestoreDb !== null;
    }

    /**
     * Get Firestore database reference
     */
    function getFirestoreDb() {
        if (!isFirebaseAvailable()) {
            console.warn('Firestore not available. Initialization status:', {
                firebaseInitialized: firebaseInitialized,
                firestoreDb: !!firestoreDb,
                firebaseSdk: typeof firebase !== 'undefined'
            });
            return null;
        }
        return firestoreDb;
    }

    /**
     * Get Firebase app instance
     */
    function getFirebaseApp() {
        if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
            console.warn('Firebase app not available');
            return null;
        }
        return firebase.apps[0];
    }

    /**
     * Validate Firebase configuration
     */
    function validateFirebaseConfig(config) {
        if (!config) {
            console.error('No configuration provided');
            return false;
        }
        if (!config.api_key || typeof config.api_key !== 'string') {
            console.error('Invalid API key:', config.api_key);
            return false;
        }
        if (!config.project_id || typeof config.project_id !== 'string') {
            console.error('Invalid project ID:', config.project_id);
            return false;
        }
        return true;
    }

    /**
     * Force re-initialization of Firebase
     */
    function reinitializeFirebase() {
        // Forcing Firebase re-initialization
        firebaseInitialized = false;
        firestoreDb = null;
        initializationPromise = null;
        return initializeFirebase();
    }

    /**
     * Get Firebase initialization status
     */
    function getFirebaseStatus() {
        return {
            initialized: firebaseInitialized,
            databaseAvailable: !!firestoreDb,
            sdkLoaded: typeof firebase !== 'undefined',
            appsCount: firebase && firebase.apps ? firebase.apps.length : 0
        };
    }

    return {
        initializeFirebase: initializeFirebase,
        isFirebaseAvailable: isFirebaseAvailable,
        getFirestoreDb: getFirestoreDb,
        getFirebaseApp: getFirebaseApp,
        validateFirebaseConfig: validateFirebaseConfig,
        reinitializeFirebase: reinitializeFirebase,
        getFirebaseStatus: getFirebaseStatus,
    };
}); 