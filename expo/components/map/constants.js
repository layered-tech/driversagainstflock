import {
    MAPBOX_STANDARD_LIGHT_PRESET_AUTO,
    MAPBOX_STANDARD_LIGHT_PRESET_DAWN,
    MAPBOX_STANDARD_LIGHT_PRESET_DAY,
    MAPBOX_STANDARD_LIGHT_PRESET_DUSK,
    MAPBOX_STANDARD_LIGHT_PRESET_NIGHT,
    MAPBOX_STANDARD_SATELLITE_STYLE_URL,
    MAPBOX_STANDARD_STYLE_URL,
} from './config';

export const DEFAULT_CENTER_COORDINATE = [-98.5795, 39.8283];
export const DEFAULT_ZOOM_LEVEL = 3.5;
export const MAX_ZOOM_LEVEL = 20;
export const MIN_ZOOM_LEVEL = 1;
export const ZOOM_STEP = 1;
export const MARKER_LOAD_DEBOUNCE_MS = 450;
export const MARKER_BOUNDS_BUFFER_RATIO = 0.25;
export const MARKER_BOUNDS_CONTAINMENT_EPSILON = 0.000001;
export const MAX_MARKER_REQUEST_LATITUDE_SPAN_DEGREES = 12;
export const MAX_MARKER_REQUEST_LONGITUDE_SPAN_DEGREES = 12;
export const MARKER_LOADING_FADE_DURATION_MS = 180;
export const MARKER_LOADING_MIN_VISIBLE_MS = 1000;
export const MARKER_CLUSTER_MAX_ZOOM_LEVEL = 15;
export const MARKER_CLUSTER_RADIUS = 48;
export const POLICE_ALERTS_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
export const POLICE_ALERTS_STALE_CHECK_INTERVAL_MS = 60 * 1000;
export const POLICE_ALERTS_REFETCH_DISTANCE_METERS = 4000;
export const POLICE_ALERT_GENERIC_IMAGE = 'police-alert-generic';
export const POLICE_ALERT_HIDING_IMAGE = 'police-alert-hiding';
export const POLICE_ALERT_HIDING_SUBTYPE = 'POLICE_HIDING';
export const MAX_MARKER_CONE_DIRECTIONS = 8;
export const MIN_BOUNDS_SPAN_DEGREES = 0.0005;
export const MAX_WEB_MERCATOR_LATITUDE = 85.05112878;
export const MAP_PREFERENCES_STORAGE_KEY =
    'driversagainstflock.mapPreferences.v1';
export const EMPTY_FEATURE_COLLECTION = {
    type: 'FeatureCollection',
    features: [],
};
export const MARKER_CLUSTER_FILTER = ['has', 'point_count'];
export const INDIVIDUAL_MARKER_FILTER = ['!', ['has', 'point_count']];
export const MARKER_CONE_DIRECTION_PROPERTY_NAMES = Array.from(
    { length: MAX_MARKER_CONE_DIRECTIONS },
    (_, index) => `coneDirection${index}`,
);
export const NAVIGATION_PUCK_BEARING_IMAGE = 'navigation-puck-bearing';
export const NAVIGATION_PUCK_SHADOW_IMAGE = 'navigation-puck-shadow';
export const NAVIGATION_PUCK_TOP_TRANSPARENT_IMAGE =
    'navigation-puck-top-transparent';
export const ANDROID_AUTO_NAVIGATION_PUCK_BEARING_IMAGE =
    'android-auto-navigation-puck-bearing';
export const ANDROID_AUTO_NAVIGATION_PUCK_SHADOW_IMAGE =
    'android-auto-navigation-puck-shadow';
export const ALPR_SYMBOL_IMAGE_NAME = 'falcon-alpr';
export const ALPR_SYMBOL_IMAGE_SOURCE = require('../../assets/map/falcon-alpr.png');
export const ALPR_SYMBOL_MIN_ZOOM_LEVEL = 16;
export const ALPR_SYMBOL_VISIBLE_PROPERTY_NAME = 'showsAlprSymbol';
export const ALPR_SYMBOL_ICON_OFFSET = [-35, 0];
export const ALPR_SYMBOL_ICON_SIZE_EXPRESSION = [
    'interpolate',
    ['linear'],
    ['zoom'],
    ALPR_SYMBOL_MIN_ZOOM_LEVEL,
    0.09,
    18,
    0.115,
    MAX_ZOOM_LEVEL,
    0.14,
];
export const MARKER_CLUSTER_CIRCLE_RADIUS_EXPRESSION = [
    'step',
    ['get', 'point_count'],
    18,
    10,
    22,
    30,
    26,
    100,
    31,
];
export const MARKER_DOT_RADIUS_EXPRESSION = [
    'interpolate',
    ['linear'],
    ['zoom'],
    1,
    3,
    8,
    4,
    13,
    5,
    17,
    6,
];
export const MARKER_DOT_STROKE_WIDTH_EXPRESSION = [
    'interpolate',
    ['linear'],
    ['zoom'],
    1,
    1.25,
    13,
    1.75,
    17,
    2.25,
];
export const MARKER_CONE_ZOOM_STYLES = [
    {
        minZoom: 0,
        imageName: 'marker-cone-z0',
        angle: 40,
        length: 32,
        color: '#FF4D4F',
        borderColor: '#E5383B',
        opacity: 0.32,
    },
    {
        minZoom: 17,
        imageName: 'marker-cone-z17',
        angle: 40,
        length: 64,
        color: '#FF4D4F',
        borderColor: '#E5383B',
        opacity: 0.32,
    },
    {
        minZoom: 18,
        imageName: 'marker-cone-z18',
        angle: 40,
        length: 96,
        color: '#FF4D4F',
        borderColor: '#E5383B',
        opacity: 0.32,
    },
    {
        minZoom: 19,
        imageName: 'marker-cone-z19',
        angle: 40,
        length: 192,
        color: '#FF4D4F',
        borderColor: '#E5383B',
        opacity: 0.32,
    },
];
export const MAP_LAYER_STYLES = [
    {
        key: 'standard',
        label: 'Standard',
        previewImageSource: require('../../assets/map/map-layer-standard.png'),
        styleURL: MAPBOX_STANDARD_STYLE_URL,
    },
    {
        key: 'standard-satellite',
        label: 'Standard Satellite',
        previewImageSource: require('../../assets/map/map-layer-standard-satellite.png'),
        styleURL: MAPBOX_STANDARD_SATELLITE_STYLE_URL,
    },
];
export const MAP_LIGHT_PRESET_OPTIONS = [
    {
        key: MAPBOX_STANDARD_LIGHT_PRESET_AUTO,
        label: 'Auto',
    },
    {
        key: MAPBOX_STANDARD_LIGHT_PRESET_DAWN,
        label: 'Dawn',
    },
    {
        key: MAPBOX_STANDARD_LIGHT_PRESET_DAY,
        label: 'Day',
    },
    {
        key: MAPBOX_STANDARD_LIGHT_PRESET_DUSK,
        label: 'Dusk',
    },
    {
        key: MAPBOX_STANDARD_LIGHT_PRESET_NIGHT,
        label: 'Night',
    },
];

export const MAP_CONTROL_BUTTON_SIZE = 48;
export const MAP_CONTROL_SURFACE_CLASS_NAME =
    'h-12 w-12 items-center justify-center rounded-dafSm border p-0 shadow-[0px_4px_14px_rgba(11,14,18,0.18)] elevation-[4]';
export const MAP_CONTROL_BUTTON_CLASS_NAME = `${MAP_CONTROL_SURFACE_CLASS_NAME} active:opacity-[0.82]`;
export const MAP_CONTROL_EDGE_OFFSET = 12;
export const MAP_SEARCH_TOP_OFFSET = 12;
export const MAP_SEARCH_BAR_HEIGHT = 52;
export const MAP_SEARCH_EXPANDED_HEIGHT = 350;
export const DIRECTIONS_ROUTE_SHEET_INITIAL_COVERAGE_RATIO = 0.47;
export const DIRECTIONS_ROUTE_SHEET_EXPANDED_COVERAGE_RATIO = 0.68;
export const DIRECTIONS_ROUTE_SHEET_SNAP_POINTS = [];
export const DIRECTIONS_SEARCH_HEADER_HEIGHT = MAP_SEARCH_BAR_HEIGHT;
export const DIRECTIONS_SEARCH_FIELD_HEIGHT = 44;
export const DIRECTIONS_SEARCH_FIELD_GAP = 8;
export const DIRECTIONS_SEARCH_BODY_GAP = 12;
export const DIRECTIONS_SEARCH_BODY_VERTICAL_PADDING = 24;
export const DIRECTIONS_SEARCH_SUBMIT_BUTTON_HEIGHT = 52;
export const DIRECTIONS_SEARCH_ROUTE_PANEL_HEIGHT =
    DIRECTIONS_SEARCH_HEADER_HEIGHT +
    DIRECTIONS_SEARCH_FIELD_HEIGHT * 2 +
    DIRECTIONS_SEARCH_FIELD_GAP +
    DIRECTIONS_SEARCH_BODY_GAP +
    DIRECTIONS_SEARCH_SUBMIT_BUTTON_HEIGHT +
    DIRECTIONS_SEARCH_BODY_VERTICAL_PADDING;
export const DIRECTIONS_ROUTE_CAMERA_TOP_GAP = 12;
export const DIRECTIONS_ROUTE_CAMERA_BOTTOM_GAP = 46;
export const DIRECTIONS_ROUTE_CAMERA_HORIZONTAL_PADDING = 28;
export const PLACE_SEARCH_MIN_QUERY_LENGTH = 2;
export const SEARCH_RESULTS_SHEET_INITIAL_COVERAGE_RATIO = 0.2;
export const SEARCH_RESULTS_SHEET_EXPANDED_COVERAGE_RATIO = 0.5;
export const SEARCH_RESULTS_SHEET_SNAP_POINTS = [
    `${SEARCH_RESULTS_SHEET_INITIAL_COVERAGE_RATIO * 100}%`,
    `${SEARCH_RESULTS_SHEET_EXPANDED_COVERAGE_RATIO * 100}%`,
];
export const SEARCH_RESULTS_CAMERA_TOP_GAP = 16;
export const SEARCH_RESULTS_CAMERA_BOTTOM_GAP = 12;
export const SEARCH_RESULTS_CAMERA_HORIZONTAL_PADDING = 36;
export const PLACE_RESULT_CAMERA_ANIMATION_DURATION_MS = 900;
export const PLACE_RESULT_ZOOM_LEVEL = 14;
export const PLACE_RATING_STAR_COUNT = 5;
export const DRIVING_DESTINATION_BAR_HEIGHT = 72;
export const DRIVING_DESTINATION_BOTTOM_PADDING = 16;
export const DRIVING_DESTINATION_SURFACE_HEIGHT = 132;
export const DRIVING_DESTINATION_CAMERA_GAP = MAP_CONTROL_EDGE_OFFSET;
export const MINIMUM_DRIVING_COURSE_SPEED_MPS = 1.5;
export const DRIVING_COURSE_HEADING_DEADBAND_DEGREES = 1.5;
export const DRIVING_COURSE_HEADING_SHARP_TURN_DEGREES = 35;
export const DRIVING_COURSE_HEADING_FILTER_FACTOR = 0.22;
export const DRIVING_COURSE_HEADING_SHARP_TURN_FILTER_FACTOR = 0.55;
