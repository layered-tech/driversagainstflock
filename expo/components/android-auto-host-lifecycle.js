import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

// React Native pauses its Android host (JS timers without a headless task,
// Animated, Reanimated, Expo module foreground state) whenever the phone
// activity pauses, such as when the screen locks. Android Auto keeps rendering
// the car surface from that same host, so the local
// modules/android-auto-host-lifecycle module keeps the host resumed while a car
// session is connected. iOS CarPlay scenes keep the app foreground natively.
const androidAutoHostLifecycleModule =
    Platform.OS === 'android'
        ? requireOptionalNativeModule('AndroidAutoHostLifecycle')
        : null;

export function createAndroidAutoHostLifecycleSync(nativeModule) {
    let syncedCarSessionIsConnected = null;

    return function syncAndroidAutoHostLifecycle(sessionState) {
        if (typeof nativeModule?.setCarSessionConnected !== 'function') {
            return false;
        }

        const carSessionIsConnected = sessionState?.isConnected === true;

        if (syncedCarSessionIsConnected === carSessionIsConnected) {
            return false;
        }

        syncedCarSessionIsConnected = carSessionIsConnected;

        const allowRetryOnNextSessionState = () => {
            if (syncedCarSessionIsConnected === carSessionIsConnected) {
                syncedCarSessionIsConnected = null;
            }
        };

        try {
            Promise.resolve(
                nativeModule.setCarSessionConnected(carSessionIsConnected),
            ).catch(allowRetryOnNextSessionState);
        } catch {
            allowRetryOnNextSessionState();
        }

        return true;
    };
}

export const syncAndroidAutoHostLifecycle = createAndroidAutoHostLifecycleSync(
    androidAutoHostLifecycleModule,
);
