import { DuoText as Text } from '../design-system/duo-typography';
import { useEffect } from 'react';
import { Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { DafButton } from '../design-system/primitives';
import { getAvoidableRouteCameraCount } from '../scorecard/scorecard-engine';
import { getAdvancedRouteSettings } from './advanced-route-settings';
import { AdvancedRouteSettings } from './advanced-route-settings-controls';
import {
    DIRECTIONS_ROUTE_FASTEST,
    DIRECTIONS_ROUTE_PRIVATE,
    formatDirectionsDuration,
    getDirectionsRouteOptions,
    getSelectedDirectionsRouteKey,
} from './directions';
import { useDirectionsRouteContext } from './map-screen-context';
import {
    NativeWindBottomSheetModal,
    NativeWindBottomSheetScrollView,
} from './native-components';
import { RouteOptionCard } from './route-option-card';
import { useBottomSheetPresentedState } from './use-bottom-sheet-presented-state';

export function DirectionsRouteSheet() {
    const { width } = useWindowDimensions();
    const tablet = Platform?.isPad && width >= 768;
    const {
        bottomSheetBackgroundStyle,
        bottomSheetHandleIndicatorStyle,
        bottomSheetAnimatedPosition,
        directionsRoute,
        directionsRouteSheetHasMountedRef,
        directionsRouteSheetRef,
        directionsRouteSheetSnapPoints,
        directionsRouteSheetTrackingHandlers,
        directionsRouteError,
        directionsRouteIsLoading,
        handleDirectionsModeDismiss,
        handleDirectionsAdvancedSettingsApply,
        handleDirectionsRouteSelect,
        handleRouteExportPress,
        handleStartDriving,
        insets,
        mapPreferencesAreLoaded,
        routeExportIsAvailable,
    } = useDirectionsRouteContext();
    const {
        bottomSheetIsPresented,
        handleBottomSheetChange,
        handleBottomSheetDismiss,
    } = useBottomSheetPresentedState({
        onChange: directionsRouteSheetTrackingHandlers.onChange,
        onDismiss: directionsRouteSheetTrackingHandlers.onDismiss,
    });
    const appliedAdvancedSettings = getAdvancedRouteSettings(directionsRoute);
    useEffect(
        () => () => {
            directionsRouteSheetHasMountedRef.current = false;
        },
        [directionsRouteSheetHasMountedRef],
    );
    useEffect(() => {
        if (!mapPreferencesAreLoaded || !directionsRoute) {
            directionsRouteSheetRef.current?.dismiss();
            return undefined;
        }

        let retry = null;
        const presentRouteSheet = () => {
            const routeSheet = directionsRouteSheetRef.current;

            if (!routeSheet) {
                return false;
            }

            routeSheet.present();

            return true;
        };
        const frame = requestAnimationFrame(() => {
            if (!presentRouteSheet()) {
                retry = setTimeout(presentRouteSheet, 300);
            }
        });

        return () => {
            cancelAnimationFrame(frame);

            if (retry !== null) {
                clearTimeout(retry);
            }
        };
    }, [directionsRoute, directionsRouteSheetRef, mapPreferencesAreLoaded]);

    if (!mapPreferencesAreLoaded) {
        return null;
    }

    const routeOptions = getDirectionsRouteOptions(directionsRoute);
    const selectedRouteKey = getSelectedDirectionsRouteKey(directionsRoute);
    const directRoute = routeOptions.find(
        (routeOption) => routeOption.routeKey === DIRECTIONS_ROUTE_FASTEST,
    );
    const privateRoute = routeOptions.find(
        (routeOption) => routeOption.routeKey === DIRECTIONS_ROUTE_PRIVATE,
    );
    const contentGap = 12;
    const topContentPadding = 4;
    const bottomContentPadding = Math.max(insets.bottom + 12, 20);
    const routeCount = routeOptions.length;
    const skippedCameraCount = getAvoidableRouteCameraCount(
        directionsRoute,
        DIRECTIONS_ROUTE_PRIVATE,
    );
    const privateAvoidsCameras = skippedCameraCount > 0;
    const routeSubtitle = `${routeCount} ${
        routeCount === 1 ? 'route' : 'routes'
    } - ${privateAvoidsCameras ? 1 : 0} avoids cameras`;
    const privateAddsDuration =
        privateRoute && directRoute
            ? formatDirectionsDuration(
                  Math.max(
                      0,
                      (privateRoute.duration ?? 0) -
                          (directRoute.duration ?? 0),
                  ),
              )
            : '';

    return (
        <NativeWindBottomSheetModal
            nativeCloseAction={false}
            ref={directionsRouteSheetRef}
            accessible={false}
            index={0}
            snapPoints={directionsRouteSheetSnapPoints}
            // Dynamic sizing gives a single content-fit detent (no fixed snap points),
            // so the sheet cannot be dragged open further; panning + pan-down-to-close
            // let the user drag it down to dismiss (mirrors the back arrow).
            enableDynamicSizing
            enableOverDrag={false}
            enablePanDownToClose
            backgroundStyle={bottomSheetBackgroundStyle}
            handleIndicatorStyle={bottomSheetHandleIndicatorStyle}
            animatedPosition={bottomSheetAnimatedPosition}
            onAnimate={directionsRouteSheetTrackingHandlers.onAnimate}
            onChange={handleBottomSheetChange}
            onDismiss={handleBottomSheetDismiss}
        >
            {directionsRoute ? (
                <NativeWindBottomSheetScrollView
                    className="bg-white dark:bg-daf-surface-dark"
                    testID={
                        bottomSheetIsPresented
                            ? 'directions-route-sheet-presented'
                            : undefined
                    }
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        gap: contentGap,
                        paddingBottom: bottomContentPadding,
                        paddingHorizontal: 16,
                        paddingTop: topContentPadding,
                    }}
                >
                    <View className="flex-row items-start gap-3">
                        <View className="min-w-0 flex-1 gap-1">
                            <Text className="font-dafDisplay text-[21px] font-bold text-daf-text-primary dark:text-white">
                                Choose your route
                            </Text>
                            <Text className="text-[13px] font-medium text-daf-text-secondary dark:text-neutral-300">
                                {routeSubtitle}
                            </Text>
                        </View>
                        {tablet ? (
                            <Pressable
                                accessibilityLabel="Back from route choices"
                                accessibilityRole="button"
                                className="h-10 w-10 items-center justify-center rounded-dafPill bg-daf-surface-alt active:opacity-70 dark:bg-daf-surface-inverse"
                                onPress={handleDirectionsModeDismiss}
                                testID="tablet-route-choices-close-button"
                            >
                                <Icon name="x" size={20} />
                            </Pressable>
                        ) : null}
                    </View>

                    {routeOptions.length > 0 ? (
                        <View className="gap-2">
                            <View className="gap-2">
                                {routeOptions.map((routeOption) => (
                                    <RouteOptionCard
                                        key={routeOption.routeKey}
                                        directRoute={directRoute}
                                        fastestRouteNodeCount={
                                            directionsRoute?.fastestRouteNodeCount ??
                                            0
                                        }
                                        onPress={() =>
                                            handleDirectionsRouteSelect(
                                                routeOption.routeKey,
                                            )
                                        }
                                        routeOption={routeOption}
                                        selected={
                                            routeOption.routeKey ===
                                            selectedRouteKey
                                        }
                                    />
                                ))}
                            </View>
                        </View>
                    ) : null}

                    <AdvancedRouteSettings
                        settings={appliedAdvancedSettings}
                        onApply={handleDirectionsAdvancedSettingsApply}
                        loading={directionsRouteIsLoading}
                        error={directionsRouteError}
                    />

                    <View className="flex-row items-center gap-2">
                        <Icon color="#FFB02E" name="triangle-alert" size={15} />
                        <Text className="min-w-0 flex-1 text-xs font-medium text-daf-text-secondary dark:text-neutral-300">
                            Private adds{' '}
                            <Text className="font-bold text-daf-text-primary dark:text-white">
                                {privateAddsDuration || 'a few minutes'}
                            </Text>{' '}
                            to skip {skippedCameraCount} monitored points
                        </Text>
                    </View>

                    {routeExportIsAvailable ? (
                        <DafButton
                            accessibilityLabel="Export route as GPX or KML text"
                            icon="download"
                            onPress={handleRouteExportPress}
                            testID="directions-route-export-button"
                            variant="secondary"
                        >
                            Export route
                        </DafButton>
                    ) : null}

                    <DafButton
                        accessibilityLabel="Start driving"
                        disabled={directionsRouteIsLoading}
                        icon="navigation"
                        onPress={handleStartDriving}
                        size="lg"
                        testID="directions-route-start-driving-button"
                    >
                        Start drive
                    </DafButton>
                </NativeWindBottomSheetScrollView>
            ) : null}
        </NativeWindBottomSheetModal>
    );
}
