import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { DafButton, DafIconButton } from '../design-system/primitives';
import { dafSemanticColors } from '../design-system/tokens';
import {
    NativeWindBottomSheetModal,
    NativeWindBottomSheetView,
} from '../map/native-components';
import { useBottomSheetPresentedState } from '../map/use-bottom-sheet-presented-state';
import { useContribute } from './contribute-state';
import { ContributeTourOverlay } from './contribute-tour-overlay';
import { ContributeTourTarget } from './contribute-tour-target';

function formatPlacedPinCount(pinCount) {
    return pinCount === 1 ? '1 camera placed' : `${pinCount} cameras placed`;
}

function formatPinCoordinate(pin) {
    return `${pin.latitude.toFixed(4)}, ${pin.longitude.toFixed(4)}`;
}

export function ContributePlacementSheet({
    bottomSheetBackgroundStyle,
    bottomSheetHandleIndicatorStyle,
    insets,
    locationController,
    mapPreferencesAreLoaded,
    screenIsFocused,
    tourTargets,
}) {
    const { height: windowHeight } = useWindowDimensions();
    const { contributePlacementIsActive, pins, removals, removePin, tour } =
        useContribute();
    const sheetRef = useRef(null);
    const tourScrollRef = useRef(null);
    const tourContentRef = useRef(null);
    const placementSheetIsPresentedRef = useRef(false);
    const {
        bottomSheetIsPresented,
        handleBottomSheetChange,
        handleBottomSheetDismiss,
    } = useBottomSheetPresentedState();

    useEffect(() => {
        if (
            contributePlacementIsActive &&
            screenIsFocused &&
            mapPreferencesAreLoaded
        ) {
            if (!placementSheetIsPresentedRef.current) {
                placementSheetIsPresentedRef.current = true;
                sheetRef.current?.present();
            }
        } else if (placementSheetIsPresentedRef.current) {
            placementSheetIsPresentedRef.current = false;
            sheetRef.current?.dismiss();
        }
    }, [contributePlacementIsActive, mapPreferencesAreLoaded, screenIsFocused]);

    const handlePinRowPress = useCallback(
        (pin) => {
            locationController.moveCameraToCoordinate([
                pin.longitude,
                pin.latitude,
            ]);
        },
        [locationController],
    );

    const handleNextPress = useCallback(() => {
        tour.dismissPhase('placement');
        tour.dismissStep('placed');
        router.push(
            pins.length ? '/contribute/camera/0' : '/contribute/changeset',
        );
    }, [tour, pins.length]);

    if (!mapPreferencesAreLoaded) {
        return null;
    }

    return (
        <>
            <NativeWindBottomSheetModal
                ref={sheetRef}
                accessible={false}
                backgroundStyle={bottomSheetBackgroundStyle}
                enableDynamicSizing
                enableOverDrag={false}
                enablePanDownToClose={false}
                handleIndicatorStyle={bottomSheetHandleIndicatorStyle}
                index={0}
                maxDynamicContentSize={windowHeight * 0.55}
                onChange={handleBottomSheetChange}
                onDismiss={handleBottomSheetDismiss}
            >
                <NativeWindBottomSheetView
                    className="bg-white dark:bg-daf-surface-dark"
                    testID={
                        bottomSheetIsPresented
                            ? 'contribute-placement-sheet'
                            : undefined
                    }
                >
                    <BottomSheetScrollView
                        ref={tourScrollRef}
                        contentContainerStyle={{
                            gap: 14,
                            paddingBottom: Math.max(insets.bottom + 12, 20),
                            paddingHorizontal: 24,
                            paddingTop: 4,
                        }}
                        showsVerticalScrollIndicator={false}
                    >
                        <View
                            className="gap-3.5"
                            collapsable={false}
                            ref={tourContentRef}
                        >
                            <View className="gap-1">
                                <Text
                                    className="font-dafDisplay text-[21px] font-bold leading-7 text-daf-text-primary dark:text-white"
                                    testID="contribute-placement-sheet-title"
                                >
                                    {formatPlacedPinCount(pins.length)}
                                </Text>
                                {removals.length > 0 ? (
                                    <Text className="text-sm text-daf-text-secondary dark:text-neutral-300">
                                        {removals.length}{' '}
                                        {removals.length === 1
                                            ? 'removal'
                                            : 'removals'}{' '}
                                        in this changeset
                                    </Text>
                                ) : null}
                                <Text className="text-sm text-daf-text-secondary dark:text-neutral-300">
                                    Tap a point to edit or remove
                                </Text>
                            </View>

                            {pins.length > 0 ? (
                                <View>
                                    {pins.map((pin, pinIndex) => (
                                        <Pressable
                                            accessibilityLabel={`Camera ${pinIndex + 1}: New ALPR camera at ${formatPinCoordinate(pin)}`}
                                            accessibilityRole="button"
                                            className={`flex-row items-center gap-3 py-2.5 active:opacity-[0.82] ${
                                                pinIndex < pins.length - 1
                                                    ? 'border-b border-daf-border dark:border-daf-border-dark'
                                                    : ''
                                            }`}
                                            key={pin.id}
                                            onPress={() =>
                                                handlePinRowPress(pin)
                                            }
                                            testID={`contribute-pin-row-${pinIndex}`}
                                        >
                                            <View className="h-[34px] w-[34px] items-center justify-center rounded-dafSm bg-daf-alert/15">
                                                <Icon
                                                    color={
                                                        dafSemanticColors.danger
                                                    }
                                                    name="camera"
                                                    size={18}
                                                />
                                            </View>
                                            <View className="min-w-0 flex-1">
                                                <Text className="text-sm font-semibold text-daf-text-primary dark:text-white">
                                                    New ALPR camera
                                                </Text>
                                                <Text className="font-dafMono text-xs text-daf-text-tertiary dark:text-neutral-400">
                                                    {formatPinCoordinate(pin)}
                                                </Text>
                                            </View>
                                            <DafIconButton
                                                accessibilityLabel="Remove"
                                                icon="x"
                                                onPress={() =>
                                                    removePin(pin.id)
                                                }
                                                size="sm"
                                                testID={`contribute-pin-remove-${pinIndex}`}
                                            />
                                        </Pressable>
                                    ))}
                                </View>
                            ) : null}

                            <ContributeTourTarget
                                id="placed"
                                targets={tourTargets}
                            >
                                <DafButton
                                    accessibilityLabel={
                                        pins.length
                                            ? 'Next: describe cameras'
                                            : 'Next: changeset details'
                                    }
                                    disabled={
                                        pins.length + removals.length === 0
                                    }
                                    onPress={handleNextPress}
                                    size="lg"
                                    testID="contribute-next-details-button"
                                >
                                    {pins.length
                                        ? 'Next: describe cameras'
                                        : 'Next: changeset details'}
                                </DafButton>
                            </ContributeTourTarget>
                        </View>
                    </BottomSheetScrollView>
                </NativeWindBottomSheetView>
            </NativeWindBottomSheetModal>
            <ContributeTourOverlay
                enabled={
                    contributePlacementIsActive &&
                    bottomSheetIsPresented &&
                    screenIsFocused &&
                    pins.length > 0
                }
                insets={insets}
                phase="placed"
                tour={tour}
                targets={tourTargets}
                scrollRef={tourScrollRef}
                contentRef={tourContentRef}
            />
        </>
    );
}
