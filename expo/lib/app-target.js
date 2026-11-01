import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

function getEmbeddedAndroidTarget() {
    if (Platform.OS !== 'android') return null;
    // expoConfig can come from a phone Metro session. The APK owns its target.
    const embedded = requireOptionalNativeModule('ExponentConstants')?.manifest;
    if (!embedded) return null;
    try {
        const config =
            typeof embedded === 'string' ? JSON.parse(embedded) : embedded;
        return config?.extra?.appTarget === 'automotive'
            ? 'automotive'
            : 'mobile';
    } catch {
        return 'mobile';
    }
}

export const APP_TARGET =
    getEmbeddedAndroidTarget() ??
    Constants.expoConfig?.extra?.appTarget ??
    'mobile';
export const IS_AUTOMOTIVE =
    Platform.OS === 'android' && APP_TARGET === 'automotive';
