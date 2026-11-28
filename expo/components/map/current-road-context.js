import { useEffect, useState } from 'react';
import { Text, useColorScheme, View } from 'react-native';
import {
    getCurrentRoadText,
    getRetainedCurrentRoadText,
    shouldClearRetainedCurrentRoadText,
} from './current-road-state';

export { getCurrentRoadText } from './current-road-state';

const CURRENT_ROAD_MISSING_GRACE_MS = 8000;

export function useStableCurrentRoadText(userLocation) {
    const [retainedRoadText, setRetainedRoadText] = useState(() =>
        getRetainedCurrentRoadText('', userLocation),
    );
    const currentRoadText = getCurrentRoadText(userLocation);
    const shouldClearImmediately =
        shouldClearRetainedCurrentRoadText(userLocation);

    useEffect(() => {
        if (currentRoadText) {
            setRetainedRoadText(currentRoadText);
            return undefined;
        }

        if (shouldClearImmediately) {
            setRetainedRoadText('');
            return undefined;
        }

        const missingRoadTimeout = setTimeout(() => {
            setRetainedRoadText('');
        }, CURRENT_ROAD_MISSING_GRACE_MS);

        return () => {
            clearTimeout(missingRoadTimeout);
        };
    }, [currentRoadText, shouldClearImmediately]);

    if (currentRoadText) {
        return currentRoadText;
    }

    return shouldClearImmediately ? '' : retainedRoadText;
}

export function CurrentRoadPill({
    className = '',
    compact = false,
    debugOutlineIsVisible = false,
    isDarkMode,
    roadText: roadTextOverride,
    style,
    testID = 'current-road-pill',
    textStyle,
    userLocation,
}) {
    const systemColorScheme = useColorScheme();
    const resolvedIsDarkMode = isDarkMode ?? systemColorScheme === 'dark';
    const roadText =
        typeof roadTextOverride === 'string'
            ? roadTextOverride.trim()
            : getCurrentRoadText(userLocation);

    if (!roadText) {
        return null;
    }

    return (
        <View
            className={`max-w-full rounded-full border shadow-sm ${compact ? 'px-2.5 py-1' : 'px-3 py-1.5'} ${resolvedIsDarkMode ? 'border-white/15 bg-neutral-900/95' : 'border-black/10 bg-white/95'} ${className}`}
            pointerEvents="none"
            style={style}
            testID={testID}
        >
            <Text
                className={`max-w-full text-center font-semibold ${compact ? 'text-[13px] leading-[18px]' : 'text-[16px] leading-[22px]'} ${resolvedIsDarkMode ? 'text-neutral-100' : 'text-neutral-900'}`}
                ellipsizeMode="tail"
                numberOfLines={1}
                style={textStyle}
            >
                {roadText}
            </Text>
            {debugOutlineIsVisible ? (
                <View
                    className="absolute inset-0 rounded-full border-2 border-amber-400"
                    pointerEvents="none"
                    testID="current-road-pill-debug-outline"
                />
            ) : null}
        </View>
    );
}
