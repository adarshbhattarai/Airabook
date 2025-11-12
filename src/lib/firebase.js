import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// Use default Firestore DB locally; avoid passing a databaseId here.
// If you truly need a named database, use initializeFirestore with a databaseId.
// Environment-aware emulator connection
// NEVER use emulators in production builds - only use real Firebase services
const currentMode = import.meta.env.MODE;
const isProduction = currentMode === 'production';

export const firestore = isProduction ? getFirestore(app,"airabook") : getFirestore(app);


export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");



// Determine if we should use emulators
// NEVER use emulators in production mode - always use real Firebase services for deployed apps
// Only use emulators in development mode, running on localhost, with explicit flag
let useEmulator = false;
if (!isProduction) {
  // Only check for localhost if not in production
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('localhost');
    // Only use emulators if running locally AND explicitly enabled
    useEmulator = isLocalhost && import.meta.env.VITE_USE_EMULATOR === 'true';
  }
}
// In production mode, useEmulator is always false - use real Firebase services

console.log("🔧 Firebase config check:");
console.log("📍 Mode:", currentMode);
console.log("📍 Is Production:", isProduction);
console.log("📍 Hostname:", typeof window !== 'undefined' ? window.location.hostname : 'N/A');
console.log("🔧 VITE_USE_EMULATOR:", import.meta.env.VITE_USE_EMULATOR);
console.log("🔧 useEmulator:", useEmulator);

if (useEmulator) {
  try {
    // Use explicit IPv4 loopback to avoid IPv6/hostname CORS mismatches
    const host = '127.0.0.1';
    // Connect Auth emulator
    connectAuthEmulator(auth, `http://${host}:9099`);
    
    // Connect Firestore emulator
    connectFirestoreEmulator(firestore, host, 8080);
    
    // Connect Storage emulator
    connectStorageEmulator(storage, host, 9199);
    
    // Connect Functions emulator
    connectFunctionsEmulator(functions, host, 5001);
    
    console.log("🔥 Connected to Firebase emulators");
    console.log(`📍 Environment: ${currentMode}`);
  } catch (error) {
    console.log("Emulator connection error:", error.message);
  }
} else {
  // Using real Firebase services
  console.log(`🚀 Using Firebase services`);
  console.log(`📍 Environment: ${currentMode}`);
  console.log(`🔐 Project: ${firebaseConfig.projectId}`);
}
// App Check (optional but recommended)
// In emulator mode, enable debug token to bypass reCAPTCHA
if (useEmulator && typeof window !== 'undefined') {
  // eslint-disable-next-line no-undef
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
}
