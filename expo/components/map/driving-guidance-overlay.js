import { useCallback, useMemo, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { getDafTheme } from '../design-system/tokens';
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
import {
    DestinationCard,
    ManeuverCard,
    ReroutingCard,
} from './driving-guidance-cards';
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
    children,
    drivingStatusIsVisible = true,
    navigationPuckSize,
    onLocationAnchorLayout,
    onRouteExport,
    routeExportIsAvailable,
    topOverlay = null,
}) {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
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
    const bottomSheetTheme = getDafTheme(colorScheme);
    const destinationSurfaceStyle = useMemo(
        () => ({
            backgroundColor: bottomSheetTheme.surface.sheet,
            borderTopColor: bottomSheetTheme.border.glass,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderTopWidth: 1,
        }),
        [bottomSheetTheme],
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
        <View className="absolute inset-0 z-50" pointerEvents="box-none">
            <NativeWindSafeAreaView
                className="absolute inset-0"
                edges={['top', 'right', 'left']}
                pointerEvents="box-none"
            >
                <View className="px-3 pt-3" pointerEvents="box-none">
                    {routeIsActive ? (
                        rerouteIsLoading ? (
                            <ReroutingCard />
                        ) : (
                            <ManeuverCard
                                maneuver={maneuver}
                                nextManeuver={nextManeuver}
                            />
                        )
                    ) : null}
                    {topOverlay}
                </View>

                <View
                    className={`${headerCardIsVisible || topOverlay ? 'pt-3' : ''} flex-row items-start gap-3 px-3`}
                    pointerEvents="box-none"
                >
                    {drivingStatusIsVisible ? (
                        <View pointerEvents="box-none">
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
                    ) : null}
                    <View className="flex-1" pointerEvents="none" />
                    <View className="items-end" pointerEvents="box-none">
                        {children}
                    </View>
                </View>

                <View className="flex-1" pointerEvents="none" />

                <DrivingLocationRoadStack
                    currentRoadPillIsVisible={drivingStatusIsVisible}
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

                {routeIsActive ? (
                    <View
                        className="overflow-hidden"
                        pointerEvents="box-none"
                        style={destinationSurfaceStyle}
                    >
                        <DestinationCard
                            bottomInset={insets.bottom}
                            directionsRoute={directionsRoute}
                            onCancelRoute={handleCancelRoute}
                            onExportRoute={onRouteExport}
                            routeExportIsAvailable={routeExportIsAvailable}
                            routeOption={routeOption}
                            remainingValues={getRemainingDirectionsRouteValues(
                                directionsRoute,
                                userLocation,
                                routeProgress,
                            )}
                        />
                    </View>
                ) : (
                    <View style={{ height: insets.bottom }} />
                )}
            </NativeWindSafeAreaView>
        </View>
    );
}
