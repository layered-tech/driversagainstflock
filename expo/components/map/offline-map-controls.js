import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { OfflineMapActionIcon } from './offline-map-action-icon';
import { OFFLINE_MAX_ZOOM_OPTIONS } from './offline-map-utils';
import { useOfflineMapPack } from './use-offline-map-pack';

function getStatusBadgeClassName({
    offlineDownloadIsActive,
    offlineDownloadIsComplete,
    selectionDiffersFromPack,
}) {
    if (selectionDiffersFromPack) {
        return 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40';
    }

    if (offlineDownloadIsActive) {
        return 'border-daf-brand/30 bg-daf-brand/10 dark:border-daf-brand/40 dark:bg-daf-brand/15';
    }

    if (offlineDownloadIsComplete) {
        return 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40';
    }

    return 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950';
}

function getStatusTextClassName({
    offlineDownloadIsActive,
    offlineDownloadIsComplete,
    selectionDiffersFromPack,
}) {
    if (selectionDiffersFromPack) {
        return 'text-amber-700 dark:text-amber-300';
    }

    if (offlineDownloadIsActive) {
        return 'text-daf-text-brand dark:text-daf-brand';
    }

    if (offlineDownloadIsComplete) {
        return 'text-emerald-700 dark:text-emerald-300';
    }

    return 'text-neutral-600 dark:text-neutral-300';
}

export function OfflineMapControls({
    currentMapBounds,
    mapStyleURL,
    resetKey,
    selectedMapLayer,
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const {
        canUseCurrentMapRegion,
        deleteOfflinePack,
        errorMessage,
        handlePrimaryOfflineAction,
        hasOfflinePack,
        isDeletingOfflinePack,
        isLoadingOfflinePack,
        isStartingOfflineDownload,
        offlineDownloadIsActive,
        offlineDownloadIsComplete,
        operationIsPending,
        primaryActionIsDisabled,
        primaryActionLabel,
        progressLabel,
        progressPercentage,
        resourceLabel,
        selectedMaxZoom,
        selectedRegionLabel,
        selectionDiffersFromPack,
        setSelectedMaxZoom,
        statusLabel,
        storageLabel,
        useCurrentMapRegion,
    } = useOfflineMapPack({ currentMapBounds, mapStyleURL });
    const statusTone = {
        offlineDownloadIsActive,
        offlineDownloadIsComplete,
        selectionDiffersFromPack,
    };
    const statusBadgeClassName = getStatusBadgeClassName(statusTone);
    const statusTextClassName = getStatusTextClassName(statusTone);
    const primaryButtonIsBusy =
        isLoadingOfflinePack ||
        isStartingOfflineDownload ||
        offlineDownloadIsActive;

    useEffect(() => {
        setIsExpanded(false);
    }, [resetKey]);

    const handleDeletePress = () => {
        Alert.alert(
            'Delete offline map?',
            'This removes the downloaded Mapbox tiles for this area.',
            [
                { style: 'cancel', text: 'Cancel' },
                {
                    onPress: deleteOfflinePack,
                    style: 'destructive',
                    text: 'Delete',
                },
            ],
        );
    };

    const handleTogglePress = () => {
        setIsExpanded((currentValue) => !currentValue);
    };

    return (
        <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark overflow-hidden rounded-dafMd border border-daf-border bg-white">
            <Pressable
                accessibilityHint={
                    isExpanded
                        ? 'Collapses offline map download options.'
                        : 'Expands offline map download options.'
                }
                accessibilityLabel="Offline map download options"
                accessibilityRole="button"
                accessibilityState={{ expanded: isExpanded }}
                className={`min-h-[76px] flex-row items-center justify-between gap-3 p-4 active:opacity-[0.82] ${
                    isExpanded
                        ? 'dark:border-daf-border-dark border-b border-daf-border'
                        : ''
                }`}
                onPress={handleTogglePress}
                testID="offline-map-section-toggle"
            >
                <View className="min-w-0 flex-1 gap-1">
                    <Text className="text-base font-semibold text-neutral-950 dark:text-white">
                        Offline Data
                    </Text>
                    <Text className="text-sm leading-5 text-neutral-600 dark:text-neutral-300">
                        {selectedMapLayer.label}
                    </Text>
                </View>

                <View className="shrink-0 flex-row items-center gap-2">
                    <View
                        className={`max-w-40 rounded-full border px-3 py-1 ${statusBadgeClassName}`}
                    >
                        <Text
                            adjustsFontSizeToFit
                            className={`text-xs font-semibold ${statusTextClassName}`}
                            minimumFontScale={0.75}
                            numberOfLines={1}
                        >
                            {statusLabel}
                        </Text>
                    </View>
                    <Icon
                        color="#737373"
                        name="chevron-down"
                        style={{
                            transform: [
                                { rotate: isExpanded ? '180deg' : '0deg' },
                            ],
                        }}
                        size={13}
                    />
                </View>
            </Pressable>

            {isExpanded ? (
                <View className="gap-4 p-4">
                    <View className="gap-2">
                        <View className="flex-row items-center justify-between gap-3">
                            <Text className="text-sm font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                                Region
                            </Text>
                            <Pressable
                                accessibilityLabel="Use current map view for offline region"
                                accessibilityRole="button"
                                className="min-h-9 flex-row items-center gap-2 rounded-dafMd border border-daf-border px-3 active:opacity-[0.82] disabled:opacity-50 dark:border-neutral-700"
                                disabled={
                                    !canUseCurrentMapRegion ||
                                    operationIsPending ||
                                    offlineDownloadIsActive
                                }
                                onPress={useCurrentMapRegion}
                                testID="offline-map-use-current-region"
                            >
                                <Icon
                                    color={
                                        canUseCurrentMapRegion
                                            ? '#1FBF6B'
                                            : '#a3a3a3'
                                    }
                                    name="locate-fixed"
                                    size={13}
                                />
                                <Text className="text-sm font-semibold text-neutral-900 dark:text-white">
                                    Use Current View
                                </Text>
                            </Pressable>
                        </View>
                        <Text className="rounded-dafMd bg-daf-surface-alt px-3 py-2 text-sm leading-5 text-neutral-700 dark:bg-daf-surface-inverse dark:text-neutral-200">
                            {selectedRegionLabel}
                        </Text>
                    </View>

                    <View className="gap-2">
                        <Text className="text-sm font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                            Max Zoom
                        </Text>
                        <View className="dark:border-daf-border-dark flex-row overflow-hidden rounded-dafMd border border-daf-border bg-white dark:bg-daf-surface-inverse">
                            {OFFLINE_MAX_ZOOM_OPTIONS.map(
                                (zoomLevel, index) => {
                                    const isSelected =
                                        zoomLevel === selectedMaxZoom;

                                    return (
                                        <Pressable
                                            key={zoomLevel}
                                            accessibilityLabel={`Download offline map through zoom ${zoomLevel}`}
                                            accessibilityRole="button"
                                            accessibilityState={{
                                                selected: isSelected,
                                            }}
                                            className={`min-h-11 flex-1 items-center justify-center px-1 active:opacity-[0.82] disabled:opacity-50 ${
                                                index > 0
                                                    ? 'dark:border-daf-border-dark border-l border-daf-border'
                                                    : ''
                                            } ${
                                                isSelected
                                                    ? 'bg-daf-brand'
                                                    : 'bg-white dark:bg-daf-surface-inverse'
                                            }`}
                                            disabled={
                                                operationIsPending ||
                                                offlineDownloadIsActive
                                            }
                                            onPress={() =>
                                                setSelectedMaxZoom(zoomLevel)
                                            }
                                            testID={`offline-map-max-zoom-${zoomLevel}`}
                                        >
                                            <Text
                                                adjustsFontSizeToFit
                                                className={`text-sm font-semibold ${
                                                    isSelected
                                                        ? 'text-daf-brand-contrast'
                                                        : 'text-neutral-700 dark:text-neutral-200'
                                                }`}
                                                minimumFontScale={0.8}
                                                numberOfLines={1}
                                            >
                                                {zoomLevel}
                                            </Text>
                                        </Pressable>
                                    );
                                },
                            )}
                        </View>
                    </View>

                    <View className="gap-3 rounded-dafMd bg-daf-surface-alt p-3 dark:bg-daf-surface-inverse">
                        <View className="flex-row items-center justify-between gap-3">
                            <View className="flex-row items-center gap-2">
                                <Icon
                                    color="#737373"
                                    name="hard-drive"
                                    size={14}
                                />
                                <Text className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                                    Storage
                                </Text>
                            </View>
                            <Text className="text-right text-sm font-semibold text-neutral-950 dark:text-white">
                                {storageLabel}
                            </Text>
                        </View>

                        <View className="flex-row items-center justify-between gap-3">
                            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                                Resources
                            </Text>
                            <Text className="text-right text-sm text-neutral-600 dark:text-neutral-300">
                                {resourceLabel}
                            </Text>
                        </View>

                        {hasOfflinePack && !selectionDiffersFromPack ? (
                            <View className="gap-1">
                                <View className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                                    <View
                                        className="h-2 rounded-full bg-daf-brand"
                                        style={{
                                            width: `${progressPercentage}%`,
                                        }}
                                    />
                                </View>
                                <Text className="text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                                    {progressLabel}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    {errorMessage ? (
                        <Text className="rounded-dafMd bg-red-50 px-3 py-2 text-sm font-semibold leading-5 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                            {errorMessage}
                        </Text>
                    ) : null}

                    <View className="gap-2">
                        <Pressable
                            accessibilityLabel={primaryActionLabel}
                            accessibilityRole="button"
                            className="min-h-12 flex-row items-center justify-center gap-2 rounded-dafMd bg-daf-brand px-4 active:opacity-[0.82] disabled:opacity-50"
                            disabled={primaryActionIsDisabled}
                            onPress={handlePrimaryOfflineAction}
                            testID="offline-map-primary-action"
                        >
                            <OfflineMapActionIcon
                                color="#ffffff"
                                icon="cloud-download"
                                isLoading={primaryButtonIsBusy}
                            />
                            <Text className="text-sm font-semibold text-daf-brand-contrast">
                                {primaryActionLabel}
                            </Text>
                        </Pressable>

                        {hasOfflinePack ? (
                            <Pressable
                                accessibilityLabel="Delete offline map"
                                accessibilityRole="button"
                                className="min-h-11 flex-row items-center justify-center gap-2 rounded-dafMd border border-red-200 px-4 active:opacity-[0.82] disabled:opacity-50 dark:border-red-900"
                                disabled={
                                    isDeletingOfflinePack ||
                                    isLoadingOfflinePack
                                }
                                onPress={handleDeletePress}
                                testID="offline-map-delete-action"
                            >
                                <OfflineMapActionIcon
                                    color="#FF4D4F"
                                    icon="trash"
                                    isLoading={isDeletingOfflinePack}
                                />
                                <Text className="text-sm font-semibold text-red-600 dark:text-red-300">
                                    Delete Offline Map
                                </Text>
                            </Pressable>
                        ) : null}
                    </View>
                </View>
            ) : null}
        </View>
    );
}
