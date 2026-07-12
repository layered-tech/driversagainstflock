import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { getDafTheme } from '../design-system/tokens';
import { logMapDrivingStopped } from './analytics';
import { getDirections } from './api';
import { DEBUG_OVERLAY_DIRECTIONS_GEOMETRY } from './debug-overlays';
import {
    createCurrentLocationDirectionsWaypoint,
    getActiveDirectionsManeuver,
    getDirectionsRouteBounds,
    getDirectionsRouteProgress,
    getDirectionsWaypointApiCoord,
    getDirectionsWaypointCoordinate,
    getNextDirectionsManeuver,
    getSelectedDirectionsRouteKey,
    getSelectedDirectionsRouteOption,
    selectDirectionsRoute,
} from './directions';
import { DrivingAlertsOverlay } from './driving-alerts-overlay';
import {
    DestinationCard,
    ManeuverCard,
    ReroutingCard,
} from './driving-guidance-cards';
import { DrivingLocationRoadStack } from './driving-location-road-stack';
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

const DRIVING_REROUTE_CONFIRMATION_MS = 2000;
const DRIVING_REROUTE_COOLDOWN_MS = 8000;
const DRIVING_REROUTE_DISTANCE_THRESHOLD_METERS = 45;
const DRIVING_REROUTE_GRACE_PERIOD_MS = 3000;

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

export function DrivingGuidanceOverlay({ children, onLocationAnchorLayout }) {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const offRouteDetectedAtRef = useRef(null);
    const rerouteAbortControllerRef = useRef(null);
    const lastRerouteAtRef = useRef(0);
    const [rerouteIsLoading, setRerouteIsLoading] = useState(false);
    const {
        debugOverlayVisibility,
        directionsRoute,
        setDirectionsRoute,
        setDrivingModeIsActive,
        setPendingDirectionsRequest,
        setPendingSearchResultRestore,
        upcomingAlerts,
    } = useSharedMapState();
    const { userLocation } = useSharedMapLocationState();
    const routeOption = getSelectedDirectionsRouteOption(directionsRoute);
    const routeProgress = useMemo(
        () => getDirectionsRouteProgress(directionsRoute, userLocation),
        [directionsRoute, userLocation],
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
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
        }),
        [bottomSheetTheme],
    );
    const speedLimit = useRouteSpeedLimit({
        routeIsActive: true,
        userLocation,
    });
    const handleCancelRoute = useCallback(() => {
        const searchResultRestore =
            createSearchResultRestoreFromRoute(directionsRoute);

        rerouteAbortControllerRef.current?.abort();
        rerouteAbortControllerRef.current = null;
        offRouteDetectedAtRef.current = null;
        setRerouteIsLoading(false);
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
    const handleReroute = useCallback(() => {
        if (rerouteAbortControllerRef.current) {
            return;
        }

        const destinationWaypoint = directionsRoute?.destination;
        const currentLocationWaypoint =
            createCurrentLocationDirectionsWaypoint(userLocation);
        const start = getDirectionsWaypointApiCoord(currentLocationWaypoint);
        const end = getDirectionsWaypointApiCoord(destinationWaypoint);

        if (
            !destinationWaypoint ||
            !currentLocationWaypoint ||
            !start ||
            !end
        ) {
            return;
        }

        const abortController = new AbortController();
        const selectedRouteKey = getSelectedDirectionsRouteKey(directionsRoute);
        const requestedAt = Date.now();

        rerouteAbortControllerRef.current = abortController;
        lastRerouteAtRef.current = requestedAt;
        setRerouteIsLoading(true);

        getDirections({
            end,
            showZone:
                debugOverlayVisibility?.[DEBUG_OVERLAY_DIRECTIONS_GEOMETRY] ===
                true,
            signal: abortController.signal,
            start,
            waypoints: (directionsRoute?.stopWaypoints ?? [])
                .map(getDirectionsWaypointApiCoord)
                .filter(Boolean),
        })
            .then(({ debugGeometry, exclusionZone, route }) => {
                if (rerouteAbortControllerRef.current !== abortController) {
                    return;
                }

                const selectedRoute = selectDirectionsRoute(
                    route,
                    selectedRouteKey,
                );
                const bounds =
                    selectedRoute?.bounds ??
                    getDirectionsRouteBounds(selectedRoute);

                setDirectionsRoute({
                    ...selectedRoute,
                    bounds,
                    debugGeometry,
                    destination: destinationWaypoint,
                    exclusionZone,
                    requestedAt,
                    start: currentLocationWaypoint,
                    stopWaypoints: directionsRoute?.stopWaypoints ?? [],
                });
            })
            .catch((error) => {
                if (error?.name !== 'AbortError') {
                    lastRerouteAtRef.current = 0;
                }
            })
            .finally(() => {
                if (rerouteAbortControllerRef.current === abortController) {
                    rerouteAbortControllerRef.current = null;
                }

                setRerouteIsLoading(false);
            });
    }, [
        debugOverlayVisibility,
        directionsRoute,
        setDirectionsRoute,
        userLocation,
    ]);

    useEffect(
        () => () => {
            rerouteAbortControllerRef.current?.abort();
            rerouteAbortControllerRef.current = null;
        },
        [],
    );

    useEffect(() => {
        if (routeIsActive) {
            return;
        }

        rerouteAbortControllerRef.current?.abort();
        rerouteAbortControllerRef.current = null;
        offRouteDetectedAtRef.current = null;
        setRerouteIsLoading(false);
    }, [routeIsActive]);

    useEffect(() => {
        if (
            !routeIsActive ||
            !routeProgress ||
            rerouteAbortControllerRef.current
        ) {
            offRouteDetectedAtRef.current = null;
            return;
        }

        const routeRequestedAt = directionsRoute?.requestedAt ?? 0;
        const now = Date.now();

        if (
            now - routeRequestedAt < DRIVING_REROUTE_GRACE_PERIOD_MS ||
            now - lastRerouteAtRef.current < DRIVING_REROUTE_COOLDOWN_MS
        ) {
            offRouteDetectedAtRef.current = null;
            return;
        }

        if (
            routeProgress.distanceFromRoute <
            DRIVING_REROUTE_DISTANCE_THRESHOLD_METERS
        ) {
            offRouteDetectedAtRef.current = null;
            return;
        }

        if (!offRouteDetectedAtRef.current) {
            offRouteDetectedAtRef.current = now;
            return;
        }

        if (
            now - offRouteDetectedAtRef.current <
            DRIVING_REROUTE_CONFIRMATION_MS
        ) {
            return;
        }

        offRouteDetectedAtRef.current = null;
        handleReroute();
    }, [directionsRoute, handleReroute, routeIsActive, routeProgress]);

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
                </View>

                <View
                    className={`${headerCardIsVisible ? 'pt-3' : ''} flex-row items-start gap-3 px-3`}
                    pointerEvents="box-none"
                >
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
                    <View className="flex-1" pointerEvents="none" />
                    <View className="items-end" pointerEvents="box-none">
                        {children}
                    </View>
                </View>

                <View className="flex-1" pointerEvents="none" />

                <DrivingAlertsOverlay
                    alerts={upcomingAlerts}
                    bottomInset={insets.bottom}
                    routeIsActive={routeIsActive}
                />

                <DrivingLocationRoadStack
                    onLocationAnchorLayout={onLocationAnchorLayout}
                    userLocation={userLocation}
                />

                {routeIsActive ? (
                    <View
                        className="overflow-hidden shadow-[0px_-10px_28px_rgba(11,14,18,0.16)]"
                        pointerEvents="box-none"
                        style={destinationSurfaceStyle}
                    >
                        <DestinationCard
                            bottomInset={insets.bottom}
                            directionsRoute={directionsRoute}
                            onCancelRoute={handleCancelRoute}
                            routeOption={routeOption}
                        />
                    </View>
                ) : (
                    <View style={{ height: insets.bottom }} />
                )}
            </NativeWindSafeAreaView>
        </View>
    );
}
