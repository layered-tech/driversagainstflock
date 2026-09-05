import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SafeAreaInsetsOverrideProvider } from '../lib/safe-area-insets';
import {
    AutoPlayMapSurfaceContent,
    getAutoPlayMapControlHandlers,
    setAutoPlayMapButtonAppearanceListener,
    setAutoPlayMapColorScheme,
} from './auto-play-map-surface-content';
import { EMPTY_SAFE_AREA_INSETS } from './map-location-mode-shared';

const AUTO_PLAY_IS_SUPPORTED =
    Platform.OS === 'android' || Platform.OS === 'ios';

function useAutoPlaySafeAreaInsets() {
    if (!AUTO_PLAY_IS_SUPPORTED) {
        return EMPTY_SAFE_AREA_INSETS;
    }

    const { useSafeAreaInsets } = require('@iternio/react-native-auto-play');

    return useSafeAreaInsets();
}

// Platform-agnostic car map surface. Android Auto and CarPlay subclasses are
// created through this factory so they share the whole surface implementation
// and only differ by the platform config knobs they pass in.
export function createAutoPlayMapSurface(platformConfig) {
    return function AutoPlayMapSurface(props) {
        const safeAreaInsets = useAutoPlaySafeAreaInsets();

        return (
            <SafeAreaProvider>
                <SafeAreaInsetsOverrideProvider insets={safeAreaInsets}>
                    <AutoPlayMapSurfaceContent
                        autoPlaySafeAreaInsets={safeAreaInsets}
                        colorScheme={props?.colorScheme}
                        id={props?.id}
                        platformConfig={platformConfig}
                        windowInfo={props?.window}
                    />
                </SafeAreaInsetsOverrideProvider>
            </SafeAreaProvider>
        );
    };
}

export {
    getAutoPlayMapControlHandlers,
    setAutoPlayMapButtonAppearanceListener,
    setAutoPlayMapColorScheme,
};
