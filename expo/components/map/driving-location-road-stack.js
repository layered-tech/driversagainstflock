import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import {
    CurrentRoadPill,
    useStableCurrentRoadText,
} from './current-road-context';
import { shouldShowCurrentRoadPill } from './current-road-pill-layout';
import {
    getNavigationPuckAnchorY,
    NAVIGATION_PUCK_SIZE,
} from './navigation-puck-layout';

export function DrivingLocationRoadStack({
    currentRoadPillTestID,
    onLocationAnchorLayout,
    userLocation,
    viewportTop = 0,
}) {
    const layoutYRef = useRef(null);
    const currentRoadText = useStableCurrentRoadText(userLocation);
    const currentRoadIsVisible = shouldShowCurrentRoadPill({
        roadText: currentRoadText,
    });
    const notifyLocationAnchorLayout = useCallback(() => {
        const anchorY = getNavigationPuckAnchorY({
            layoutY: layoutYRef.current,
            viewportTop,
        });

        if (anchorY !== null) {
            onLocationAnchorLayout?.(anchorY);
        }
    }, [onLocationAnchorLayout, viewportTop]);
    const handleLayout = useCallback(
        (event) => {
            layoutYRef.current = event.nativeEvent.layout.y;
            notifyLocationAnchorLayout();
        },
        [notifyLocationAnchorLayout],
    );

    useEffect(() => {
        notifyLocationAnchorLayout();
    }, [notifyLocationAnchorLayout]);

    return (
        <View
            className="items-center gap-1 px-3 pb-5"
            onLayout={handleLayout}
            pointerEvents="none"
        >
            <View
                style={{ height: NAVIGATION_PUCK_SIZE }}
                testID="driving-location-puck-layout-slot"
            />

            {currentRoadIsVisible ? (
                <CurrentRoadPill
                    className="max-w-full"
                    roadText={currentRoadText}
                    testID={currentRoadPillTestID}
                    userLocation={userLocation}
                />
            ) : null}
        </View>
    );
}
