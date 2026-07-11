import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { Icon } from '../design-system/icon';
import { MARKER_CONE_ZOOM_STYLES } from './constants';

const MARKER_PREVIEW_SIZE = 56;
const MARKER_PREVIEW_CENTER = MARKER_PREVIEW_SIZE / 2;
const MARKER_PREVIEW_CONE_LENGTH = 24;
const MARKER_PREVIEW_DOT_RADIUS = 5;
const MARKER_PREVIEW_CARDINAL_DIRECTIONS = [0, 90, 180, 270];
const MARKER_PREVIEW_CONE_STYLE = MARKER_CONE_ZOOM_STYLES[0] ?? {
    angle: 40,
    borderColor: '#E5383B',
    color: '#FF4D4F',
    opacity: 0.32,
};

export function MarkerMetadataItem({ icon, iconColor, label, testID, value }) {
    if (value === '' || value === null || value === undefined) {
        return null;
    }

    return (
        <View className="dark:border-daf-border-dark min-w-[132px] flex-1 gap-1 rounded-dafMd border border-daf-border px-3 py-2">
            <View className="flex-row items-center gap-2">
                <Icon color={iconColor} name={icon} size={13} />
                <Text className="text-xs font-bold uppercase text-daf-text-tertiary dark:text-neutral-400">
                    {label}
                </Text>
            </View>
            <Text
                className="text-sm font-semibold leading-5 text-daf-text-primary dark:text-white"
                numberOfLines={2}
                selectable
                testID={testID}
            >
                {value}
            </Text>
        </View>
    );
}

function getConePoint(center, length, degreesFromNorth) {
    const radians = (degreesFromNorth * Math.PI) / 180;

    return {
        x: center + Math.sin(radians) * length,
        y: center - Math.cos(radians) * length,
    };
}

function normalizePreviewDirection(degrees) {
    return ((degrees % 360) + 360) % 360;
}

function getPreviewDirection(direction, currentMapBearing) {
    const bearing = Number.isFinite(currentMapBearing) ? currentMapBearing : 0;

    return normalizePreviewDirection(direction - bearing);
}

function getClockwiseDelta(fromDegrees, toDegrees) {
    return normalizePreviewDirection(toDegrees - fromDegrees);
}

function directionIsWithinCone(startDegrees, endDegrees, direction) {
    return (
        getClockwiseDelta(startDegrees, direction) <=
        getClockwiseDelta(startDegrees, endDegrees)
    );
}

function extendBounds(bounds, point) {
    return {
        maxX: Math.max(bounds.maxX, point.x),
        maxY: Math.max(bounds.maxY, point.y),
        minX: Math.min(bounds.minX, point.x),
        minY: Math.min(bounds.minY, point.y),
    };
}

function getPreviewGeometryOffset(directions, currentMapBearing) {
    let bounds = {
        maxX: MARKER_PREVIEW_CENTER + MARKER_PREVIEW_DOT_RADIUS,
        maxY: MARKER_PREVIEW_CENTER + MARKER_PREVIEW_DOT_RADIUS,
        minX: MARKER_PREVIEW_CENTER - MARKER_PREVIEW_DOT_RADIUS,
        minY: MARKER_PREVIEW_CENTER - MARKER_PREVIEW_DOT_RADIUS,
    };
    const halfAngle = MARKER_PREVIEW_CONE_STYLE.angle / 2;

    directions.forEach((direction) => {
        const previewDirection = getPreviewDirection(
            direction,
            currentMapBearing,
        );
        const startDirection = normalizePreviewDirection(
            previewDirection - halfAngle,
        );
        const endDirection = normalizePreviewDirection(
            previewDirection + halfAngle,
        );
        const boundaryDirections = [
            startDirection,
            endDirection,
            ...MARKER_PREVIEW_CARDINAL_DIRECTIONS.filter((cardinalDirection) =>
                directionIsWithinCone(
                    startDirection,
                    endDirection,
                    cardinalDirection,
                ),
            ),
        ];

        boundaryDirections.forEach((boundaryDirection) => {
            bounds = extendBounds(
                bounds,
                getConePoint(
                    MARKER_PREVIEW_CENTER,
                    MARKER_PREVIEW_CONE_LENGTH,
                    boundaryDirection,
                ),
            );
        });
    });

    return {
        x: MARKER_PREVIEW_CENTER - (bounds.minX + bounds.maxX) / 2,
        y: MARKER_PREVIEW_CENTER - (bounds.minY + bounds.maxY) / 2,
    };
}

function getConePath(direction, currentMapBearing) {
    const previewDirection = getPreviewDirection(direction, currentMapBearing);
    const halfAngle = MARKER_PREVIEW_CONE_STYLE.angle / 2;
    const leftPoint = getConePoint(
        MARKER_PREVIEW_CENTER,
        MARKER_PREVIEW_CONE_LENGTH,
        previewDirection - halfAngle,
    );
    const rightPoint = getConePoint(
        MARKER_PREVIEW_CENTER,
        MARKER_PREVIEW_CONE_LENGTH,
        previewDirection + halfAngle,
    );
    const largeArcFlag = MARKER_PREVIEW_CONE_STYLE.angle > 180 ? 1 : 0;

    return [
        `M ${MARKER_PREVIEW_CENTER} ${MARKER_PREVIEW_CENTER}`,
        `L ${leftPoint.x.toFixed(2)} ${leftPoint.y.toFixed(2)}`,
        `A ${MARKER_PREVIEW_CONE_LENGTH} ${MARKER_PREVIEW_CONE_LENGTH} 0 ${largeArcFlag} 1 ${rightPoint.x.toFixed(2)} ${rightPoint.y.toFixed(2)}`,
        'Z',
    ].join(' ');
}

export function MarkerDirectionPreview({ currentMapBearing, directions }) {
    const directionLabel = directions.length
        ? `Direction ${directions.join(', ')} degrees`
        : 'Direction unavailable';
    const geometryOffset = getPreviewGeometryOffset(
        directions,
        currentMapBearing,
    );

    return (
        <View
            accessibilityLabel={`ALPR marker preview. ${directionLabel}.`}
            accessibilityRole="image"
            className="h-[56px] w-[56px] shrink-0 items-center justify-center"
            testID="marker-details-direction-preview"
        >
            <Svg
                height={MARKER_PREVIEW_SIZE}
                viewBox={`0 0 ${MARKER_PREVIEW_SIZE} ${MARKER_PREVIEW_SIZE}`}
                width={MARKER_PREVIEW_SIZE}
            >
                <G
                    transform={`translate(${geometryOffset.x.toFixed(2)} ${geometryOffset.y.toFixed(2)})`}
                >
                    {directions.map((direction, index) => (
                        <Path
                            key={`${direction}-${index}`}
                            d={getConePath(direction, currentMapBearing)}
                            fill={MARKER_PREVIEW_CONE_STYLE.color}
                            fillOpacity={MARKER_PREVIEW_CONE_STYLE.opacity}
                            stroke={MARKER_PREVIEW_CONE_STYLE.borderColor}
                            strokeLinejoin="round"
                            strokeWidth={1.25}
                        />
                    ))}
                    <Circle
                        cx={MARKER_PREVIEW_CENTER}
                        cy={MARKER_PREVIEW_CENTER}
                        fill="#FF4D4F"
                        r={MARKER_PREVIEW_DOT_RADIUS}
                        stroke="#ffffff"
                        strokeWidth={2.5}
                    />
                </G>
            </Svg>
        </View>
    );
}

export function CollapsedOsmDetails({
    detailItems,
    expanded,
    onToggle,
    searchIconColor,
}) {
    if (detailItems.length === 0) {
        return null;
    }

    return (
        <View className="dark:border-daf-border-dark overflow-hidden rounded-dafMd border border-daf-border">
            <Pressable
                accessibilityHint={
                    expanded
                        ? 'Collapses OSM technical details.'
                        : 'Expands OSM technical details.'
                }
                accessibilityLabel="OSM technical details"
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                className={`min-h-12 flex-row items-center justify-between gap-3 px-3 py-2 active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse ${
                    expanded
                        ? 'dark:border-daf-border-dark border-b border-daf-border'
                        : ''
                }`}
                onPress={onToggle}
                testID="marker-details-osm-details-toggle"
            >
                <View className="min-w-0 flex-1 flex-row items-center gap-2">
                    <Icon color={searchIconColor} name="tag" size={13} />
                    <Text className="text-sm font-bold uppercase text-daf-text-tertiary dark:text-neutral-400">
                        OSM Details
                    </Text>
                </View>
                <Icon
                    color="#737373"
                    name={expanded ? 'chevron-down' : 'chevron-down'}
                    style={{
                        transform: [{ rotate: expanded ? '180deg' : '0deg' }],
                    }}
                    size={13}
                />
            </Pressable>

            {expanded ? (
                <View className="flex-row flex-wrap gap-2 p-3">
                    {detailItems.map((item) => (
                        <MarkerMetadataItem
                            key={item.label}
                            icon="tag"
                            iconColor={searchIconColor}
                            label={item.label}
                            value={item.value}
                        />
                    ))}
                </View>
            ) : null}
        </View>
    );
}
