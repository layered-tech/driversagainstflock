import { useMemo } from 'react';
import {
    Pressable,
    Text,
    useColorScheme,
    useWindowDimensions,
    View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Icon } from '../design-system/icon';
import { DafButton } from '../design-system/primitives';
import { dafSemanticColors, getDafTheme } from '../design-system/tokens';
import { DRIVING_DESTINATION_BOTTOM_PADDING } from './constants';
import {
    DIRECTIONS_ROUTE_PRIVATE,
    formatDirectionsArrivalTime,
    formatDirectionsDistance,
    formatDirectionsDuration,
    formatDirectionsManeuverDistance,
    getDirectionsManeuverCoordinate,
} from './directions';
import { getRoundaboutExitNumber } from './roundabout-guidance';
import { NativeWindBottomSheetTouchableOpacity } from './native-components';

function RoundaboutExitIcon({ exitNumber }) {
    return (
        <View
            accessibilityLabel={`Roundabout exit ${exitNumber}`}
            accessible
            className="h-[34px] w-[34px] items-center justify-center rounded-full border-[3px] border-white"
        >
            <Text
                className={`${exitNumber >= 10 ? 'text-[15px]' : 'text-[20px]'} font-dafMono font-extrabold leading-[20px] text-white`}
            >
                {exitNumber}
            </Text>
        </View>
    );
}

export function getManeuverIcon(maneuver) {
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

export function ManeuverInstruction({ instruction }) {
    const { fontScale } = useWindowDimensions();

    return (
        <Text
            adjustsFontSizeToFit
            className="mt-0.5 text-[20px] font-medium text-daf-text-secondary dark:text-neutral-300"
            includeFontPadding={false}
            minimumFontScale={14 / 20}
            numberOfLines={2}
            style={{ maxHeight: 48 * fontScale }}
            testID="driving-maneuver-instruction"
        >
            {instruction}
        </Text>
    );
}

export function ManeuverCard({
    directionsRoute,
    maneuver,
    nextManeuver,
    onStepFocus,
    isFocused = false,
    onPreviousStep,
    onNextStep,
}) {
    const colorScheme = useColorScheme();
    const { fontScale } = useWindowDimensions();
    const theme = getDafTheme(colorScheme);
    const floatingShadow =
        colorScheme === 'dark'
            ? '0 1px 2px rgba(0,0,0,0.40), 0 10px 30px rgba(0,0,0,0.50)'
            : '0 1px 2px rgba(11,14,18,0.14), 0 6px 22px rgba(11,14,18,0.16)';

    const stepSwipeGesture = useMemo(
        () =>
            Gesture.Pan()
                .enabled(isFocused)
                .activeOffsetX([-20, 20])
                .failOffsetY([-16, 16])
                .maxPointers(1)
                .runOnJS(true)
                .onEnd(({ translationX, translationY }, success) => {
                    if (
                        !success ||
                        !isFocused ||
                        Math.abs(translationX) < 40 ||
                        Math.abs(translationX) <= Math.abs(translationY)
                    ) {
                        return;
                    }
                    if (translationX < 0) {
                        onNextStep?.();
                    } else {
                        onPreviousStep?.();
                    }
                }),
        [isFocused, onNextStep, onPreviousStep],
    );

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
    const roundaboutExitNumber = getRoundaboutExitNumber(maneuver);
    const coordinate = getDirectionsManeuverCoordinate(
        directionsRoute,
        maneuver,
    );
    const nextCoordinate = getDirectionsManeuverCoordinate(
        directionsRoute,
        nextManeuver,
    );

    return (
        <View className="w-full">
            <View className="relative z-10 flex-row items-stretch overflow-visible">
                {isFocused ? (
                    <Pressable
                        accessibilityLabel="Previous step"
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !onPreviousStep }}
                        className={`relative z-[1] my-2.5 -mr-[14px] w-[50px] shrink-0 items-center justify-center rounded-l-dafSm border border-r-0 border-daf-border-glass bg-white/95 pr-[14px] dark:border-daf-border-glass-dark dark:bg-[rgba(17,21,27,0.95)] ${onPreviousStep ? 'active:scale-[0.97]' : 'opacity-40'}`}
                        disabled={!onPreviousStep}
                        onPress={onPreviousStep}
                        style={{ boxShadow: floatingShadow }}
                        testID="driving-step-previous"
                    >
                        <Icon
                            name="chevron-left"
                            size={22}
                            stroke={2.4}
                            color={theme.text.primary}
                        />
                    </Pressable>
                ) : null}
                <GestureDetector gesture={stepSwipeGesture}>
                    <Pressable
                        accessibilityHint={
                            isFocused
                                ? 'Swipe left for a later step or right for an earlier step.'
                                : undefined
                        }
                        accessibilityLabel={`Show on map: ${maneuver.instruction || maneuverLabel}`}
                        accessibilityRole="button"
                        className="relative z-[2] min-w-0 flex-1 flex-row items-center gap-[14px] rounded-dafLg border border-daf-border-glass bg-white/95 px-4 py-2.5 dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/95"
                        disabled={!coordinate || !onStepFocus}
                        onPress={() =>
                            onStepFocus(coordinate, maneuver.stepIndex)
                        }
                        style={{ boxShadow: floatingShadow }}
                        testID="driving-maneuver-card"
                    >
                        <View className="h-[52px] w-[52px] items-center justify-center rounded-dafMd bg-daf-brand">
                            {roundaboutExitNumber === null ? (
                                <Icon
                                    color={dafSemanticColors.brandContrast}
                                    name={getManeuverIcon(maneuver)}
                                    size={30}
                                    stroke={2.4}
                                />
                            ) : (
                                <RoundaboutExitIcon
                                    exitNumber={roundaboutExitNumber}
                                />
                            )}
                        </View>
                        <View
                            className="min-w-0 flex-1 justify-center"
                            style={{ height: 78 * fontScale }}
                        >
                            <Text
                                className="font-dafMono text-[26px] font-bold leading-[28px] text-daf-text-primary dark:text-white"
                                numberOfLines={1}
                                testID="driving-maneuver-distance"
                            >
                                {maneuverDistanceText}
                            </Text>
                            <ManeuverInstruction
                                instruction={
                                    maneuver.instruction || maneuverLabel
                                }
                            />
                        </View>
                    </Pressable>
                </GestureDetector>
                {isFocused ? (
                    <Pressable
                        accessibilityLabel="Next step"
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !onNextStep }}
                        className={`relative z-[1] my-2.5 -ml-[14px] w-[50px] shrink-0 items-center justify-center rounded-r-dafSm border border-l-0 border-daf-border-glass bg-white/95 pl-[14px] dark:border-daf-border-glass-dark dark:bg-[rgba(17,21,27,0.95)] ${onNextStep ? 'active:scale-[0.97]' : 'opacity-40'}`}
                        disabled={!onNextStep}
                        onPress={onNextStep}
                        style={{ boxShadow: floatingShadow }}
                        testID="driving-step-next"
                    >
                        <Icon
                            name="chevron-right"
                            size={22}
                            stroke={2.4}
                            color={theme.text.primary}
                        />
                    </Pressable>
                ) : null}
            </View>
            {!isFocused && nextManeuver?.instruction ? (
                <Pressable
                    accessibilityLabel={`Show on map: ${nextManeuver.instruction}`}
                    accessibilityRole="button"
                    className="relative z-[1] mx-3 -mt-2 min-h-11 flex-row items-center gap-2 rounded-b-dafSm border border-t-0 border-daf-border-glass bg-white/95 px-3 pb-2 pt-4 dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/95"
                    disabled={!nextCoordinate || !onStepFocus}
                    onPress={() =>
                        onStepFocus(nextCoordinate, nextManeuver.stepIndex)
                    }
                    testID="driving-maneuver-next-step-bar"
                    style={{ boxShadow: floatingShadow }}
                >
                    <Icon
                        color="#828D9B"
                        name={getManeuverIcon(nextManeuver)}
                        size={16}
                    />
                    <Text
                        className="min-w-0 flex-1 text-[14px] font-semibold text-daf-text-secondary dark:text-neutral-300"
                        numberOfLines={1}
                        testID="driving-maneuver-next-step"
                    >
                        Then {nextManeuver.instruction}
                    </Text>
                    <Text className="font-dafMono text-xs font-semibold text-daf-text-tertiary dark:text-neutral-400">
                        {formatDirectionsManeuverDistance(
                            Math.max(
                                0,
                                nextManeuver.distanceToManeuver -
                                    maneuver.distanceToManeuver,
                            ),
                        )}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}

export function ReroutingCard() {
    return (
        <View
            className="w-full flex-row items-center gap-[14px] rounded-dafLg border border-daf-border-glass bg-white/95 px-4 py-3 shadow-[0px_4px_18px_rgba(11,14,18,0.18)] dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/95"
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
    onExportRoute,
    routeExportIsAvailable,
    routeOption,
    remainingValues,
}) {
    const theme = getDafTheme(useColorScheme());
    const destination = directionsRoute?.destination;
    const isPrivateRoute = routeOption?.routeKey === DIRECTIONS_ROUTE_PRIVATE;
    const destinationTitle =
        destination?.label || destination?.inputValue || 'Destination';
    const durationLabel = formatDirectionsDuration(
        remainingValues
            ? remainingValues.durationRemaining
            : routeOption?.duration,
    );
    const distanceLabel = formatDirectionsDistance(
        remainingValues
            ? remainingValues.distanceRemaining
            : routeOption?.distance,
    );
    const arrivalLabel = formatDirectionsArrivalTime(
        remainingValues
            ? remainingValues.durationRemaining
            : routeOption?.duration,
    );

    return (
        <View
            className="w-full gap-3 px-4 pt-1"
            style={{
                paddingBottom: Math.max(
                    bottomInset + DRIVING_DESTINATION_BOTTOM_PADDING,
                    24,
                ),
            }}
            testID="driving-destination-card"
        >
            <View className="flex-row items-center gap-3">
                <View
                    className={`h-[46px] w-[46px] shrink-0 items-center justify-center rounded-dafSm ${
                        isPrivateRoute
                            ? 'bg-[#E6F9EF] dark:bg-daf-brand/[0.16]'
                            : 'bg-daf-azure/10 dark:bg-daf-azure/[0.16]'
                    }`}
                >
                    <Icon
                        color={
                            isPrivateRoute
                                ? theme.text.brand
                                : dafSemanticColors.routeFast
                        }
                        name={isPrivateRoute ? 'shield-check' : 'zap'}
                        size={24}
                        stroke={2.2}
                    />
                </View>
                <View className="min-w-0 flex-1">
                    <View className="flex-row items-baseline gap-2.5 overflow-hidden">
                        <Text
                            adjustsFontSizeToFit
                            className="shrink font-dafMono text-[26px] font-bold leading-[26px] tracking-[-0.52px] text-daf-text-primary dark:text-daf-text-inverse"
                            includeFontPadding={false}
                            minimumFontScale={0.8}
                            numberOfLines={1}
                            testID="driving-destination-route-summary"
                        >
                            {durationLabel || '-'}
                        </Text>
                        {arrivalLabel ? (
                            <Text
                                className="shrink-0 font-dafMono text-[13px] font-semibold text-daf-text-secondary dark:text-[#A9B2BD]"
                                includeFontPadding={false}
                                numberOfLines={1}
                            >
                                {arrivalLabel}
                            </Text>
                        ) : null}
                        {distanceLabel ? (
                            <Text
                                className="shrink font-dafMono text-[13px] text-daf-text-tertiary"
                                includeFontPadding={false}
                                numberOfLines={1}
                            >
                                {distanceLabel}
                            </Text>
                        ) : null}
                    </View>
                    <View className="mt-[5px] min-w-0 flex-row items-center gap-[7px]">
                        <Text
                            className={`shrink-0 text-[11px] font-bold uppercase leading-[13px] tracking-[0.66px] ${
                                isPrivateRoute
                                    ? 'text-daf-text-brand dark:text-[#2FC177]'
                                    : 'text-daf-azure'
                            }`}
                            includeFontPadding={false}
                        >
                            {isPrivateRoute ? 'Private' : 'Fastest'}
                        </Text>
                        <View className="h-[3px] w-[3px] shrink-0 rounded-full bg-daf-border-strong dark:bg-[#3A434E]" />
                        <Text
                            className="min-w-0 shrink text-[13px] leading-[16px] text-daf-text-secondary dark:text-[#A9B2BD]"
                            includeFontPadding={false}
                            numberOfLines={1}
                            testID="driving-destination-title"
                        >
                            {destinationTitle}
                        </Text>
                    </View>
                </View>
                <NativeWindBottomSheetTouchableOpacity
                    accessibilityLabel="End route guidance"
                    accessibilityRole="button"
                    className="h-[46px] w-[46px] shrink-0 items-center justify-center rounded-dafSm bg-daf-alert active:scale-[0.97]"
                    onPress={onCancelRoute}
                    testID="driving-cancel-route-button"
                >
                    <Icon color="#FFFFFF" name="x" size={22} stroke={2.4} />
                </NativeWindBottomSheetTouchableOpacity>
            </View>
            {routeExportIsAvailable ? (
                <DafButton
                    accessibilityLabel="Export route as GPX or KML text"
                    icon="download"
                    onPress={onExportRoute}
                    pressableComponent={NativeWindBottomSheetTouchableOpacity}
                    testID="driving-route-export-button"
                    variant="secondary"
                >
                    Export route
                </DafButton>
            ) : null}
        </View>
    );
}
