import { getApps, initializeApp } from '@react-native-firebase/app';
import { Platform } from 'react-native';

const REQUIRED_WEB_FIREBASE_CONFIG = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

const OPTIONAL_WEB_FIREBASE_CONFIG = {
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

function hasRequiredWebFirebaseConfig() {
    return Object.values(REQUIRED_WEB_FIREBASE_CONFIG).every(Boolean);
}

function getWebFirebaseConfig() {
    if (!hasRequiredWebFirebaseConfig()) {
        return null;
    }

    return Object.fromEntries(
        Object.entries({
            ...REQUIRED_WEB_FIREBASE_CONFIG,
            ...OPTIONAL_WEB_FIREBASE_CONFIG,
        }).filter(([, value]) => Boolean(value)),
    );
}

export async function getFirebaseApp() {
    const [firebaseApp] = getApps();

    if (firebaseApp) {
        return firebaseApp;
    }

    if (Platform.OS !== 'web') {
        return null;
    }

    const webFirebaseConfig = getWebFirebaseConfig();

    if (!webFirebaseConfig) {
        return null;
    }

    return initializeApp(webFirebaseConfig);
}
