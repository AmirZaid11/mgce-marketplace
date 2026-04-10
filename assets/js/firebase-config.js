/**
 * MGCE Marketplace - Firebase Configuration
 * Connects the static frontend to the global Firestore backend.
 */

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAyKTKgFMRcFr42XTAWtr44wx-PD80f2yk",
    authDomain: "mgce-marketplace.firebaseapp.com",
    projectId: "mgce-marketplace",
    storageBucket: "mgce-marketplace.firebasestorage.app",
    messagingSenderId: "486242782590",
    appId: "1:486242782590:web:03bae79c03a04d4295f72f",
    measurementId: "G-HNXM7K9VN8"
};

// Global Firebase Instance (Initializable after SDKs are loaded in HTML)
window._mgceFirebaseConfig = firebaseConfig;
