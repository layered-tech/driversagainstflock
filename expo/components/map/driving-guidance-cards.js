import { Text, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { DafButton } from '../design-system/primitives';
import { dafSemanticColors } from '../design-system/tokens';
import { DRIVING_DESTINATION_BOTTOM_PADDING } from './constants';
import {
    DIRECTIONS_ROUTE_PRIVATE,
    formatDirectionsArrivalTime,
    formatDirectionsDistance,
    formatDirectionsDuration,
    formatDirectionsManeuverDistance,
} from './directions';

function getManeuverIcon(maneuver) {
    const maneuverType = Number(maneuver?.type);
    const modifier =
        typeof maneuver?.maneuver?.modifier === 'string'
            ? maneuver.maneuver.modifier.toLowerCase()
            : '';
    const instruction =
        typeof maneuver?.instruction === 'string'
            ? maneuver.instruction.toLowerCase()
            : '';

    if (maneuverType === 10) {
        return 'flag';
    }

    if (maneuverType === 0 || maneuverType === 2 || maneuverType === 4) {
        return 'corner-up-left';
    }

    if (maneuverType === 1 || maneuverType === 3 || maneuverType === 5) {
        return 'corner-up-right';
    }

    if (maneuverType === 9 || maneuverType === 12) {
        return 'corner-up-left';
    }

    if (maneuverType === 13) {
        return 'corner-up-right';
    }

    if (modifier.includes('left') || instruction.includes('left')) {
        return 'corner-up-left';
    }

    if (modifier.includes('right') || instruction.includes('right')) {
        return 'corner-up-right';
    }

    if (maneuverType === 6 || maneuverType === 11) {
        return 'arrow-up';
    }

    return 'corner-up-right';
}

export function ManeuverCard({ maneuver, nextManeuver }) {
    if (!maneuver) {
        return null;
    }

    const maneuverDistanceLabel = formatDirectionsManeuverDistance(
        maneuver.distanceToManeuver,
    );
    const maneuverLabel = maneuver.typeLabel || 'Next maneuver';
    const maneuverDistanceText =
        maneuverDistanceLabel === 'now'
            ? 'Now'
            : maneuverDistanceLabel
              ? maneuverDistanceLabel
              : maneuverLabel;

    return (
        <View
            className="dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/95 w-full flex-row items-center gap-[14px] rounded-dafLg border border-daf-border-glass bg-white/95 px-4 py-3 shadow-[0px_4px_18px_rgba(11,14,18,0.18)]"
            testID="driving-maneuver-card"
        >
            <View className="h-[52px] w-[52px] items-center justify-center rounded-dafMd bg-daf-brand">
                <Icon
                    color={dafSemanticColors.brandContrast}
                    name={getManeuverIcon(maneuver)}
                    size={30}
                    stroke={2.4}
                />
            </View>

            <View className="min-w-0 flex-1">
                <Text
                    className="font-dafMono text-[26px] font-bold leading-[28px] text-daf-text-primary dark:text-white"
                    numberOfLines={1}
                    testID="driving-maneuver-distance"
                >
                    {maneuverDistanceText}
                </Text>
                <Text
                    className="mt-0.5 text-[17px] font-medium leading-[23px] text-daf-text-secondary dark:text-neutral-300"
                    numberOfLines={1}
                    testID="driving-maneuver-instruction"
                >
                    {maneuver.instruction || maneuverLabel}
                </Text>
            </View>

            {nextManeuver?.instruction ? (
                <View className="max-w-[118px] flex-none rounded-dafPill bg-daf-surface-alt px-3 py-1.5 dark:bg-daf-surface-inverse">
                    <Text
                        className="text-[12px] font-semibold leading-[16px] text-daf-text-secondary dark:text-neutral-300"
                        numberOfLines={1}
                        testID="driving-maneuver-next-step"
                    >
                        then {nextManeuver.instruction}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

export function ReroutingCard() {
    return (
        <View
            className="dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/95 w-full flex-row items-center gap-[14px] rounded-dafLg border border-daf-border-glass bg-white/95 px-4 py-3 shadow-[0px_4px_18px_rgba(11,14,18,0.18)]"
            testID="driving-rerouting-card"
        >
            <View className="h-[52px] w-[52px] items-center justify-center rounded-dafMd bg-daf-amber">
                <Icon
                    color={dafSemanticColors.brandContrast}
                    name="navigation"
                    size={25}
                />
            </View>

            <View className="min-w-0 flex-1">
                <Text
                    className="font-dafMono text-[26px] font-bold leading-[28px] text-daf-text-primary dark:text-white"
                    numberOfLines={1}
                    testID="driving-rerouting-label"
                >
                    Rerouting
                </Text>
                <Text
                    className="mt-0.5 text-[17px] font-medium leading-[23px] text-daf-text-secondary dark:text-neutral-300"
                    numberOfLines={1}
                    testID="driving-rerouting-instruction"
                >
                    Updating from your location
                </Text>
            </View>
        </View>
    );
}

export function DestinationCard({
    bottomInset = 0,
    directionsRoute,
    onCancelRoute,
    routeOption,
}) {
    const destination = directionsRoute?.destination;
    const isPrivateRoute = routeOption?.routeKey === DIRECTIONS_ROUTE_PRIVATE;
    const destinationTitle =
        destination?.label || destination?.inputValue || 'Destination';
    const durationLabel = formatDirectionsDuration(routeOption?.duration);
    const distanceLabel = formatDirectionsDistance(routeOption?.distance);
    const arrivalLabel = formatDirectionsArrivalTime(routeOption?.duration);

    return (
        <View
            className="w-full flex-row items-center gap-[14px] px-4 pt-4"
            style={{
                paddingBottom: Math.max(
                    bottomInset + DRIVING_DESTINATION_BOTTOM_PADDING,
                    DRIVING_DESTINATION_BOTTOM_PADDING,
                ),
            }}
            testID="driving-destination-card"
        >
            <View className="min-w-0 flex-1">
                <View className="mb-1.5 self-start">
                    <View
                        className={`h-[26px] justify-center rounded-dafPill px-2.5 ${
                            isPrivateRoute ? 'bg-daf-brand' : 'bg-daf-azure'
                        }`}
                    >
                        <Text className="text-[12px] font-bold text-white">
                            {isPrivateRoute ? 'Private route' : 'Fastest route'}
                        </Text>
                    </View>
                </View>
                <View className="flex-row items-baseline gap-2">
                    <Text
                        className="font-dafMono text-2xl font-extrabold text-daf-text-brand dark:text-daf-brand"
                        numberOfLines={1}
                        testID="driving-destination-route-summary"
                    >
                        {durationLabel || '-'}
                    </Text>
                    <Text className="font-dafMono text-[13px] text-daf-text-secondary dark:text-neutral-300">
                        {[distanceLabel, arrivalLabel]
                            .filter(Boolean)
                            .join(' - ')}
                    </Text>
                </View>
                <Text
                    className="text-[13px] font-medium text-daf-text-secondary dark:text-neutral-300"
                    numberOfLines={1}
                    testID="driving-destination-title"
                >
                    {destinationTitle}
                </Text>
            </View>
            <DafButton
                accessibilityLabel="Cancel route guidance"
                onPress={onCancelRoute}
                testID="driving-cancel-route-button"
                variant="danger"
            >
                Exit
            </DafButton>
        </View>
    );
}
