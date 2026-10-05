import { useCallback, useEffect } from 'react';
import {
    Alert,
    BackHandler,
    Pressable,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import { Icon } from '../design-system/icon';
import { DafChip } from '../design-system/primitives';
import { dafSemanticColors } from '../design-system/tokens';
import { MAP_CONTROL_BUTTON_CLASS_NAME } from '../map/constants';
import { MapControlButton } from '../map/map-control-button';
import { saveDraftBeforeExit } from './contribute-draft-actions';
import { useContribute } from './contribute-state';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { ContributeTourOverlay } from './contribute-tour-overlay';
import { ContributeTourTarget } from './contribute-tour-target';

function getMapBoundsMidpoint(bounds) {
    const west = Number(bounds?.sw?.[0]);
    const south = Number(bounds?.sw?.[1]);
    const east = Number(bounds?.ne?.[0]);
    const north = Number(bounds?.ne?.[1]);

    if (
        !Number.isFinite(west) ||
        !Number.isFinite(south) ||
        !Number.isFinite(east) ||
        !Number.isFinite(north)
    ) {
        return null;
    }

    return [(west + east) / 2, (south + north) / 2];
}

export function ContributePlacementOverlay({
    locationController,
    mapControls,
    screenIsFocused,
    tourTargets,
}) {
    const insets = useSafeAreaInsets();
    const isSystemDarkMode = useColorScheme() === 'dark';
    const {
        addPinAtCoordinate,
        discardStoredDraft,
        exitContribute,
        pins,
        saveDraft,
        tour,
    } = useContribute();
    const primaryIconColor = isSystemDarkMode ? '#f5f5f5' : '#171717';

    const handleExitRequest = useCallback(() => {
        if (pins.length === 0) {
            exitContribute();
            return;
        }

        Alert.alert(
            'Discard this draft?',
            'Your placed cameras are saved as a draft you can resume later.',
            [
                {
                    style: 'cancel',
                    text: 'Keep editing',
                },
                {
                    onPress: async () => {
                        const draftWasSaved = await saveDraftBeforeExit(
                            saveDraft,
                            exitContribute,
                        );

                        if (!draftWasSaved) {
                            Alert.alert(
                                'Draft not saved',
                                'Your draft could not be saved on this device. Please try again before leaving.',
                            );
                        }
                    },
                    text: 'Save draft & exit',
                },
                {
                    onPress: async () => {
                        await discardStoredDraft();
                        exitContribute();
                    },
                    style: 'destructive',
                    text: 'Discard',
                },
            ],
        );
    }, [discardStoredDraft, exitContribute, pins.length, saveDraft]);

    useEffect(() => {
        if (!screenIsFocused) {
            return undefined;
        }

        const backSubscription = BackHandler.addEventListener(
            'hardwareBackPress',
            () => {
                handleExitRequest();
                return true;
            },
        );

        return () => {
            backSubscription.remove();
        };
    }, [handleExitRequest, screenIsFocused]);

    const handleAddCameraPress = useCallback(async () => {
        let centerCoordinate = null;

        try {
            centerCoordinate =
                await locationController.mapViewRef.current?.getCenter();
        } catch {
            centerCoordinate = null;
        }

        if (!Array.isArray(centerCoordinate) || centerCoordinate.length < 2) {
            centerCoordinate = getMapBoundsMidpoint(
                locationController.currentMapBounds,
            );
        }

        if (!Array.isArray(centerCoordinate)) {
            return;
        }

        addPinAtCoordinate({
            latitude: Number(centerCoordinate[1]),
            longitude: Number(centerCoordinate[0]),
        });
    }, [addPinAtCoordinate, locationController]);

    return (
        <View className="gap-3" pointerEvents="box-none">
            <View className="flex-row items-center gap-2 rounded-dafMd border border-daf-border-glass bg-white/90 py-1.5 pl-1.5 pr-2 shadow-[0px_4px_18px_rgba(11,14,18,0.16)] dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/90">
                <Pressable
                    accessibilityLabel="Back"
                    accessibilityRole="button"
                    className="h-[50px] w-[50px] items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                    hitSlop={6}
                    onPress={handleExitRequest}
                    testID="contribute-back-button"
                >
                    <Icon
                        color={primaryIconColor}
                        name="chevron-left"
                        size={20}
                    />
                </Pressable>
                <Text
                    className="min-w-0 flex-1 text-base font-semibold text-daf-text-primary dark:text-white"
                    numberOfLines={1}
                >
                    Place the cameras
                </Text>
                <View
                    className="shrink-0 rounded-dafPill border border-daf-border bg-daf-surface-alt px-[9px] py-1 dark:border-daf-border-dark dark:bg-daf-surface-inverse"
                    testID="contribute-step-pill"
                >
                    <Text className="font-dafMono text-[11px] font-semibold tracking-[0.04em] text-daf-text-secondary dark:text-neutral-300">
                        Step 1 of 4
                    </Text>
                </View>
            </View>

            <View className="relative h-12" pointerEvents="box-none">
                <ContributeTourTarget
                    className="self-start"
                    id="placement"
                    targets={tourTargets}
                >
                    <MapControlButton
                        accessibilityLabel="Add camera here"
                        accessibilityRole="button"
                        className={`${MAP_CONTROL_BUTTON_CLASS_NAME} border-daf-border-glass bg-white/90 dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/90`}
                        onPress={handleAddCameraPress}
                        testID="contribute-add-camera-button"
                    >
                        <Icon
                            color={dafSemanticColors.brand}
                            name="plus"
                            size={24}
                            stroke={2.2}
                        />
                    </MapControlButton>
                </ContributeTourTarget>
                {mapControls ? (
                    <View
                        className="absolute right-0 top-0"
                        pointerEvents="box-none"
                    >
                        {mapControls}
                    </View>
                ) : null}
            </View>

            <View className="items-center" pointerEvents="box-none">
                <DafChip tone="glass">Move the map, then tap + to drop</DafChip>
            </View>
            <ContributeTourOverlay
                enabled={screenIsFocused && pins.length === 0}
                insets={insets}
                phase="placement"
                targets={tourTargets}
                tour={tour}
            />
        </View>
    );
}
