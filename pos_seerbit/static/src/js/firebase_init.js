// pos_seerbit/static/src/js/firebase_init.js
// This file assumes firebase-app.js and firebase-database.js are loaded via CDN in the manifest
// and exposes firebaseApp and firebaseDb globally for use in other modules.

odoo.define('pos_seerbit.firebase_init', function (require) {
    "use strict";

    var core = require('web.core');
    var rpc = require('web.rpc');
    var _t = core._t;

    /**
     * Initialize Firebase for the Seerbit module
     * This function sets up Firebase configuration and makes it available globally
     */
    function initializeFirebase() {
        return rpc.query({
            model: 'pos.payment.method',
            method: 'get_firebase_config',
            args: [],
        }).then(function(config) {
            if (!config || !config.api_key || !config.database_url) {
                console.warn('Firebase configuration not available');
                return false;
            }

            try {
                // Initialize Firebase if not already initialized
                if (!window.firebase || !window.firebase.apps.length) {
                    const firebaseConfig = {
                        apiKey: config.api_key,
                        databaseURL: config.database_url,
                        projectId: config.project_id,
                    };

                    // Initialize Firebase
                    firebase.initializeApp(firebaseConfig);
                    console.log('Firebase initialized successfully');
                }

                // Make Firebase database available globally
                window.firebaseDb = firebase.database();
                return true;
            } catch (error) {
                console.error('Failed to initialize Firebase:', error);
                return false;
            }
        }).catch(function(error) {
            console.error('Failed to get Firebase config:', error);
            return false;
        });
    }

    /**
     * Check if Firebase is available and initialized
     */
    function isFirebaseAvailable() {
        return !!(window.firebase && window.firebaseDb);
    }

    /**
     * Get Firebase database reference
     */
    function getFirebaseDb() {
        if (!isFirebaseAvailable()) {
            console.warn('Firebase not available');
            return null;
        }
        return window.firebaseDb;
    }

    return {
        initializeFirebase: initializeFirebase,
        isFirebaseAvailable: isFirebaseAvailable,
        getFirebaseDb: getFirebaseDb,
    };
}); 