import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'watch-maneuver-haptics-enabled';
let enabled = true;
let loaded = false;
let loading = null;
const listeners = new Set();

export function watchHapticsEnabled() {
    return loaded && enabled;
}

export async function loadWatchHapticPreferences() {
    if (loaded) return enabled;
    loading ??= AsyncStorage.getItem(STORAGE_KEY)
        .then((stored) => {
            enabled = stored !== 'false';
            loaded = true;
            listeners.forEach((listener) => listener(enabled));
            return enabled;
        })
        .catch((error) => {
            loading = null;
            throw error;
        });
    await loading;
    return enabled;
}

export async function setWatchHapticsEnabled(next) {
    if (loading) await loading;
    await AsyncStorage.setItem(STORAGE_KEY, String(next === true));
    enabled = next === true;
    loaded = true;
    listeners.forEach((listener) => listener(enabled));
}

export function subscribeWatchHaptics(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
