// pos_seerbit/static/src/js/firebase_init.js
// This file assumes firebase-app.js and firebase-database.js are loaded via CDN in the manifest
// and exposes firebaseApp and firebaseDb globally for use in other modules.

odoo.define('pos_seerbit.firebase_init', function (require) {
    "use strict";

    var core = require('web.core');
    var rpc = require('web.rpc');
    var _t = core._t;

    // Global variables to track Firebase state
    var firebaseInitialized = false;
    var firebaseDb = null;
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
        if (firebaseInitialized && firebaseDb) {
            return Promise.resolve(true);
        }

        console.log('Initializing Firebase...');

        initializationPromise = rpc.query({
            model: 'pos.payment.method',
            method: 'get_firebase_config',
            args: [],
        }).then(function(config) {
            console.log('Firebase config received:', config);
            
            if (!config) {
                console.error('No Firebase configuration received from server');
                return false;
            }

            if (!config.api_key || !config.database_url) {
                console.error('Firebase configuration incomplete:', config);
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
                        apiKey: config.api_key,
                        databaseURL: config.database_url,
                        projectId: config.project_id || 'default',
                    };

                    console.log('Initializing Firebase with config:', firebaseConfig);
                    firebase.initializeApp(firebaseConfig);
                    console.log('Firebase app initialized successfully');
                } else {
                    console.log('Firebase app already initialized');
                }

                // Make Firebase database available
                if (firebase.database) {
                    firebaseDb = firebase.database();
                    firebaseInitialized = true;
                    console.log('Firebase database initialized successfully');
                    return true;
                } else {
                    console.error('Firebase database module not available');
                    return false;
                }
            } catch (error) {
                console.error('Failed to initialize Firebase:', error);
                return false;
            }
        }).catch(function(error) {
            console.error('Failed to get Firebase config from server:', error);
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
        return firebaseInitialized && firebaseDb !== null;
    }

    /**
     * Get Firebase database reference
     */
    function getFirebaseDb() {
        if (!isFirebaseAvailable()) {
            console.warn('Firebase not available. Initialization status:', {
                firebaseInitialized: firebaseInitialized,
                firebaseDb: !!firebaseDb,
                firebaseSdk: typeof firebase !== 'undefined'
            });
            return null;
        }
        return firebaseDb;
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
        if (!config.database_url || typeof config.database_url !== 'string') {
            console.error('Invalid database URL:', config.database_url);
            return false;
        }
        if (!config.database_url.startsWith('https://')) {
            console.error('Database URL must start with https://:', config.database_url);
            return false;
        }
        return true;
    }

    /**
     * Force re-initialization of Firebase
     */
    function reinitializeFirebase() {
        console.log('Forcing Firebase re-initialization...');
        firebaseInitialized = false;
        firebaseDb = null;
        initializationPromise = null;
        return initializeFirebase();
    }

    /**
     * Get Firebase initialization status
     */
    function getFirebaseStatus() {
        return {
            initialized: firebaseInitialized,
            databaseAvailable: !!firebaseDb,
            sdkLoaded: typeof firebase !== 'undefined',
            appsCount: firebase && firebase.apps ? firebase.apps.length : 0
        };
    }

    return {
        initializeFirebase: initializeFirebase,
        isFirebaseAvailable: isFirebaseAvailable,
        getFirebaseDb: getFirebaseDb,
        getFirebaseApp: getFirebaseApp,
        validateFirebaseConfig: validateFirebaseConfig,
        reinitializeFirebase: reinitializeFirebase,
        getFirebaseStatus: getFirebaseStatus,
    };
}); 