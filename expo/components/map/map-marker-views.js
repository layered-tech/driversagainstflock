import Mapbox from '@rnmapbox/maps';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { getStoredNumber, normalizeLongitude } from './geo';

const DIRECTIONS_WAYPOINT_MARKER_STYLES = {
    start: {
        fill: '#1FBF6B',
        inner: '#ffffff',
        label: 'Start marker',
        testID: 'map-directions-start-marker',
    },
    destination: {
        fill: '#7A5CFF',
        inner: '#ffffff',
        label: 'Destination marker',
        testID: 'map-directions-destination-marker',
    },
};
const DEFAULT_DIRECTIONS_WAYPOINT_MARKER_STYLE =
    DIRECTIONS_WAYPOINT_MARKER_STYLES.destination;

function getDirectionsWaypointMarkerStyle(role) {
    if (typeof role === 'string' && role.startsWith('stop')) {
        return {
            fill: '#FFB02E',
            inner: '#ffffff',
            label: 'Stop marker',
            testID: 'map-directions-stop-marker',
        };
    }

    return (
        DIRECTIONS_WAYPOINT_MARKER_STYLES[role] ??
        DEFAULT_DIRECTIONS_WAYPOINT_MARKER_STYLE
    );
}

export function getCoordinateKey(coordinate) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return '';
    }

    const longitude = Number(coordinate[0]);
    const latitude = Number(coordinate[1]);

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return '';
    }

    return `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
}

export function RouteWaypointMarker({ marker }) {
    const markerStyle = getDirectionsWaypointMarkerStyle(marker.role);
    const accessibilityLabel = [markerStyle.label, marker.title]
        .filter(Boolean)
        .join(': ');

    return (
        <Mapbox.MarkerView
            allowOverlap
            anchor={{ x: 0.5, y: 1 }}
            coordinate={marker.coordinate}
        >
            <View
                accessibilityLabel={accessibilityLabel}
                accessibilityRole="image"
                className="h-16 w-14 items-center justify-start"
                testID={markerStyle.testID}
            >
                <Svg height={58} viewBox="0 0 48 58" width={48}>
                    <Path
                        d="M24 56C21.5 51.9 7 36.4 7 23.5C7 13.9 14.6 6 24 6C33.4 6 41 13.9 41 23.5C41 36.4 26.5 51.9 24 56Z"
                        fill={markerStyle.fill}
                        stroke="#ffffff"
                        strokeWidth={3}
                    />
                    <Circle cx={24} cy={23} fill={markerStyle.inner} r={9} />
                    <Circle cx={24} cy={23} fill={markerStyle.fill} r={4.25} />
                </Svg>
            </View>
        </Mapbox.MarkerView>
    );
}

function getSubmittedSearchResultCoordinate(result) {
    const coordinate = result?.coordinate;

    if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return null;
    }

    const longitude = getStoredNumber(coordinate[0]);
    const latitude = getStoredNumber(coordinate[1]);

    if (
        longitude === null ||
        latitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return [normalizeLongitude(longitude), latitude];
}

export function SubmittedSearchResultMarker({ index, onPress, result }) {
    const coordinate = getSubmittedSearchResultCoordinate(result);

    if (!coordinate) {
        return null;
    }

    return (
        <Mapbox.MarkerView
            allowOverlap
            allowOverlapWithPuck
            anchor={{ x: 0.5, y: 1 }}
            coordinate={coordinate}
        >
            <Pressable
                accessibilityLabel={`Search result: ${result.primaryText || result.label}`}
                accessibilityRole="button"
                className="h-14 w-12 items-center justify-start"
                hitSlop={8}
                onPress={() => onPress(result)}
                testID={`submitted-search-result-marker-${index}`}
            >
                <Svg height={50} viewBox="0 0 48 58" width={42}>
                    <Path
                        d="M24 56C21.5 51.9 7 36.4 7 23.5C7 13.9 14.6 6 24 6C33.4 6 41 13.9 41 23.5C41 36.4 26.5 51.9 24 56Z"
                        fill="#7A5CFF"
                        stroke="#ffffff"
                        strokeWidth={3}
                    />
                    <Circle cx={24} cy={23} fill="#ffffff" r={8.5} />
                    <Circle cx={24} cy={23} fill="#7A5CFF" r={4} />
                </Svg>
            </Pressable>
        </Mapbox.MarkerView>
    );
}

export function E2EMarkerTapTarget({ feature, index, onPress }) {
    const coordinate = feature?.geometry?.coordinates;

    if (!Array.isArray(coordinate)) {
        return null;
    }

    const markerId = feature?.properties?.markerId ?? feature?.id ?? index;

    return (
        <Mapbox.MarkerView
            allowOverlap
            allowOverlapWithPuck
            anchor={{ x: 0.5, y: 0.5 }}
            coordinate={coordinate}
        >
            <Pressable
                accessible
                accessibilityHint="Opens the mocked marker details panel."
                accessibilityLabel={`Open ALPR marker ${markerId}`}
                accessibilityRole="button"
                className="h-12 w-12"
                collapsable={false}
                hitSlop={8}
                onPress={() => onPress({ features: [feature] })}
                testID={`map-marker-${index}-map`}
            />
        </Mapbox.MarkerView>
    );
}
