import { useCallback, useMemo, useRef, useState } from 'react';
import { useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { logMapDrivingStopped } from './analytics';
import {
    createDirectionsRouteProgressTracker,
    getActiveDirectionsManeuver,
    getDirectionsWaypointCoordinate,
    getNextDirectionsManeuver,
    getRemainingDirectionsRouteValues,
    getSelectedDirectionsRouteOption,
} from './directions';
import {
    cancelSharedNavigationRerouting,
    useSharedNavigationRerouting,
} from './shared-navigation-controller';
import { DrivingAlertsOverlay } from './driving-alerts-overlay';
import { ManeuverCard, ReroutingCard } from './driving-guidance-cards';
import { DrivingStepsSheet } from './driving-steps-sheet';
import { DrivingLocationRoadStack } from './driving-location-road-stack';
import { useE2EDrivingAlertsFixture } from './e2e-driving-alert-fixture';
import { NativeWindSafeAreaView } from './native-components';
import {
    useSharedMapLocationState,
    useSharedMapState,
} from './shared-map-state';
import {
    getRouteCurrentSpeedMps,
    SpeedLimitSign,
    useRouteSpeedLimit,
} from './speed-limit';
import { MOBILE_SPEED_LIMIT_BADGE_SIZE } from './speed-limit-layout';

function createSearchResultRestoreFromRoute(route) {
    const destination = route?.destination;
    const result = destination?.result;
    const place = destination?.place;
    const placeId =
        result?.placeId ||
        destination?.placeId ||
        place?.id ||
        result?.id ||
        destination?.id;
    const label =
        result?.label ||
        destination?.label ||
        result?.primaryText ||
        destination?.inputValue;

    if (!placeId || !label) {
        return null;
    }

    const destinationCoordinate = getDirectionsWaypointCoordinate(destination);
    const fallbackPlace = destinationCoordinate
        ? {
              displayName: { text: label },
              formattedAddress: result?.address || destination?.subtitle || '',
              id: placeId,
              location: {
                  latitude: destinationCoordinate[1],
                  longitude: destinationCoordinate[0],
              },
              primaryTypeDisplayName: result?.typeLabel
                  ? { text: result.typeLabel }
                  : undefined,
          }
        : null;

    return {
        id: `${placeId}:${Date.now()}`,
        place: place ?? fallbackPlace,
        result: {
            address: result?.address || destination?.subtitle || '',
            id: result?.id || placeId,
            label,
            placeId,
            primaryText: result?.primaryText || destination?.label || label,
            secondaryText: result?.secondaryText || destination?.subtitle || '',
            typeLabel: result?.typeLabel || '',
        },
    };
}

export function DrivingGuidanceOverlay({
    cameraIsFollowingUser = true,
    children,
    drivingStatusIsVisible = true,
    navigationPuckSize,
    onLocationAnchorLayout,
    onRouteExport,
    onStepFocus,
    routeExportIsAvailable,
    topOverlay = null,
}) {
    const colorScheme = useColorScheme();
    const statusChromeIsVisible =
        drivingStatusIsVisible && cameraIsFollowingUser;
    const insets = useSafeAreaInsets();
    const stepsSheetRef = useRef(null);
    const { height: windowHeight } = useWindowDimensions();
    const [containerHeight, setContainerHeight] = useState(windowHeight);
    const [collapsedHeight, setCollapsedHeight] = useState(156 + insets.bottom);
    const [guidanceHeight, setGuidanceHeight] = useState(88);
    const handleStepFocus = useCallback(
        (coordinate) => {
            stepsSheetRef.current?.snapToIndex(0);
            return onStepFocus(coordinate, {
                padding: {
                    paddingTop: insets.top + guidanceHeight + 12,
                    paddingBottom: collapsedHeight + 12,
                    paddingLeft: insets.left + 12,
                    paddingRight: insets.right + 12,
                },
            });
        },
        [
            collapsedHeight,
            guidanceHeight,
            insets.top,
            insets.left,
            insets.right,
            onStepFocus,
        ],
    );
    const rerouteIsLoading = useSharedNavigationRerouting();
    const [routeProgressTracker] = useState(
        createDirectionsRouteProgressTracker,
    );
    const {
        directionsRoute,
        setDirectionsRoute,
        setDrivingModeIsActive,
        setPendingDirectionsRequest,
        setPendingSearchResultRestore,
        upcomingAlerts,
    } = useSharedMapState();
    const { userLocation } = useSharedMapLocationState();
    const e2eDrivingAlertsFixture = useE2EDrivingAlertsFixture();
    const routeOption = getSelectedDirectionsRouteOption(directionsRoute);
    const routeProgress = useMemo(
        () => routeProgressTracker.update(directionsRoute, userLocation),
        [directionsRoute, routeProgressTracker, userLocation],
    );
    const maneuver = useMemo(
        () =>
            getActiveDirectionsManeuver(
                directionsRoute,
                userLocation,
                routeProgress,
            ),
        [directionsRoute, routeProgress, userLocation],
    );
    const nextManeuver = useMemo(
        () =>
            getNextDirectionsManeuver(
                directionsRoute,
                userLocation,
                routeProgress,
            ),
        [directionsRoute, routeProgress, userLocation],
    );
    const routeIsActive = Boolean(directionsRoute && routeOption);
    const headerCardIsVisible = Boolean(
        routeIsActive && (rerouteIsLoading || maneuver),
    );
    const speedLimit = useRouteSpeedLimit({
        routeIsActive: true,
        userLocation,
    });
    const handleCancelRoute = useCallback(() => {
        cancelSharedNavigationRerouting();
        const searchResultRestore =
            createSearchResultRestoreFromRoute(directionsRoute);

        setPendingSearchResultRestore?.(
            searchResultRestore ?? {
                id: `route-cleared:${Date.now()}`,
                place: null,
                result: null,
            },
        );
        logMapDrivingStopped({ route: directionsRoute });
        setDirectionsRoute(null);
        setDrivingModeIsActive(false);
        setPendingDirectionsRequest?.(null);
    }, [
        directionsRoute,
        setDirectionsRoute,
        setDrivingModeIsActive,
        setPendingDirectionsRequest,
        setPendingSearchResultRestore,
    ]);
    return (
        <View
            className="absolute inset-0 z-50"
            onLayout={(event) =>
                setContainerHeight(event.nativeEvent.layout.height)
            }
            pointerEvents="box-none"
        >
            <NativeWindSafeAreaView
                className="absolute inset-0"
                edges={['top', 'right', 'left']}
                pointerEvents="box-none"
            >
                <View
                    className="px-3 pt-3"
                    onLayout={(event) =>
                        setGuidanceHeight(event.nativeEvent.layout.height)
                    }
                    pointerEvents="box-none"
                >
                    {routeIsActive ? (
                        rerouteIsLoading ? (
                            <ReroutingCard />
                        ) : (
                            <ManeuverCard
                                directionsRoute={directionsRoute}
                                maneuver={maneuver}
                                nextManeuver={nextManeuver}
                                onStepFocus={handleStepFocus}
                            />
                        )
                    ) : null}
                    {topOverlay}
                </View>

                <View
                    className={`${headerCardIsVisible || topOverlay ? 'pt-3' : ''} flex-row items-start gap-3 px-3`}
                    pointerEvents="box-none"
                >
                    <View
                        accessibilityElementsHidden={!statusChromeIsVisible}
                        className={
                            statusChromeIsVisible ? 'opacity-100' : 'opacity-0'
                        }
                        importantForAccessibility={
                            statusChromeIsVisible
                                ? 'auto'
                                : 'no-hide-descendants'
                        }
                        pointerEvents="none"
                        testID="driving-speed-status"
                    >
                        <SpeedLimitSign
                            currentSpeedMps={getRouteCurrentSpeedMps(
                                userLocation,
                            )}
                            currentSpeedPlacement="bottom-right"
                            currentSpeedVisible
                            isDarkMode={colorScheme === 'dark'}
                            size={MOBILE_SPEED_LIMIT_BADGE_SIZE}
                            speedLimit={speedLimit}
                        />
                    </View>
                    <View className="flex-1" pointerEvents="none" />
                    <View className="items-end" pointerEvents="box-none">
                        {children}
                    </View>
                </View>

                <View className="flex-1" pointerEvents="none" />

                <DrivingLocationRoadStack
                    isHidden={!statusChromeIsVisible}
                    onLocationAnchorLayout={onLocationAnchorLayout}
                    puckSize={navigationPuckSize}
                    testID="driving-location-road-stack"
                    userLocation={userLocation}
                />

                <DrivingAlertsOverlay
                    alerts={e2eDrivingAlertsFixture ?? upcomingAlerts}
                    bottomInset={insets.bottom}
                    routeIsActive={routeIsActive}
                    unrestrictedFixture={e2eDrivingAlertsFixture !== null}
                />

                <View
                    pointerEvents="none"
                    style={{
                        height: routeIsActive ? collapsedHeight : insets.bottom,
                    }}
                />
            </NativeWindSafeAreaView>
            {routeIsActive ? (
                <DrivingStepsSheet
                    bottomInset={insets.bottom}
                    bottomSheetRef={stepsSheetRef}
                    collapsedHeight={collapsedHeight}
                    containerHeight={containerHeight}
                    directionsRoute={directionsRoute}
                    maneuver={maneuver}
                    onCollapsedHeightChange={setCollapsedHeight}
                    onCancelRoute={handleCancelRoute}
                    onExportRoute={onRouteExport}
                    onStepFocus={handleStepFocus}
                    routeExportIsAvailable={routeExportIsAvailable}
                    routeOption={routeOption}
                    remainingValues={getRemainingDirectionsRouteValues(
                        directionsRoute,
                        userLocation,
                        routeProgress,
                    )}
                />
            ) : null}
        </View>
    );
}
