import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Text, useWindowDimensions, View } from 'react-native';
import { DafBadge } from '../design-system/primitives';
import { getMarkerCoordinate, getStoredNumber } from './geo';
import { useMarkerDetailsContext } from './map-screen-context';
import {
    NativeWindBottomSheetModal,
    NativeWindBottomSheetView,
} from './native-components';

const CARDINAL_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function formatCoordinate(coordinate) {
    if (!Array.isArray(coordinate)) {
        return '';
    }

    const longitude = Number(coordinate[0]);
    const latitude = Number(coordinate[1]);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return '';
    }

    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

function formatTagValue(value) {
    if (value === null || value === undefined) {
        return '';
    }

    if (typeof value === 'object') {
        return JSON.stringify(value);
    }

    return String(value).replace(/_/g, ' ');
}

function getOsmNodes(marker) {
    const nodes = marker?.properties?.osm_nodes;

    return Array.isArray(nodes) ? nodes : [];
}

function getFirstOsmFieldValue(osmNodes, keys) {
    for (const node of osmNodes) {
        const tags = node?.tags;

        if (!tags || typeof tags !== 'object' || Array.isArray(tags)) {
            continue;
        }

        for (const key of keys) {
            const value = formatTagValue(tags[key]);

            if (value) {
                return value;
            }
        }
    }

    return '';
}

function getManufacturer(osmNodes) {
    return getFirstOsmFieldValue(osmNodes, ['manufacturer', 'brand']);
}

function getOsmId(marker, osmNodes) {
    const markerOsmId = formatTagValue(
        marker?.properties?.osm_id ??
            marker?.properties?.node_id ??
            marker?.properties?.id,
    );

    if (markerOsmId) {
        return markerOsmId.startsWith('node/')
            ? markerOsmId
            : `node/${markerOsmId}`;
    }

    for (const node of osmNodes) {
        const nodeId = formatTagValue(node?.node_id ?? node?.id);

        if (nodeId) {
            return `node/${nodeId}`;
        }
    }

    return '';
}

function getDirectionDegrees(marker, osmNodes) {
    const markerProperties = marker?.properties ?? {};
    const directValue =
        markerProperties.direction ??
        markerProperties.heading ??
        getFirstOsmFieldValue(osmNodes, [
            'camera:direction',
            'camera:angle',
            'direction',
            'bearing',
        ]);
    const degrees = getStoredNumber(directValue);

    return degrees === null ? null : ((degrees % 360) + 360) % 360;
}

function getDirectionLabel(marker, osmNodes) {
    const degrees = getDirectionDegrees(marker, osmNodes);

    if (degrees === null) {
        return '';
    }

    const cardinalIndex = Math.round(degrees / 45) % CARDINAL_DIRECTIONS.length;
    const roundedDegrees = Math.round(degrees);

    return `${roundedDegrees} deg - facing ${CARDINAL_DIRECTIONS[cardinalIndex]}`;
}

function getUpdatedDate(marker) {
    const rawDate =
        marker?.properties?.updated_at ??
        marker?.properties?.created_at ??
        marker?.properties?.timestamp;
    const date = new Date(rawDate);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toISOString().slice(0, 10);
}

function AlprMarkerField({ label, mono = false, testID, value }) {
    return (
        <View className="min-w-0 gap-[3px]">
            <Text className="text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                {label}
            </Text>
            <Text
                className={`${mono ? 'font-dafMono' : ''} text-[13px] font-medium leading-5 text-daf-text-primary dark:text-white`}
                numberOfLines={2}
                selectable
                testID={testID}
            >
                {value || 'Unknown'}
            </Text>
        </View>
    );
}

export function MarkerDetailsSheet() {
    const { height: windowHeight } = useWindowDimensions();
    const {
        bottomSheetAnimatedPosition,
        bottomSheetBackgroundStyle,
        bottomSheetHandleIndicatorStyle,
        insets,
        mapPreferencesAreLoaded,
        markerDetailsSheetRef,
        markerDetailsSheetTrackingHandlers,
        selectedMarker,
    } = useMarkerDetailsContext();

    if (!mapPreferencesAreLoaded) {
        return null;
    }

    const coordinate = getMarkerCoordinate(selectedMarker);
    const coordinateLabel = formatCoordinate(coordinate);
    const osmNodes = getOsmNodes(selectedMarker);
    const manufacturer = getManufacturer(osmNodes) || 'Unknown';
    const directionLabel =
        getDirectionLabel(selectedMarker, osmNodes) || 'Not reported';
    const osmId = getOsmId(selectedMarker, osmNodes) || 'Unavailable';
    const updatedDate = getUpdatedDate(selectedMarker) || 'Unknown';
    const contentGap = 16;
    const bottomContentPadding = Math.max(insets.bottom + 12, 20);

    return (
        <NativeWindBottomSheetModal
            ref={markerDetailsSheetRef}
            accessible={false}
            index={0}
            // Intentionally no `snapPoints`: dynamic sizing gives a single content-fit
            // detent (capped at 68%), so the sheet cannot be dragged open any further.
            // `enablePanDownToClose` still lets the user drag it down to dismiss.
            enableDynamicSizing
            maxDynamicContentSize={windowHeight * 0.68}
            enableOverDrag={false}
            enablePanDownToClose
            backgroundStyle={bottomSheetBackgroundStyle}
            handleIndicatorStyle={bottomSheetHandleIndicatorStyle}
            animatedPosition={bottomSheetAnimatedPosition}
            onAnimate={markerDetailsSheetTrackingHandlers.onAnimate}
            onChange={markerDetailsSheetTrackingHandlers.onChange}
            onDismiss={markerDetailsSheetTrackingHandlers.onDismiss}
        >
            <NativeWindBottomSheetView className="dark:bg-daf-surface-dark bg-white">
                {selectedMarker ? (
                    <BottomSheetScrollView
                        contentContainerStyle={{
                            gap: contentGap,
                            paddingBottom: bottomContentPadding,
                            paddingHorizontal: 24,
                            paddingTop: 4,
                        }}
                        showsVerticalScrollIndicator={false}
                    >
                        <View className="gap-1">
                            <Text
                                className="font-dafDisplay text-[21px] font-bold leading-7 text-daf-text-primary dark:text-white"
                                numberOfLines={2}
                                testID="marker-details-title"
                            >
                                ALPR camera
                            </Text>
                            {coordinateLabel ? (
                                <Text
                                    className="font-dafMono text-[13px] leading-5 text-daf-text-secondary dark:text-neutral-300"
                                    numberOfLines={1}
                                    selectable
                                    testID="marker-details-subtitle"
                                >
                                    {coordinateLabel}
                                </Text>
                            ) : null}
                        </View>

                        <View className="flex-row flex-wrap gap-2">
                            <DafBadge tone="alert">ALPR</DafBadge>
                            {manufacturer ? (
                                <DafBadge tone="neutral">
                                    {manufacturer}
                                </DafBadge>
                            ) : null}
                        </View>

                        <View className="flex-row flex-wrap gap-x-4 gap-y-[14px]">
                            <View className="min-w-[128px] flex-1">
                                <AlprMarkerField
                                    label="Manufacturer"
                                    testID="marker-details-manufacturer-value"
                                    value={manufacturer}
                                />
                            </View>
                            <View className="min-w-[128px] flex-1">
                                <AlprMarkerField
                                    label="Direction"
                                    testID="marker-details-direction-value"
                                    value={directionLabel}
                                />
                            </View>
                            <View className="min-w-[128px] flex-1">
                                <AlprMarkerField
                                    label="OSM ID"
                                    mono
                                    testID="marker-details-osm-id-value"
                                    value={osmId}
                                />
                            </View>
                            <View className="min-w-[128px] flex-1">
                                <AlprMarkerField
                                    label="Updated"
                                    mono
                                    testID="marker-details-updated-value"
                                    value={updatedDate}
                                />
                            </View>
                        </View>
                    </BottomSheetScrollView>
                ) : null}
            </NativeWindBottomSheetView>
        </NativeWindBottomSheetModal>
    );
}
