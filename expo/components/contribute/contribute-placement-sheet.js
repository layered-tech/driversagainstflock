import { useResponsiveMapLayout } from '../map/use-responsive-map-layout';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { getCameraFormTags } from '../../lib/osm/camera-presets';
import { REMOVAL_REASONS } from '../../lib/osm/edit-tags';
import { Icon } from '../design-system/icon';
import { DafButton, DafIconButton } from '../design-system/primitives';
import { dafSemanticColors } from '../design-system/tokens';
import {
    NativeWindBottomSheetModal,
    NativeWindBottomSheetScrollView,
} from '../map/native-components';
import { useBottomSheetPresentedState } from '../map/use-bottom-sheet-presented-state';
import { getChangesetSummary } from './changeset-summary';
import { useContribute } from './contribute-state';
import { ContributeTourOverlay } from './contribute-tour-overlay';
import { ContributeTourTarget } from './contribute-tour-target';

export function ContributePlacementSheet({
    bottomSheetBackgroundStyle,
    bottomSheetHandleIndicatorStyle,
    insets,
    locationController,
    mapPreferencesAreLoaded,
    screenIsFocused,
    tourTargets,
}) {
    const layout = useResponsiveMapLayout();
    const { height } = useWindowDimensions();
    const {
        contributePlacementIsActive,
        pins,
        removals,
        removePin,
        removeRemoval,
        addPinAtCoordinate,
        tour,
    } = useContribute();
    const summary = getChangesetSummary(pins, removals);
    const sheetRef = useRef(null);
    const placementSheetIsPresentedRef = useRef(false);
    const [expanded, setExpanded] = useState(false);
    const [pendingPinId, setPendingPinId] = useState(null);
    useFocusEffect(
        useCallback(
            () => () => {
                setExpanded(false);
                placementSheetIsPresentedRef.current = false;
                sheetRef.current?.dismiss();
            },
            [],
        ),
    );
    const {
        bottomSheetIsPresented,
        handleBottomSheetChange,
        handleBottomSheetDismiss,
    } = useBottomSheetPresentedState();
    useEffect(() => {
        if (contributePlacementIsActive && screenIsFocused) {
            setExpanded(summary.total > 0);
        }
    }, [contributePlacementIsActive, screenIsFocused, summary.total]);
    useEffect(() => {
        if (!pendingPinId) return;
        const index = pins.findIndex((pin) => pin.id === pendingPinId);
        if (index < 0) return;
        setPendingPinId(null);
        router.push(`/contribute/camera/${index}`);
    }, [pendingPinId, pins]);
    useEffect(() => {
        if (
            contributePlacementIsActive &&
            expanded &&
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
    }, [
        contributePlacementIsActive,
        expanded,
        screenIsFocused,
        mapPreferencesAreLoaded,
    ]);
    const openForm = (path) => {
        setExpanded(false);
        placementSheetIsPresentedRef.current = false;
        sheetRef.current?.dismiss();
        router.push(path);
    };
    const add = useCallback(async () => {
        let coordinate;
        try {
            coordinate =
                await locationController.mapViewRef.current?.getCenter();
        } catch {
            coordinate = null;
        }
        if (!Array.isArray(coordinate)) {
            const bounds = locationController.currentMapBounds;
            if (bounds?.sw && bounds?.ne)
                coordinate = [
                    (bounds.sw[0] + bounds.ne[0]) / 2,
                    (bounds.sw[1] + bounds.ne[1]) / 2,
                ];
        }
        if (!coordinate) return;
        const pin = addPinAtCoordinate({
            latitude: Number(coordinate[1]),
            longitude: Number(coordinate[0]),
        });
        if (!pin) return;
        tour.dismissPhase('placement');
        tour.dismissStep('placed');
        setPendingPinId(pin.id);
    }, [locationController, addPinAtCoordinate, pins.length, tour]);
    if (!mapPreferencesAreLoaded) return null;
    return (
        <>
            {contributePlacementIsActive && screenIsFocused && !expanded ? (
                <View
                    className="absolute left-3 right-3 z-40 gap-2 rounded-dafMd border border-daf-border bg-white p-2 shadow-[0px_4px_18px_rgba(11,14,18,0.16)] dark:border-daf-border-dark dark:bg-daf-surface-dark"
                    style={
                        layout.isWide
                            ? {
                                  right: undefined,
                                  width: layout.paneWidth,
                                  top: insets.top + 76,
                                  bottom: insets.bottom + 12,
                              }
                            : { bottom: Math.max(insets.bottom + 12, 30) }
                    }
                    testID="contribute-placement-sheet"
                >
                    <View className="flex-row items-center gap-2.5">
                        <ContributeTourTarget
                            className="min-w-0 flex-1"
                            id="placement"
                            targets={tourTargets}
                        >
                            <Pressable
                                className="flex-row items-center gap-3"
                                accessibilityRole="button"
                                accessibilityLabel="Add a camera here"
                                onPress={add}
                                testID="contribute-add-camera-button"
                            >
                                <View className="h-[46px] w-[46px] items-center justify-center rounded-dafSm bg-daf-brand">
                                    <Icon name="plus" color="#fff" size={24} />
                                </View>
                                <View className="min-w-0 flex-1">
                                    <Text className="text-[15px] font-semibold text-daf-text-primary dark:text-white">
                                        Add a camera here
                                    </Text>
                                    <Text className="mt-0.5 text-xs leading-4 text-daf-text-tertiary dark:text-neutral-400">
                                        Or tap a camera to edit or delete it
                                    </Text>
                                </View>
                            </Pressable>
                        </ContributeTourTarget>
                        <ContributeTourTarget id="placed" targets={tourTargets}>
                            <DafButton
                                variant="ghost"
                                disabled={!summary.total}
                                onPress={() => {
                                    tour.dismissStep('placed');
                                    openForm('/contribute/changeset');
                                }}
                                testID="contribute-next-details-button"
                            >
                                Review
                            </DafButton>
                        </ContributeTourTarget>
                    </View>
                    {summary.total ? (
                        <Pressable
                            className="flex-row justify-between border-t border-daf-border px-1 pt-2 dark:border-daf-border-dark"
                            onPress={() => setExpanded(true)}
                            accessibilityRole="button"
                            accessibilityLabel={`${summary.total} ${summary.total === 1 ? 'change' : 'changes'} staged`}
                            testID="contribute-expand-tray"
                        >
                            <Text className="text-[13px] font-semibold text-daf-text-primary dark:text-white">
                                {summary.total}{' '}
                                {summary.total === 1 ? 'change' : 'changes'}{' '}
                                staged
                            </Text>
                            <Text className="text-xs text-daf-text-tertiary dark:text-neutral-400">
                                {summary.label}
                            </Text>
                        </Pressable>
                    ) : null}
                </View>
            ) : null}
            <NativeWindBottomSheetModal
                ref={sheetRef}
                accessible={false}
                backgroundStyle={bottomSheetBackgroundStyle}
                handleIndicatorStyle={bottomSheetHandleIndicatorStyle}
                enableDynamicSizing
                enablePanDownToClose={false}
                enableOverDrag={false}
                maxDynamicContentSize={height * 0.6}
                topInset={layout.isWide ? insets.top + 76 : undefined}
                onChange={handleBottomSheetChange}
                onDismiss={handleBottomSheetDismiss}
            >
                <NativeWindBottomSheetScrollView
                    className="bg-white dark:bg-daf-surface-dark"
                    testID={
                        bottomSheetIsPresented
                            ? 'contribute-placement-sheet'
                            : undefined
                    }
                >
                    <View
                        className="gap-3 px-4 pt-1"
                        style={{
                            paddingBottom: Math.max(insets.bottom + 12, 20),
                        }}
                    >
                        {expanded && summary.total ? (
                            <>
                                <Text
                                    className="font-dafDisplay text-[21px] font-bold text-daf-text-primary dark:text-white"
                                    testID="contribute-placement-sheet-title"
                                >
                                    {summary.total}{' '}
                                    {summary.total === 1 ? 'change' : 'changes'}{' '}
                                    staged
                                </Text>
                                <Text className="text-[13px] text-daf-text-secondary dark:text-neutral-300">
                                    {summary.label} · nothing published yet
                                </Text>
                                <View>
                                    {pins.map((pin, index) => (
                                        <View
                                            key={pin.id}
                                            className="flex-row items-center gap-3 border-b border-daf-border py-2.5 dark:border-daf-border-dark"
                                        >
                                            <View className="h-[34px] w-[34px] items-center justify-center rounded-dafSm bg-daf-brand/15">
                                                <Icon
                                                    name={
                                                        pin.nodeId
                                                            ? 'pencil'
                                                            : 'plus'
                                                    }
                                                    size={18}
                                                    color={
                                                        dafSemanticColors.brand
                                                    }
                                                />
                                            </View>
                                            <Pressable
                                                className="min-w-0 flex-1"
                                                accessibilityRole="button"
                                                onPress={() =>
                                                    openForm(
                                                        `/contribute/camera/${index}`,
                                                    )
                                                }
                                                testID={`contribute-pin-row-${index}`}
                                            >
                                                <Text className="text-[13px] font-semibold text-daf-text-primary dark:text-white">
                                                    {pin.nodeId
                                                        ? 'Edited'
                                                        : 'Added'}{' '}
                                                    · ALPR reader
                                                </Text>
                                                <Text className="font-dafMono text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                                                    {getCameraFormTags(
                                                        pin.details,
                                                    ).manufacturer ??
                                                        'Generic'}{' '}
                                                    · {pin.latitude.toFixed(4)},{' '}
                                                    {pin.longitude.toFixed(4)}
                                                </Text>
                                            </Pressable>
                                            <DafIconButton
                                                icon="rotate-ccw"
                                                size="sm"
                                                accessibilityLabel="Undo"
                                                onPress={() =>
                                                    removePin(pin.id)
                                                }
                                                testID={`contribute-pin-remove-${index}`}
                                            />
                                        </View>
                                    ))}
                                    {removals.map((node) => (
                                        <View
                                            key={node.id}
                                            className="flex-row items-center gap-3 py-2.5"
                                        >
                                            <View className="h-[34px] w-[34px] items-center justify-center rounded-dafSm bg-daf-alert/15">
                                                <Icon
                                                    name="minus"
                                                    size={18}
                                                    color={
                                                        dafSemanticColors.danger
                                                    }
                                                />
                                            </View>
                                            <View className="min-w-0 flex-1">
                                                <Text className="text-[13px] font-semibold text-daf-text-primary dark:text-white">
                                                    Deleted · ALPR reader
                                                </Text>
                                                <Text className="font-dafMono text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                                                    node/{node.id} ·{' '}
                                                    {REMOVAL_REASONS.find(
                                                        (item) =>
                                                            item.value ===
                                                            node.reason,
                                                    )?.comment ?? node.reason}
                                                </Text>
                                            </View>
                                            <DafIconButton
                                                icon="rotate-ccw"
                                                size="sm"
                                                accessibilityLabel="Undo"
                                                onPress={() =>
                                                    removeRemoval(node.id)
                                                }
                                                testID={`contribute-undo-removal-${node.id}`}
                                            />
                                        </View>
                                    ))}
                                </View>
                                <ContributeTourTarget
                                    id="placed"
                                    targets={tourTargets}
                                >
                                    <DafButton
                                        size="lg"
                                        onPress={() =>
                                            openForm('/contribute/changeset')
                                        }
                                        testID="contribute-next-details-button"
                                    >
                                        Review {summary.total}{' '}
                                        {summary.total === 1
                                            ? 'change'
                                            : 'changes'}
                                    </DafButton>
                                </ContributeTourTarget>
                                <DafButton
                                    variant="ghost"
                                    onPress={() => setExpanded(false)}
                                    testID="contribute-keep-editing"
                                >
                                    Keep editing
                                </DafButton>
                            </>
                        ) : null}
                    </View>
                </NativeWindBottomSheetScrollView>
            </NativeWindBottomSheetModal>
            <ContributeTourOverlay
                enabled={
                    contributePlacementIsActive &&
                    (bottomSheetIsPresented || !expanded) &&
                    screenIsFocused &&
                    summary.total > 0
                }
                insets={insets}
                phase="placed"
                tour={tour}
                targets={tourTargets}
            />
        </>
    );
}
