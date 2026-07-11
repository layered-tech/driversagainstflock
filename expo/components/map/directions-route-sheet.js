import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Text, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { DafButton } from '../design-system/primitives';
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

export function DirectionsRouteSheet() {
    const {
        bottomSheetBackgroundStyle,
        bottomSheetHandleIndicatorStyle,
        bottomSheetAnimatedPosition,
        directionsRoute,
        directionsRouteSheetRef,
        directionsRouteSheetSnapPoints,
        directionsRouteSheetTrackingHandlers,
        handleDirectionsRouteSelect,
        handleStartDriving,
        insets,
        mapPreferencesAreLoaded,
    } = useDirectionsRouteContext();

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
            onChange={directionsRouteSheetTrackingHandlers.onChange}
            onDismiss={directionsRouteSheetTrackingHandlers.onDismiss}
        >
            <NativeWindBottomSheetView className="dark:bg-daf-surface-dark bg-white">
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
