import { isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { Platform } from 'react-native';

export function mapLiquidGlassIsAvailable() {
    if (Platform.OS !== 'ios') {
        return false;
    }

    try {
        return isGlassEffectAPIAvailable();
    } catch {
        return false;
    }
}
