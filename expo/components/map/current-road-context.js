import { Text, View } from 'react-native';

function getRoadContext(userLocation) {
    return userLocation?.mapboxNavigation?.roadContext ?? null;
}

export function getCurrentRoadText(userLocation) {
    const roadContext = getRoadContext(userLocation);
    const primaryText =
        typeof roadContext?.primaryText === 'string'
            ? roadContext.primaryText.trim()
            : '';

    if (primaryText) {
        return primaryText;
    }

    const component = Array.isArray(roadContext?.components)
        ? roadContext.components.find((item) => {
              return typeof item?.text === 'string' && item.text.trim();
          })
        : null;

    return typeof component?.text === 'string' ? component.text.trim() : '';
}

export function CurrentRoadPill({
    className = '',
    testID = 'current-road-pill',
    userLocation,
}) {
    const roadText = getCurrentRoadText(userLocation);

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
