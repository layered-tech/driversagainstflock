import { useCallback, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import {
    CurrentRoadPill,
    useStableCurrentRoadText,
} from './current-road-context';
import {
    CURRENT_ROAD_PILL_BOTTOM_GAP,
    shouldShowCurrentRoadPill,
} from './current-road-pill-layout';
import { getNavigationPuckAnchorY } from './navigation-puck-layout';

function RoadPillSpacingGuide({ distance, label }) {
    return (
        <View
            className="absolute bottom-0 left-1/2 flex-row items-center gap-1"
            pointerEvents="none"
            style={{ height: distance }}
        >
            <View className="h-full w-[6px] border-y border-l border-amber-400" />
            <Text className="self-end rounded bg-neutral-950/90 px-1 text-[10px] font-bold text-amber-300">
                {distance} pt {label}
            </Text>
        </View>
    );
}

export function DrivingLocationRoadStack({
    bottomEdgeIsDirectionsSheet = false,
    bottomInset,
    currentRoadPillIsCompact = false,
    currentRoadPillIsVisible = true,
    currentRoadPillIsDarkMode,
    currentRoadPillTestID,
    currentRoadPillStyle,
    currentRoadPillTextStyle,
    debugPuckGapIsVisible = true,
    debugRoadPillOutlineIsVisible,
    isHidden = false,
    onLocationAnchorLayout,
    puckTargetGap,
    testID,
    userLocation,
    viewportHeight,
}) {
    const stackHeightRef = useRef(null);
    const puckTargetSlotHeight = puckTargetGap * 2;
    const currentRoadText = useStableCurrentRoadText(userLocation);
    const currentRoadIsVisible = Boolean(
        currentRoadPillIsVisible &&
        shouldShowCurrentRoadPill({
            roadText: currentRoadText,
        }),
    );
    const showsSpacingGuides =
        debugRoadPillOutlineIsVisible && currentRoadIsVisible;
    const notifyLocationAnchorLayout = useCallback(() => {
        if (stackHeightRef.current === null || !(viewportHeight > 0)) {
            return;
        }

        // The stack is docked at the bottom edge and the pill follows the puck slot.
        const anchorY = getNavigationPuckAnchorY({
            layoutY: viewportHeight - bottomInset - stackHeightRef.current,
            puckSize: puckTargetSlotHeight,
        });

        if (anchorY !== null) {
            onLocationAnchorLayout?.(anchorY);
        }
    }, [
        bottomInset,
        onLocationAnchorLayout,
        puckTargetSlotHeight,
        viewportHeight,
    ]);
    const handleLayout = useCallback(
        (event) => {
            stackHeightRef.current = event.nativeEvent.layout.height;
            notifyLocationAnchorLayout();
        },
        [notifyLocationAnchorLayout],
    );

    useEffect(() => {
        notifyLocationAnchorLayout();
    }, [notifyLocationAnchorLayout]);

    return (
        <View
            accessibilityElementsHidden={isHidden}
            className={`${isHidden ? 'opacity-0' : 'opacity-100'} items-center px-3`}
            importantForAccessibility={
                isHidden ? 'no-hide-descendants' : 'auto'
            }
            onLayout={handleLayout}
            pointerEvents="none"
            style={{ paddingBottom: CURRENT_ROAD_PILL_BOTTOM_GAP }}
            testID={testID}
        >
            <View
                className="self-stretch"
                style={{ height: puckTargetSlotHeight }}
                testID="driving-location-puck-layout-slot"
            >
                {showsSpacingGuides && debugPuckGapIsVisible ? (
                    <RoadPillSpacingGuide
                        distance={puckTargetGap}
                        label="to puck target"
                    />
                ) : null}
            </View>

            {currentRoadIsVisible ? (
                <CurrentRoadPill
                    className="max-w-full"
                    compact={currentRoadPillIsCompact}
                    debugOutlineIsVisible={debugRoadPillOutlineIsVisible}
                    isDarkMode={currentRoadPillIsDarkMode}
                    roadText={currentRoadText}
                    style={currentRoadPillStyle}
                    testID={currentRoadPillTestID}
                    textStyle={currentRoadPillTextStyle}
                    userLocation={userLocation}
                />
            ) : null}
            {showsSpacingGuides ? (
                <RoadPillSpacingGuide
                    distance={CURRENT_ROAD_PILL_BOTTOM_GAP}
                    label={
                        bottomEdgeIsDirectionsSheet
                            ? 'to sheet edge'
                            : 'to safe edge'
                    }
                />
            ) : null}
        </View>
    );
}
