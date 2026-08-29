import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Icon } from '../design-system/icon';
import {
    DafButton,
    DafIconButton,
    DafTextInput,
} from '../design-system/primitives';
import {
    AVOID_BUFFER_STEP_METERS,
    getAdvancedRouteSettings,
    MAX_AVOID_BUFFER_METERS,
    MIN_AVOID_BUFFER_METERS,
    normalizeAdvancedRouteSettings,
} from './advanced-route-settings';
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
    NativeWindBottomSheetView,
} from './native-components';
import { RouteOptionCard } from './route-option-card';
import { useBottomSheetPresentedState } from './use-bottom-sheet-presented-state';

export function DirectionsRouteSheet() {
    const {
        bottomSheetBackgroundStyle,
        bottomSheetHandleIndicatorStyle,
        bottomSheetAnimatedPosition,
        directionsRoute,
        directionsRouteSheetRef,
        directionsRouteSheetSnapPoints,
        directionsRouteSheetTrackingHandlers,
        directionsRouteError,
        directionsRouteIsLoading,
        handleDirectionsAdvancedSettingsApply,
        handleDirectionsRouteSelect,
        handleStartDriving,
        insets,
        mapPreferencesAreLoaded,
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
    const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
    const [allowAlprNearStartDestination, setAllowAlprNearStartDestination] =
        useState(appliedAdvancedSettings.allowAlprNearStartDestination);
    const [avoidBufferInput, setAvoidBufferInput] = useState(
        String(appliedAdvancedSettings.avoidBufferMeters),
    );

    useEffect(() => {
        setAllowAlprNearStartDestination(
            appliedAdvancedSettings.allowAlprNearStartDestination,
        );
        setAvoidBufferInput(String(appliedAdvancedSettings.avoidBufferMeters));
    }, [
        appliedAdvancedSettings.allowAlprNearStartDestination,
        appliedAdvancedSettings.avoidBufferMeters,
    ]);

    useEffect(() => {
        if (!mapPreferencesAreLoaded || !directionsRoute) {
            return undefined;
        }

        const presentRouteSheet = () => {
            directionsRouteSheetRef.current?.present();
        };
        const frame = requestAnimationFrame(presentRouteSheet);
        const retry = setTimeout(presentRouteSheet, 300);

        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(retry);
        };
    }, [directionsRoute, directionsRouteSheetRef, mapPreferencesAreLoaded]);

    useEffect(() => {
        if (!mapPreferencesAreLoaded || !directionsRoute) {
            return undefined;
        }

        const presentRouteSheet = () => {
            directionsRouteSheetRef.current?.present();
        };
        const frame = requestAnimationFrame(presentRouteSheet);
        const retry = setTimeout(presentRouteSheet, 300);

        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(retry);
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
    const privateAvoidsCameras =
        privateRoute && (privateRoute.nodeCount ?? 0) === 0;
    const routeSubtitle = `${routeCount} ${
        routeCount === 1 ? 'route' : 'routes'
    } - ${privateAvoidsCameras ? 1 : 0} avoids cameras`;
    const skippedCameraCount = Math.max(
        0,
        (directRoute?.nodeCount ??
            directionsRoute?.fastestRouteNodeCount ??
            0) - (privateRoute?.nodeCount ?? 0),
    );
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
    const adjustAvoidBuffer = (stepCount) => {
        const settings = normalizeAdvancedRouteSettings({
            allowAlprNearStartDestination,
            avoidBufferMeters:
                Number(avoidBufferInput) + stepCount * AVOID_BUFFER_STEP_METERS,
        });

        setAvoidBufferInput(String(settings.avoidBufferMeters));
    };
    const applyAdvancedSettings = () => {
        const settings = normalizeAdvancedRouteSettings({
            allowAlprNearStartDestination,
            avoidBufferMeters: avoidBufferInput,
        });

        setAvoidBufferInput(String(settings.avoidBufferMeters));
        handleDirectionsAdvancedSettingsApply(settings);
    };

    return (
        <NativeWindBottomSheetModal
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
            <NativeWindBottomSheetView
                className="dark:bg-daf-surface-dark bg-white"
                testID={
                    bottomSheetIsPresented
                        ? 'directions-route-sheet-presented'
                        : undefined
                }
            >
                {directionsRoute ? (
                    <BottomSheetScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{
                            gap: contentGap,
                            paddingBottom: bottomContentPadding,
                            paddingHorizontal: 16,
                            paddingTop: topContentPadding,
                        }}
                    >
                        <View className="gap-1">
                            <Text className="font-dafDisplay text-[21px] font-bold text-daf-text-primary dark:text-white">
                                Choose your route
                            </Text>
                            <Text className="text-[13px] font-medium text-daf-text-secondary dark:text-neutral-300">
                                {routeSubtitle}
                            </Text>
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

                        <View className="dark:border-daf-border-dark overflow-hidden rounded-dafSm border border-daf-border bg-daf-surface-alt dark:bg-daf-surface-inverse">
                            <Pressable
                                accessibilityRole="button"
                                accessibilityState={{
                                    expanded: advancedSettingsOpen,
                                }}
                                className="min-h-hitComfy flex-row items-center gap-2 px-3 active:opacity-[0.82]"
                                onPress={() =>
                                    setAdvancedSettingsOpen(
                                        (currentValue) => !currentValue,
                                    )
                                }
                                testID="directions-route-advanced-settings-toggle"
                            >
                                <Icon
                                    color="#828D9B"
                                    name="sliders-horizontal"
                                    size={16}
                                />
                                <Text className="min-w-0 flex-1 text-[14px] font-semibold text-daf-text-primary dark:text-white">
                                    Advanced settings
                                </Text>
                                <Text className="font-dafMono text-xs font-semibold text-daf-text-tertiary dark:text-neutral-400">
                                    {appliedAdvancedSettings.avoidBufferMeters}{' '}
                                    m
                                </Text>
                                <Icon
                                    color="#828D9B"
                                    name="chevron-down"
                                    size={16}
                                />
                            </Pressable>

                            {advancedSettingsOpen ? (
                                <View className="dark:border-daf-border-dark gap-3 border-t border-daf-border px-3 py-3">
                                    <View className="min-h-11 flex-row items-center gap-3">
                                        <Text className="min-w-0 flex-1 text-[14px] font-medium leading-5 text-daf-text-primary dark:text-white">
                                            Allow ALPR near start & destination
                                        </Text>
                                        <Switch
                                            accessibilityLabel="Allow ALPR near start and destination"
                                            className="shrink-0"
                                            disabled={directionsRouteIsLoading}
                                            onValueChange={
                                                setAllowAlprNearStartDestination
                                            }
                                            thumbColor="#ffffff"
                                            trackColor={{
                                                false: '#D4D9DF',
                                                true: '#1FBF6B',
                                            }}
                                            value={
                                                allowAlprNearStartDestination
                                            }
                                            testID="directions-route-allow-alpr-switch"
                                        />
                                    </View>

                                    <View className="gap-2">
                                        <View className="flex-row items-end justify-between gap-3">
                                            <Text className="text-[14px] font-medium text-daf-text-primary dark:text-white">
                                                Avoid cameras by
                                            </Text>
                                            <Text className="font-dafMono text-xs text-daf-text-secondary dark:text-neutral-300">
                                                {MIN_AVOID_BUFFER_METERS}–
                                                {MAX_AVOID_BUFFER_METERS} m
                                            </Text>
                                        </View>
                                        <View className="flex-row items-center gap-2">
                                            <DafIconButton
                                                accessibilityLabel={`Decrease avoid distance by ${AVOID_BUFFER_STEP_METERS} meters`}
                                                disabled={
                                                    directionsRouteIsLoading
                                                }
                                                icon="minus"
                                                onPress={() =>
                                                    adjustAvoidBuffer(-1)
                                                }
                                                size="sm"
                                                testID="directions-route-avoid-distance-decrease"
                                            />
                                            <DafTextInput
                                                accessibilityLabel="Avoid distance in meters"
                                                className="font-dafMono flex-1 text-center"
                                                editable={
                                                    !directionsRouteIsLoading
                                                }
                                                keyboardType="number-pad"
                                                maxLength={4}
                                                onChangeText={(value) =>
                                                    setAvoidBufferInput(
                                                        value.replace(
                                                            /[^0-9]/g,
                                                            '',
                                                        ),
                                                    )
                                                }
                                                testID="directions-route-avoid-distance-input"
                                                value={avoidBufferInput}
                                            />
                                            <DafIconButton
                                                accessibilityLabel={`Increase avoid distance by ${AVOID_BUFFER_STEP_METERS} meters`}
                                                disabled={
                                                    directionsRouteIsLoading
                                                }
                                                icon="plus"
                                                onPress={() =>
                                                    adjustAvoidBuffer(1)
                                                }
                                                size="sm"
                                                testID="directions-route-avoid-distance-increase"
                                            />
                                        </View>
                                    </View>

                                    {directionsRouteError ? (
                                        <Text className="text-xs font-medium text-daf-alert">
                                            {directionsRouteError}
                                        </Text>
                                    ) : null}

                                    <DafButton
                                        accessibilityLabel="Apply advanced settings and recalculate route"
                                        disabled={directionsRouteIsLoading}
                                        loading={directionsRouteIsLoading}
                                        onPress={applyAdvancedSettings}
                                        testID="directions-route-advanced-settings-apply"
                                        variant="secondary"
                                    >
                                        Apply & recalculate
                                    </DafButton>
                                </View>
                            ) : null}
                        </View>

                        <View className="flex-row items-center gap-2">
                            <Icon
                                color="#FFB02E"
                                name="triangle-alert"
                                size={15}
                            />
                            <Text className="min-w-0 flex-1 text-xs font-medium text-daf-text-secondary dark:text-neutral-300">
                                Private adds{' '}
                                <Text className="font-bold text-daf-text-primary dark:text-white">
                                    {privateAddsDuration || 'a few minutes'}
                                </Text>{' '}
                                to skip {skippedCameraCount} monitored points
                            </Text>
                        </View>

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
                    </BottomSheetScrollView>
                ) : null}
            </NativeWindBottomSheetView>
        </NativeWindBottomSheetModal>
    );
}
