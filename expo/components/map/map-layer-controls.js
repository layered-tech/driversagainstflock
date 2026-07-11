import { useMemo } from 'react';
import {
    Pressable,
    Switch,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import { Icon } from '../design-system/icon';
import {
    DafButton,
    DafChip,
    DafSectionLabel,
} from '../design-system/primitives';
import { MAP_LAYER_STYLES, MAP_LIGHT_PRESET_OPTIONS } from './constants';
import { MapControlButton } from './map-control-button';
import { MapLayerPreview, MapLayersIcon } from './map-layer-preview';
import { useMapLayerContext } from './map-screen-context';
import {
    NativeWindBottomSheetModal,
    NativeWindBottomSheetScrollView,
} from './native-components';
import { OfflineMapControls } from './offline-map-controls';

function SettingSwitchRow({ label, onValueChange, testID, value }) {
    return (
        <View className="min-h-11 flex-row items-center gap-3">
            <Switch
                accessibilityLabel={label}
                className="shrink-0"
                onValueChange={onValueChange}
                thumbColor="#ffffff"
                trackColor={{ false: '#D4D9DF', true: '#1FBF6B' }}
                value={value}
                testID={testID}
            />
            <Text className="min-w-0 flex-1 text-[15px] font-medium leading-5 text-daf-text-primary dark:text-white">
                {label}
            </Text>
        </View>
    );
}

export function MapLayerButton() {
    const {
        handleMapLayerPress,
        mapLayerAccessibilityLabel,
        mapLayerButtonClassName,
        mapLayerButtonGlassTintColor,
        mapLayerIconColor,
        mapPreferencesAreLoaded,
        selectedMapLayer,
    } = useMapLayerContext();

    if (!mapPreferencesAreLoaded) {
        return null;
    }

    return (
        <MapControlButton
            accessibilityHint="Opens map layer options."
            accessibilityLabel={mapLayerAccessibilityLabel}
            accessibilityRole="button"
            className={mapLayerButtonClassName}
            glassTintColor={mapLayerButtonGlassTintColor}
            onPress={handleMapLayerPress}
            testID="map-layer-button"
        >
            <MapLayersIcon
                color={mapLayerIconColor}
                layerKey={selectedMapLayer.key}
            />
        </MapControlButton>
    );
}

export function MapLayerSheet() {
    const { height: windowHeight } = useWindowDimensions();
    const mapSettingsSheetSnapPoints = useMemo(
        () => [Math.round(windowHeight * 0.68)],
        [windowHeight],
    );
    const {
        bottomSheetBackgroundStyle,
        bottomSheetHandleIndicatorStyle,
        cameraConesVisible,
        currentMapBounds,
        handleMapLayerSelect,
        handleMapLayerSheetDismiss,
        insets,
        layerSheetResetCount,
        layerSheetRef,
        markerClustersEnabled,
        mapLightPresetPreference,
        mapPreferencesAreLoaded,
        mapStyleURL,
        mapTrafficEnabled,
        policeAlertsVisible,
        preferPrivateRoutes,
        renderBackdrop,
        selectedMapLayer,
        setCameraConesVisible,
        setMarkerClustersEnabled,
        setMapLightPresetPreference,
        setMapTrafficEnabled,
        setPoliceAlertsVisible,
        setPreferPrivateRoutes,
        setSurveillanceMarkersVisible,
        surveillanceMarkersVisible,
    } = useMapLayerContext();

    if (!mapPreferencesAreLoaded) {
        return null;
    }

    const handleSurveillanceMarkersChange = (isVisible) => {
        setSurveillanceMarkersVisible(isVisible);

        if (!isVisible) {
            setMarkerClustersEnabled(false);
            setCameraConesVisible(false);
        }
    };
    const handleMarkerClustersChange = (isVisible) => {
        setMarkerClustersEnabled(isVisible);
    };
    const handleCameraConesChange = (isVisible) => {
        setCameraConesVisible(isVisible);
    };

    const handleResetPress = () => {
        setCameraConesVisible(true);
        setMarkerClustersEnabled(true);
        setPreferPrivateRoutes(false);
        setSurveillanceMarkersVisible(true);
        setMapTrafficEnabled(false);
        setPoliceAlertsVisible(false);
    };

    return (
        <NativeWindBottomSheetModal
            ref={layerSheetRef}
            accessible={false}
            enableDynamicSizing={false}
            snapPoints={mapSettingsSheetSnapPoints}
            enablePanDownToClose
            backdropComponent={renderBackdrop}
            backgroundStyle={bottomSheetBackgroundStyle}
            handleIndicatorStyle={bottomSheetHandleIndicatorStyle}
            onDismiss={handleMapLayerSheetDismiss}
        >
            <NativeWindBottomSheetScrollView
                className="dark:bg-daf-surface-dark bg-white"
                contentContainerStyle={{
                    gap: 16,
                    paddingBottom: insets.bottom + 16,
                    paddingHorizontal: 24,
                }}
                showsVerticalScrollIndicator={false}
            >
                <View className="gap-1">
                    <Text className="font-dafDisplay text-[21px] font-bold text-daf-text-primary dark:text-white">
                        Map settings
                    </Text>
                    <Text className="text-[13px] font-medium text-daf-text-secondary dark:text-neutral-300">
                        Customize what you see
                    </Text>
                </View>

                <View className="gap-0.5">
                    <SettingSwitchRow
                        label="Show surveillance markers"
                        onValueChange={handleSurveillanceMarkersChange}
                        testID="map-surveillance-markers-toggle"
                        value={surveillanceMarkersVisible}
                    />
                    <SettingSwitchRow
                        label="Cluster nearby markers"
                        onValueChange={handleMarkerClustersChange}
                        testID="map-marker-clusters-toggle"
                        value={markerClustersEnabled}
                    />
                    <SettingSwitchRow
                        label="Camera direction cones"
                        onValueChange={handleCameraConesChange}
                        testID="map-camera-cones-toggle"
                        value={cameraConesVisible}
                    />
                    <SettingSwitchRow
                        label="Prefer private routes"
                        onValueChange={setPreferPrivateRoutes}
                        value={preferPrivateRoutes}
                    />
                    <SettingSwitchRow
                        label="Traffic overlays"
                        onValueChange={setMapTrafficEnabled}
                        testID="map-traffic-toggle"
                        value={mapTrafficEnabled}
                    />
                    <SettingSwitchRow
                        label="Police reports (Waze)"
                        onValueChange={setPoliceAlertsVisible}
                        testID="map-police-alerts-toggle"
                        value={policeAlertsVisible}
                    />
                </View>

                <View className="gap-3">
                    <DafSectionLabel>Map layer</DafSectionLabel>
                    {MAP_LAYER_STYLES.map((mapLayer) => {
                        const isSelected = mapLayer.styleURL === mapStyleURL;

                        return (
                            <Pressable
                                key={mapLayer.key}
                                accessibilityLabel={`Use ${mapLayer.label} map layer`}
                                accessibilityRole="button"
                                accessibilityState={{ selected: isSelected }}
                                className={`min-h-[104px] flex-row items-center gap-3 rounded-dafMd border p-2 active:opacity-[0.82] ${
                                    isSelected
                                        ? 'bg-daf-brand/10 dark:bg-daf-brand/15 border-daf-brand dark:border-daf-brand'
                                        : 'dark:border-daf-border-dark dark:bg-daf-surface-dark border-daf-border bg-white'
                                }`}
                                onPress={() =>
                                    handleMapLayerSelect(mapLayer.styleURL)
                                }
                                testID={`map-layer-option-${mapLayer.key}`}
                            >
                                <View className="dark:border-daf-border-dark h-[84px] w-32 overflow-hidden rounded-dafSm border border-daf-border bg-daf-surface-alt dark:bg-daf-surface-inverse">
                                    <MapLayerPreview mapLayer={mapLayer} />
                                </View>

                                <View className="min-w-0 flex-1">
                                    <Text className="text-base font-semibold text-daf-text-primary dark:text-white">
                                        {mapLayer.label}
                                    </Text>
                                </View>

                                <View
                                    className={`h-6 w-6 items-center justify-center rounded-[12px] border ${
                                        isSelected
                                            ? 'border-daf-brand bg-daf-brand'
                                            : 'border-neutral-300 bg-white dark:border-neutral-700 dark:bg-daf-surface-inverse'
                                    }`}
                                >
                                    {isSelected ? (
                                        <Icon
                                            color="#0B0E12"
                                            name="check"
                                            size={13}
                                        />
                                    ) : null}
                                </View>
                            </Pressable>
                        );
                    })}
                </View>

                <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark gap-3 rounded-dafMd border border-daf-border bg-white p-4">
                    <View className="flex-row items-center justify-between gap-3">
                        <Text className="text-base font-semibold text-daf-text-primary dark:text-white">
                            Map's Time of Day
                        </Text>
                        <DafChip selected tone="brand">
                            Auto-safe
                        </DafChip>
                    </View>
                    <View className="dark:border-daf-border-dark flex-row overflow-hidden rounded-dafMd border border-daf-border bg-white dark:bg-daf-surface-inverse">
                        {MAP_LIGHT_PRESET_OPTIONS.map(
                            (lightPresetOption, index) => {
                                const isSelected =
                                    lightPresetOption.key ===
                                    mapLightPresetPreference;

                                return (
                                    <Pressable
                                        key={lightPresetOption.key}
                                        accessibilityLabel={`Use ${lightPresetOption.label} map light preset`}
                                        accessibilityRole="button"
                                        accessibilityState={{
                                            selected: isSelected,
                                        }}
                                        className={`min-h-11 flex-1 items-center justify-center px-1 active:opacity-[0.82] ${
                                            index > 0
                                                ? 'dark:border-daf-border-dark border-l border-daf-border'
                                                : ''
                                        } ${
                                            isSelected
                                                ? 'bg-daf-brand'
                                                : 'bg-white dark:bg-daf-surface-inverse'
                                        }`}
                                        onPress={() =>
                                            setMapLightPresetPreference(
                                                lightPresetOption.key,
                                            )
                                        }
                                        testID={`map-light-preset-option-${lightPresetOption.key}`}
                                    >
                                        <Text
                                            adjustsFontSizeToFit
                                            className={`text-[13px] font-semibold ${
                                                isSelected
                                                    ? 'text-daf-brand-contrast'
                                                    : 'text-daf-text-secondary dark:text-neutral-200'
                                            }`}
                                            minimumFontScale={0.78}
                                            numberOfLines={1}
                                        >
                                            {lightPresetOption.label}
                                        </Text>
                                    </Pressable>
                                );
                            },
                        )}
                    </View>
                </View>

                <OfflineMapControls
                    currentMapBounds={currentMapBounds}
                    mapStyleURL={mapStyleURL}
                    resetKey={layerSheetResetCount}
                    selectedMapLayer={selectedMapLayer}
                />

                <DafButton
                    accessibilityLabel="Reset map settings"
                    className="w-full"
                    onPress={handleResetPress}
                    testID="map-settings-reset-button"
                    variant="secondary"
                >
                    Reset
                </DafButton>
            </NativeWindBottomSheetScrollView>
        </NativeWindBottomSheetModal>
    );
}
