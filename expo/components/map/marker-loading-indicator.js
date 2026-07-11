import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import Animated, {
    Easing,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { MARKER_LOADING_FADE_DURATION_MS } from './constants';

export function MarkerLoadingIndicator({
    accessibilityLabel,
    isVisible,
    onHidden,
}) {
    const opacity = useSharedValue(0);
    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        marginBottom: 6,
    }));

    useEffect(() => {
        opacity.value = withTiming(
            isVisible ? 1 : 0,
            {
                duration: MARKER_LOADING_FADE_DURATION_MS,
                easing: Easing.out(Easing.cubic),
            },
            (finished) => {
                if (finished && !isVisible) {
                    runOnJS(onHidden)();
                }
            },
        );
    }, [isVisible, onHidden, opacity]);

    return (
        <Animated.View
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="progressbar"
            pointerEvents="none"
            style={animatedStyle}
            testID="marker-loading-indicator"
        >
            <ActivityIndicator color="#6b7280" size="small" />
        </Animated.View>
    );
}
