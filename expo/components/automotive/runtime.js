import * as Location from 'expo-location';
import { createAutomotiveLocationPermissions } from './location-permissions';

const listeners = new Set();
export function subscribeAutomotiveLocationReady(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export const automotiveLocationPermissions =
    createAutomotiveLocationPermissions({
        location: Location,
        onReady: () => {
            for (const listener of listeners) listener();
        },
        requestPermissions: (...args) =>
            require('@iternio/react-native-auto-play').HybridAndroidAutoTelemetry.requestAutomotivePermissions(
                ...args,
            ),
    });
