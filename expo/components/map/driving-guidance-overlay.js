import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Platform,
    useColorScheme,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { useDuoDevice } from '../root/duo-device-context';
import { getDuoPaneLayout } from './duo-bottom-sheet-layout';
import { getTabletPaneLayout } from './responsive-map-layout';
import { logMapDrivingStopped } from './analytics';
import {
    createDirectionsRouteProgressTracker,
    getActiveDirectionsManeuver,
    getDirectionsStepHeading,
    getDirectionsSteps,
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
    onResumeGuidance,
    onStepFocus,
    routeExportIsAvailable,
    topOverlay = null,
}) {
    const colorScheme = useColorScheme();
    const [focusedStepIndex, setFocusedStepIndex] = useState(null);
    const statusChromeIsVisible =
        drivingStatusIsVisible &&
        cameraIsFollowingUser &&
        focusedStepIndex === null;

    useEffect(() => {
        if (cameraIsFollowingUser) {
            setFocusedStepIndex(null);
        }
    }, [cameraIsFollowingUser]);
    const insets = useSafeAreaInsets();
    const stepsSheetRef = useRef(null);
    const { height: windowHeight, width } = useWindowDimensions();
    const duo = useDuoDevice();
    const tabletPane = Platform?.isPad && getTabletPaneLayout(width, insets);
    const pane = tabletPane || (duo && getDuoPaneLayout(width, insets));
    const paneTop = insets.top + (tabletPane ? 32 : 14);
    const [containerHeight, setContainerHeight] = useState(windowHeight);
    const [collapsedHeight, setCollapsedHeight] = useState(156 + insets.bottom);
    const [guidanceHeight, setGuidanceHeight] = useState(88);
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
    const handleStepFocus = useCallback(
        (coordinate, stepIndex) => {
            const didFocus = onStepFocus(coordinate, {
                heading: getDirectionsStepHeading(directionsRoute, stepIndex),
                padding: {
                    paddingTop:
                        insets.top + (pane ? 14 : 0) + guidanceHeight + 12,
                    paddingBottom: pane
                        ? insets.bottom + 12
                        : collapsedHeight + 12,
                    paddingLeft: pane
                        ? pane.left + pane.width + 24
                        : insets.left + 12,
                    paddingRight: insets.right + 12,
                },
            });
            if (didFocus !== false) {
                setFocusedStepIndex(stepIndex);
                stepsSheetRef.current?.snapToIndex(0);
            }
            return didFocus;
        },
        [
            directionsRoute,
            collapsedHeight,
            guidanceHeight,
            insets.top,
            insets.left,
            insets.right,
            insets.bottom,
            pane?.left,
            pane?.width,
            onStepFocus,
        ],
    );
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
    useEffect(() => {
        setFocusedStepIndex(null);
    }, [directionsRoute]);
    const steps = useMemo(
        () => getDirectionsSteps(directionsRoute, maneuver),
        [directionsRoute, maneuver],
    );
    const focusedStepPosition = steps.findIndex(
        (step) => step.stepIndex === focusedStepIndex,
    );
    const focusedStep = steps[focusedStepPosition];
    const previousStep = steps
        .slice(0, focusedStepPosition)
        .findLast((step) => step.coordinate);
    const followingStep = steps
        .slice(focusedStepPosition + 1)
        .find((step) => step.coordinate);
    const focusStep = (step) => {
        if (step?.coordinate) {
            handleStepFocus(step.coordinate, step.stepIndex);
        }
    };
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
                edges={pane ? ['right'] : ['top', 'right', 'left']}
                style={
                    pane
                        ? {
                              left: pane.left + pane.width + 12,
                              top: paneTop,
                          }
                        : undefined
                }
                pointerEvents="box-none"
            >
                <View
                    className={pane ? 'px-3' : 'px-3 pt-3'}
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
                                maneuver={
                                    focusedStep
                                        ? {
                                              ...focusedStep,
                                              distanceToManeuver:
                                                  focusedStep.displayDistance,
                                          }
                                        : maneuver
                                }
                                nextManeuver={focusedStep ? null : nextManeuver}
                                isFocused={Boolean(focusedStep)}
                                onPreviousStep={
                                    previousStep
                                        ? () => focusStep(previousStep)
                                        : undefined
                                }
                                onNextStep={
                                    followingStep
                                        ? () => focusStep(followingStep)
                                        : undefined
                                }
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
                        height:
                            routeIsActive && !pane
                                ? collapsedHeight
                                : insets.bottom,
                    }}
                />
            </NativeWindSafeAreaView>
            {routeIsActive ? (
                <DrivingStepsSheet
                    bottomInset={pane ? 0 : insets.bottom}
                    pane={pane}
                    paneTop={paneTop}
                    paneMaxHeight={
                        containerHeight - paneTop - Math.max(insets.bottom, 14)
                    }
                    bottomSheetRef={stepsSheetRef}
                    collapsedHeight={collapsedHeight}
                    containerHeight={containerHeight}
                    directionsRoute={directionsRoute}
                    maneuver={maneuver}
                    onCollapsedHeightChange={setCollapsedHeight}
                    onCancelRoute={handleCancelRoute}
                    onResumeGuidance={
                        (duo || tabletPane) && focusedStep
                            ? () => {
                                  setFocusedStepIndex(null);
                                  onResumeGuidance?.();
                              }
                            : undefined
                    }
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
