import { Pressable, Text, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { dafSemanticColors } from '../design-system/tokens';
import {
    DIRECTIONS_ROUTE_FASTEST,
    formatDirectionsArrivalTime,
    formatDirectionsDistance,
    formatDirectionsDistanceDelta,
    formatDirectionsDuration,
    formatDirectionsDurationDelta,
} from './directions';

export function RouteOptionCard({
    directRoute,
    fastestRouteNodeCount,
    onPress,
    routeOption,
    selected,
}) {
    const isFastest = routeOption.routeKey === DIRECTIONS_ROUTE_FASTEST;
    const distanceLabel = formatDirectionsDistance(routeOption.distance);
    const durationLabel = formatDirectionsDuration(routeOption.duration);
    const arrivalLabel = formatDirectionsArrivalTime(routeOption.duration);
    const durationDelta =
        !isFastest && directRoute
            ? formatDirectionsDurationDelta(
                  (routeOption.duration ?? 0) - (directRoute.duration ?? 0),
              )
            : '';
    const distanceDelta =
        !isFastest && directRoute
            ? formatDirectionsDistanceDelta(
                  (routeOption.distance ?? 0) - (directRoute.distance ?? 0),
              )
            : '';
    const fastestNodeCount =
        routeOption.nodeCount ??
        fastestRouteNodeCount ??
        directRoute?.nodeCount ??
        0;
    const cameraCount = isFastest
        ? fastestNodeCount
        : (routeOption.nodeCount ?? 0);
    const cameraLabel =
        cameraCount === 0
            ? 'No cameras'
            : `${cameraCount} camera${cameraCount === 1 ? '' : 's'}`;
    const routeDeltaLabel = [durationDelta, distanceDelta]
        .filter(Boolean)
        .join(' / ');
    const icon = isFastest ? 'zap' : 'shield-check';
    const accentColor = isFastest
        ? dafSemanticColors.routeFast
        : dafSemanticColors.routePrivate;
    const iconColor = accentColor;
    const title = isFastest ? 'Fastest Route' : 'Private Route';
    const routeSwatchClassName = isFastest
        ? 'bg-daf-route-fast'
        : 'bg-daf-route-private';

    return (
        <Pressable
            accessibilityLabel={`${title}, ${durationLabel}, ${distanceLabel}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={`min-h-[76px] w-full flex-row items-center gap-3 rounded-dafMd border px-3 py-3 ${
                selected
                    ? isFastest
                        ? 'dark:bg-daf-surface-dark/95 border-daf-azure bg-white/90'
                        : 'dark:bg-daf-surface-dark/95 border-daf-brand bg-white/90'
                    : 'dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/90 border-daf-border-glass bg-white/80 active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse'
            }`}
            onPress={onPress}
            testID={`directions-route-option-${routeOption.routeKey}`}
        >
            <View
                className={`h-[42px] w-[42px] items-center justify-center rounded-dafSm ${
                    isFastest
                        ? 'bg-daf-azure/15 dark:bg-daf-azure/20'
                        : 'bg-daf-brand/15 dark:bg-daf-brand/20'
                }`}
            >
                <Icon color={iconColor} name={icon} size={22} />
            </View>

            <View className="min-w-0 flex-1">
                <View className="mb-0.5 flex-row items-center gap-2">
                    <Text className="text-[15px] font-bold text-daf-text-primary dark:text-white">
                        {title}
                    </Text>
                    {selected ? (
                        <View
                            className="h-5 justify-center rounded-dafPill bg-daf-brand px-2"
                            testID={`directions-route-option-${routeOption.routeKey}-selected-badge`}
                        >
                            <Text className="text-[11px] font-bold uppercase tracking-[0.06em] text-daf-brand-contrast">
                                Pick
                            </Text>
                        </View>
                    ) : null}
                </View>
                <View className="flex-row items-center gap-2">
                    <View className="relative h-3 w-10 justify-center">
                        <View className="h-[9px] w-full rounded-dafPill bg-white" />
                        <View
                            className={`absolute left-0 right-0 h-1.5 rounded-dafPill ${routeSwatchClassName}`}
                        />
                    </View>
                    <Text className="text-[13px] font-medium text-daf-text-secondary dark:text-neutral-300">
                        {distanceLabel || '-'}
                    </Text>
                    <View className="flex-row items-center gap-1">
                        <Icon
                            color={
                                cameraCount === 0
                                    ? dafSemanticColors.routePrivate
                                    : dafSemanticColors.markerAlpr
                            }
                            name={cameraCount === 0 ? 'check' : 'scan-eye'}
                            size={14}
                        />
                        <Text
                            className={`text-[13px] font-semibold ${
                                cameraCount === 0
                                    ? 'text-daf-text-brand'
                                    : 'text-daf-alert'
                            }`}
                            numberOfLines={1}
                        >
                            {cameraLabel}
                        </Text>
                    </View>
                </View>
                {routeDeltaLabel ? (
                    <Text
                        className="mt-0.5 text-xs font-medium text-daf-text-tertiary dark:text-neutral-400"
                        numberOfLines={1}
                    >
                        {routeDeltaLabel}
                    </Text>
                ) : null}
            </View>

            <View className="items-end">
                <Text
                    className="font-dafMono text-[21px] font-bold leading-6 text-daf-text-primary dark:text-white"
                    numberOfLines={1}
                >
                    {durationLabel || '-'}
                </Text>
                <Text
                    className="mt-0.5 text-xs font-medium text-daf-text-tertiary dark:text-neutral-400"
                    numberOfLines={1}
                >
                    {arrivalLabel ? `ETA ${arrivalLabel}` : 'ETA'}
                </Text>
            </View>
        </Pressable>
    );
}
