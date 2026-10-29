import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { MAP_OVERLAY_LAYOUT_ANIMATION } from './layout-animations';
import { mapLiquidGlassIsAvailable } from './map-liquid-glass';
import { NativeWindGlassView } from './native-components';

export function SearchGlassShell({
    children,
    searchGlassTintColor,
    searchSource,
}) {
    if (!mapLiquidGlassIsAvailable()) {
        return (
            <Animated.View
                className="overflow-hidden rounded-[26px] border border-daf-border-glass bg-white/90 shadow-[0px_1px_2px_rgba(11,14,18,0.14)] shadow-[0px_6px_22px_rgba(11,14,18,0.16)] dark:border-white/10 dark:bg-daf-surface-dark/90"
                layout={MAP_OVERLAY_LAYOUT_ANIMATION}
                testID={`map-search-shell-${searchSource}`}
            >
                {children}
            </Animated.View>
        );
    }

    return (
        <Animated.View
            className="overflow-hidden rounded-[26px]"
            layout={MAP_OVERLAY_LAYOUT_ANIMATION}
            testID={`map-search-shell-${searchSource}`}
        >
            <NativeWindGlassView
                className="overflow-hidden rounded-[26px] border-hairline border-white/45"
                colorScheme="auto"
                glassEffectStyle="regular"
                isInteractive
                tintColor={searchGlassTintColor}
            >
                <View className="overflow-hidden rounded-[26px]">
                    {children}
                </View>
            </NativeWindGlassView>
        </Animated.View>
    );
}
