import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
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
    roadText: roadTextOverride,
    testID = 'current-road-pill',
    userLocation,
}) {
    const roadText =
        typeof roadTextOverride === 'string'
            ? roadTextOverride.trim()
            : getCurrentRoadText(userLocation);

    if (!roadText) {
        return null;
    }

    return (
        <View
            className={`max-w-full rounded-full border border-black/10 bg-white/95 px-3 py-1.5 shadow-sm dark:border-white/15 dark:bg-neutral-900/95 ${className}`}
            pointerEvents="none"
            testID={testID}
        >
            <Text
                className="max-w-full text-center text-xs font-semibold text-neutral-900 dark:text-neutral-100"
                numberOfLines={1}
            >
                {roadText}
            </Text>
        </View>
    );
}
