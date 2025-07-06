// pos_seerbit/static/src/js/firebase_init.js
// This file assumes firebase-app.js and firebase-database.js are loaded via CDN in the manifest
// and exposes firebaseApp and firebaseDb globally for use in other modules.

if (!window.firebaseApp) {
    // Get Firebase config from backend via simple fetch
    fetch('/pos_seerbit/config')
        .then(response => response.json())
        .then(data => {
            if (data.firebase_config) {
                window.firebaseApp = firebase.initializeApp(data.firebase_config);
                window.firebaseDb = firebase.database();
                console.log('Firebase initialized with backend config');
            } else {
                throw new Error('No Firebase config in response');
            }
        })
        .catch(error => {
            console.error('Failed to get Firebase config from backend:', error);
            // Fallback to default config (for development)
            const fallbackConfig = {
                apiKey: "YOUR_READONLY_API_KEY",
                databaseURL: "YOUR_DATABASE_URL",
                projectId: "YOUR_PROJECT_ID"
            };
            window.firebaseApp = firebase.initializeApp(fallbackConfig);
            window.firebaseDb = firebase.database();
            console.warn('Using fallback Firebase config');
        });
} 