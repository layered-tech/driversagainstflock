import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, useColorScheme, View } from 'react-native';
import {
    runOnJS,
    useAnimatedReaction,
    useSharedValue,
} from 'react-native-reanimated';
import { Icon } from '../design-system/icon';
import { DafButton } from '../design-system/primitives';
import { getDafTheme } from '../design-system/tokens';
import {
    formatDirectionsArrivalTime,
    formatDirectionsDistance,
    formatDirectionsManeuverDistance,
    getDirectionsSteps,
} from './directions';
import { DestinationCard, getManeuverIcon } from './driving-guidance-cards';
import {
    NativeWindBottomSheet,
    NativeWindBottomSheetFlatList,
    NativeWindBottomSheetTouchableOpacity,
} from './native-components';
import { getRoundaboutExitNumber } from './roundabout-guidance';

export function DrivingStepRow({ item, arrivalLabel, onStepPress }) {
    const theme = getDafTheme(useColorScheme());
    const exitNumber = getRoundaboutExitNumber(item);
    const distance = formatDirectionsManeuverDistance(item.displayDistance);

    return (
        <Pressable
            accessibilityLabel={`Show on map: ${item.instruction || item.typeLabel || 'Continue'}`}
            accessibilityRole="button"
            className="flex-row items-center gap-3 border-b border-daf-border py-[11px] dark:border-daf-border-dark"
            disabled={!item.coordinate}
            onPress={() => onStepPress(item)}
            testID={`driving-step-${item.stepIndex}`}
        >
            <View
                className={`h-[38px] w-[38px] items-center justify-center rounded-dafSm ${item.isCurrent ? 'bg-daf-brand/15 dark:bg-daf-brand/20' : 'bg-daf-surface-alt dark:bg-daf-surface-inverse'}`}
            >
                {exitNumber === null ? (
                    <Icon
                        color={
                            item.isCurrent
                                ? theme.text.brand
                                : theme.text.primary
                        }
                        name={getManeuverIcon(item)}
                        size={20}
                    />
                ) : (
                    <Text
                        accessibilityLabel={`Roundabout exit ${exitNumber}`}
                        className="font-dafMono text-base font-bold text-daf-text-primary dark:text-white"
                    >
                        {exitNumber}
                    </Text>
                )}
            </View>
            <View className="min-w-0 flex-1">
                <Text className="text-[15px] font-semibold text-daf-text-primary dark:text-white">
                    {item.instruction || item.typeLabel || 'Continue'}
                </Text>
                {item.isCurrent ? (
                    <Text className="text-xs text-daf-text-tertiary dark:text-neutral-400">
                        Now
                    </Text>
                ) : null}
            </View>
            <Text className="font-dafMono text-sm font-semibold text-daf-text-secondary dark:text-neutral-300">
                {item.type === 10
                    ? arrivalLabel
                    : distance === 'now'
                      ? 'Now'
                      : distance}
            </Text>
        </Pressable>
    );
}

const stepKey = (item) => String(item.stepIndex);

export function DrivingStepsSheet({
    containerHeight,
    collapsedHeight,
    onCollapsedHeightChange,
    onStepFocus,
    bottomSheetRef,
    maneuver,
    ...destinationProps
}) {
    const localSheetRef = useRef(null);
    const sheetRef = bottomSheetRef ?? localSheetRef;
    const listRef = useRef(null);
    const scrollRetryRef = useRef(null);
    const collapsedSectionHeightsRef = useRef({ handle: null, summary: null });
    const [expanded, setExpanded] = useState(false);
    const animatedIndex = useSharedValue(0);
    useAnimatedReaction(
        () => animatedIndex.value,
        (index, previousIndex) => {
            if (index !== previousIndex && (index === 0 || index === 1)) {
                runOnJS(setExpanded)(index === 1);
            }
        },
    );
    const [stepsAreSynced, setStepsAreSynced] = useState(true);
    const arrivalLabel = formatDirectionsArrivalTime(
        destinationProps.remainingValues?.durationRemaining ??
            destinationProps.routeOption?.duration,
    );
    const handleStepPress = useCallback(
        (step) => {
            if (!step.coordinate) {
                return;
            }

            onStepFocus(step.coordinate, step.stepIndex);
        },
        [onStepFocus],
    );
    const renderStep = useCallback(
        ({ item }) => (
            <DrivingStepRow
                arrivalLabel={arrivalLabel}
                item={item}
                onStepPress={handleStepPress}
            />
        ),
        [arrivalLabel, handleStepPress],
    );
    const steps = useMemo(
        () => getDirectionsSteps(destinationProps.directionsRoute, maneuver),
        [destinationProps.directionsRoute, maneuver],
    );
    const currentStepIndex = steps.findIndex((step) => step.isCurrent);
    const cancelScrollRetry = useCallback(() => {
        clearTimeout(scrollRetryRef.current);
        scrollRetryRef.current = null;
    }, []);
    const scrollToCurrentStep = useCallback(() => {
        if (expanded && stepsAreSynced && currentStepIndex >= 0) {
            listRef.current?.scrollToIndex({
                index: currentStepIndex,
                animated: false,
            });
        }
    }, [currentStepIndex, expanded, stepsAreSynced]);
    const handleScrollBeginDrag = useCallback(() => {
        cancelScrollRetry();
        setStepsAreSynced(false);
    }, [cancelScrollRetry]);
    const handleScrollToIndexFailed = useCallback(
        ({ index, averageItemLength }) => {
            cancelScrollRetry();
            listRef.current?.scrollToOffset({
                offset: averageItemLength * index,
                animated: false,
            });
            scrollRetryRef.current = setTimeout(scrollToCurrentStep, 100);
        },
        [cancelScrollRetry, scrollToCurrentStep],
    );

    useEffect(() => {
        scrollToCurrentStep();
        return cancelScrollRetry;
    }, [cancelScrollRetry, scrollToCurrentStep, destinationProps.routeOption]);
    const snapPoints = useMemo(
        () => [
            collapsedHeight,
            Math.max(collapsedHeight + 1, (containerHeight * 2) / 3),
        ],
        [collapsedHeight, containerHeight],
    );
    const handleCollapsedSectionLayout = useCallback(
        (section, event) => {
            const heights = collapsedSectionHeightsRef.current;
            heights[section] = event.nativeEvent.layout.height;

            if (heights.handle !== null && heights.summary !== null) {
                onCollapsedHeightChange(heights.handle + heights.summary);
            }
        },
        [onCollapsedHeightChange],
    );
    const renderHandle = useCallback(
        () => (
            <View
                onLayout={(event) =>
                    handleCollapsedSectionLayout('handle', event)
                }
            >
                <NativeWindBottomSheetTouchableOpacity
                    accessibilityLabel={
                        expanded
                            ? 'Hide direction steps'
                            : 'Show direction steps'
                    }
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    className="items-center justify-center pb-1 pt-2"
                    onPress={() =>
                        sheetRef.current?.snapToIndex(expanded ? 0 : 1)
                    }
                    testID="driving-steps-toggle"
                >
                    <View className="h-[5px] w-9 rounded-full bg-daf-border-strong dark:bg-neutral-600" />
                </NativeWindBottomSheetTouchableOpacity>
            </View>
        ),
        [expanded, handleCollapsedSectionLayout, sheetRef],
    );

    return (
        <NativeWindBottomSheet
            ref={sheetRef}
            animateOnMount={false}
            animatedIndex={animatedIndex}
            backgroundClassName="rounded-t-[22px] border-t border-daf-border-glass bg-white dark:border-daf-border-glass-dark dark:bg-daf-surface-dark"
            enableContentPanningGesture={false}
            enableDynamicSizing={false}
            enableHandlePanningGesture
            enableOverDrag={false}
            enablePanDownToClose={false}
            handleComponent={renderHandle}
            index={0}
            snapPoints={snapPoints}
        >
            <View className="flex-1">
                <View
                    onLayout={(event) =>
                        handleCollapsedSectionLayout('summary', event)
                    }
                >
                    <DestinationCard {...destinationProps} />
                </View>
                <NativeWindBottomSheetFlatList
                    ref={listRef}
                    className="flex-1 border-t border-daf-border dark:border-daf-border-dark"
                    contentContainerClassName="px-4"
                    contentContainerStyle={{
                        paddingBottom:
                            (destinationProps.bottomInset ?? 0) +
                            (stepsAreSynced ? 16 : 76),
                    }}
                    data={steps}
                    keyExtractor={stepKey}
                    onLayout={scrollToCurrentStep}
                    onScrollBeginDrag={handleScrollBeginDrag}
                    onScrollToIndexFailed={handleScrollToIndexFailed}
                    ListHeaderComponent={
                        <View className="flex-row items-center justify-between pb-1 pt-[14px]">
                            <Text className="text-xs font-bold uppercase tracking-widest text-daf-text-tertiary dark:text-neutral-400">
                                Steps
                            </Text>
                            <Text className="font-dafMono text-xs text-daf-text-tertiary dark:text-neutral-400">
                                {steps.length} ·{' '}
                                {formatDirectionsDistance(
                                    destinationProps.remainingValues
                                        ?.distanceRemaining,
                                )}
                            </Text>
                        </View>
                    }
                    ListEmptyComponent={
                        <Text className="py-4 text-sm text-daf-text-secondary dark:text-neutral-300">
                            No direction steps available
                        </Text>
                    }
                    renderItem={renderStep}
                    showsVerticalScrollIndicator={false}
                    testID="driving-direction-steps"
                />
                {expanded && !stepsAreSynced ? (
                    <View
                        className="absolute self-center"
                        style={{
                            bottom: (destinationProps.bottomInset ?? 0) + 12,
                        }}
                    >
                        <DafButton
                            accessibilityLabel="Sync steps with current maneuver"
                            icon="navigation"
                            onPress={() => setStepsAreSynced(true)}
                            testID="driving-steps-sync"
                        >
                            Sync
                        </DafButton>
                    </View>
                ) : null}
            </View>
        </NativeWindBottomSheet>
    );
}
