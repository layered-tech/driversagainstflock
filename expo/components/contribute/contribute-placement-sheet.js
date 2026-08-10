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
}) {
    const { height: windowHeight } = useWindowDimensions();
    const { contributePlacementIsActive, pins, removePin } = useContribute();
    const sheetRef = useRef(null);
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
        router.push('/contribute/camera/0');
    }, []);

    if (!mapPreferencesAreLoaded) {
        return null;
    }

    return (
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
                className="dark:bg-daf-surface-dark bg-white"
                testID={
                    bottomSheetIsPresented
                        ? 'contribute-placement-sheet'
                        : undefined
                }
            >
                <BottomSheetScrollView
                    contentContainerStyle={{
                        gap: 14,
                        paddingBottom: Math.max(insets.bottom + 12, 20),
                        paddingHorizontal: 24,
                        paddingTop: 4,
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    <View className="gap-1">
                        <Text
                            className="font-dafDisplay text-[21px] font-bold leading-7 text-daf-text-primary dark:text-white"
                            testID="contribute-placement-sheet-title"
                        >
                            {formatPlacedPinCount(pins.length)}
                        </Text>
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
                                            ? 'dark:border-daf-border-dark border-b border-daf-border'
                                            : ''
                                    }`}
                                    key={pin.id}
                                    onPress={() => handlePinRowPress(pin)}
                                    testID={`contribute-pin-row-${pinIndex}`}
                                >
                                    <View className="bg-daf-alert/15 h-[34px] w-[34px] items-center justify-center rounded-dafSm">
                                        <Icon
                                            color={dafSemanticColors.danger}
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
                                        onPress={() => removePin(pin.id)}
                                        size="sm"
                                        testID={`contribute-pin-remove-${pinIndex}`}
                                    />
                                </Pressable>
                            ))}
                        </View>
                    ) : null}

                    <DafButton
                        accessibilityLabel="Next: describe cameras"
                        disabled={pins.length === 0}
                        onPress={handleNextPress}
                        size="lg"
                        testID="contribute-next-details-button"
                    >
                        Next: describe cameras
                    </DafButton>
                </BottomSheetScrollView>
            </NativeWindBottomSheetView>
        </NativeWindBottomSheetModal>
    );
}
