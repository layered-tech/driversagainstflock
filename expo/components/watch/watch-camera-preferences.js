import AsyncStorage from '@react-native-async-storage/async-storage';

const ALERT_KEY = 'watch-camera-alerts-enabled';
let preferences = { alertsEnabled: false };
let loaded = false;
const listeners = new Set();

export function getWatchCameraPreferences() {
    return preferences;
}

export async function loadWatchCameraPreferences() {
    if (loaded) return preferences;
    const alert = await AsyncStorage.getItem(ALERT_KEY);
    preferences = {
        alertsEnabled: alert !== 'false',
    };
    loaded = true;
    listeners.forEach((listener) => listener(preferences));
    return preferences;
}

export async function setWatchCameraPreferences(change) {
    const next = { ...preferences, ...change };
    await AsyncStorage.setItem(ALERT_KEY, String(next.alertsEnabled));
    preferences = next;
    loaded = true;
    listeners.forEach((listener) => listener(preferences));
}

export function subscribeWatchCameraPreferences(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
