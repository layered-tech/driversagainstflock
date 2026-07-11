<script setup>
import DafBadge from '@/Components/Daf/DafBadge.vue';
import DafButton from '@/Components/Daf/DafButton.vue';
import DafIcon from '@/Components/Daf/DafIcon.vue';
import DafIconButton from '@/Components/Daf/DafIconButton.vue';
import DafSiteHeader from '@/Components/Daf/DafSiteHeader.vue';
import DafSegmentedControl from '@/Components/Daf/DafSegmentedControl.vue';
import DafSwitch from '@/Components/Daf/DafSwitch.vue';
import DafBottomSheet from '@/Components/Daf/Map/DafBottomSheet.vue';
import DafMarkerLoadingProgress from '@/Components/Daf/Map/DafMarkerLoadingProgress.vue';
import DafNodeStatusBadge from '@/Components/Daf/Map/DafNodeStatusBadge.vue';
import DafRouteCard from '@/Components/Daf/Map/DafRouteCard.vue';
import DafSearchBar from '@/Components/Daf/Map/DafSearchBar.vue';
import { applyDafTheme, applySystemDafTheme } from '@/design-system/theme';
import { Head } from '@inertiajs/vue3';
import axios from 'axios';
import mapboxgl from 'mapbox-gl';
import {
    computed,
    onBeforeUnmount,
    onMounted,
    ref,
    shallowRef,
    toRaw,
    watch,
} from 'vue';

const props = defineProps({
    points: {
        type: Array,
        default: () => [],
    },
    canLogin: {
        type: Boolean,
        default: false,
    },
    canRegister: {
        type: Boolean,
        default: false,
    },
    user: {
        type: Object,
        default: () => null,
    },
});

const accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
const MAX_MARKER_REQUEST_LATITUDE_SPAN_DEGREES = 40;
const MAX_MARKER_REQUEST_LONGITUDE_SPAN_DEGREES = 40;
const MARKER_CONE_DISTANCE_METERS = 125;
const MARKER_CONE_SPREAD_DEGREES = 28;
const EARTH_RADIUS_METERS = 6371008.8;
const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;
const NEARBY_NODE_RADIUS_FEET = 1500;
const NEARBY_NODE_RADIUS_METERS = NEARBY_NODE_RADIUS_FEET / FEET_PER_METER;
const NEARBY_NODE_RADIUS_LABEL = '1,500 ft';
const DEFAULT_AVOID_BUFFER_METERS = 50;
const MIN_AVOID_BUFFER_METERS = 25;
const MAX_AVOID_BUFFER_METERS = 1000;
const AVOID_BUFFER_STEP_METERS = 25;
const SEARCH_DEBOUNCE_MS = 240;
const MAPBOX_STANDARD_STYLE = 'mapbox://styles/mapbox/standard';
const MAPBOX_STANDARD_SATELLITE_STYLE =
    'mapbox://styles/mapbox/standard-satellite';
const MAP_LAYER_EMISSIVE_STRENGTH = 1;
const MARKER_SPLASH_SETTLE_DELAY_MS = 800;
const LOCALITY_BOUNDARY_FIT_BUFFER_RATIO = 0.2;
const ALLOW_ALPR_NEAR_START_DESTINATION_LABEL =
    'Allow ALPR near Start & Destination';
const GENERIC_ALPR_PROFILE = {
    id: 'generic-alpr',
    name: 'ALPR (any)',
    tags: {
        'surveillance:type': 'ALPR',
    },
};
const PRICE_LEVEL_LABELS = {
    PRICE_LEVEL_FREE: 'Free',
    PRICE_LEVEL_INEXPENSIVE: '$',
    PRICE_LEVEL_MODERATE: '$$',
    PRICE_LEVEL_EXPENSIVE: '$$$',
    PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};
const EMPTY_FEATURE_COLLECTION = {
    type: 'FeatureCollection',
    features: [],
};
const ROUTE_KEYS = {
    fastest: 'direct',
    private: 'ideal',
};
const MAP_STYLE_OPTIONS = [
    {
        description: 'Vector streets and labels',
        label: 'Mapbox Standard Map',
        preview: 'standard',
        value: 'standard',
    },
    {
        description: 'Satellite imagery with labels',
        label: 'Mapbox Standard Satellite',
        preview: 'satellite',
        value: 'satellite',
    },
];
const MAP_TIME_OF_DAY_OPTIONS = [
    { label: 'Auto', value: 'auto' },
    { label: 'Dawn', value: 'dawn' },
    { label: 'Day', value: 'day' },
    { label: 'Dusk', value: 'dusk' },
    { label: 'Night', value: 'night' },
];
const MARKER_LOADING_STAGES = [
    { key: 'map', label: 'Starting map' },
    { key: 'layers', label: 'Preparing camera layers' },
    { key: 'bounds', label: 'Reading map bounds' },
    { key: 'markers', label: 'Loading camera markers' },
    { key: 'render', label: 'Rendering markers' },
    { key: 'ready', label: 'Camera markers ready' },
];
const CURRENT_LOCATION_WAYPOINT_ID = 'current-location';
const initialZipCode = initialZipCodeFromUrl();
const initialSelectedMarker = initialSelectedMarkerFromUrl();
const INITIAL_DIRECTION_WAYPOINTS = [
    {
        coordinate: null,
        id: CURRENT_LOCATION_WAYPOINT_ID,
        place: null,
        usesCurrentLocation: true,
        value: 'Your location',
    },
    {
        coordinate: null,
        id: 'destination',
        place: null,
        usesCurrentLocation: false,
        value: '',
    },
];
const ADDRESS_PLACE_TYPES = new Set([
    'intersection',
    'postal_code',
    'premise',
    'route',
    'street_address',
    'street_number',
    'subpremise',
]);
const PLACE_ICON_TYPES = [
    {
        icon: 'coffee',
        types: [
            'bakery',
            'bar',
            'cafe',
            'coffee_shop',
            'meal_takeaway',
            'restaurant',
        ],
    },
    {
        icon: 'fuel',
        types: ['electric_vehicle_charging_station', 'gas_station'],
    },
    {
        icon: 'home',
        types: ['lodging'],
    },
    {
        icon: 'briefcase',
        types: ['bank', 'city_hall', 'courthouse', 'local_government_office'],
    },
    {
        icon: 'star',
        types: [
            'amusement_park',
            'museum',
            'park',
            'tourist_attraction',
            'zoo',
        ],
    },
    {
        icon: 'map-pin',
        types: [
            'airport',
            'bus_station',
            'light_rail_station',
            'subway_station',
            'train_station',
            'transit_station',
        ],
    },
];

const mapContainer = ref(null);
const map = shallowRef(null);
const mapLoaded = ref(false);
const mapStatus = ref('Loading map');
const mapMessage = ref('');
const activeMode = ref('map');
const mapOptionsOpen = ref(false);
const mapStyle = ref('standard');
const mapTimeOfDay = ref('auto');
const markerLoadMode = ref(null);
const markerRequestsInFlight = ref(0);
const markerLoadingStage = ref(MARKER_LOADING_STAGES[0].key);
const currentPosition = ref(null);
const centeredOnCurrentPosition = ref(false);
const searchQuery = ref('');
const searchResults = ref([]);
const searchIsLoading = ref(false);
const searchError = ref('');
const voiceIsListening = ref(false);
const selectedMarker = ref(initialSelectedMarkerValue(initialSelectedMarker));
const pendingSelectedMarkerId = ref(initialSelectedMarker?.id ?? '');
const pendingSelectedMarkerOsmId = ref(initialSelectedMarker?.osmId ?? '');
const selectedPlace = ref(null);
const selectedPlaceDetailsIsLoading = ref(false);
const directionsRoute = ref(null);
const selectedRouteKey = ref(ROUTE_KEYS.private);
const directionsIsLoading = ref(false);
const directionsError = ref('');
const directionsNotice = ref('');
const avoidBufferMeters = ref(DEFAULT_AVOID_BUFFER_METERS);
const allowAlprNearStartDestination = ref(true);
const advancedSettingsOpen = ref(false);
const routePanelIsCollapsed = ref(false);
const markerPanelIsCollapsed = ref(false);
const markerFeatures = ref(EMPTY_FEATURE_COLLECTION);
const markerConeFeatures = ref(EMPTY_FEATURE_COLLECTION);
const localityBoundary = ref(null);
const localityBoundaryActiveZipCode = ref('');
const localityBoundaryIsLoading = ref(false);
const localityBoundaryError = ref('');
const localityBoundaryMessage = ref('');
const initialMarkersLoaded = ref(false);
const directionWaypoints = ref(initialDirectionWaypoints());
const activeDirectionWaypointId = ref(null);
const draggingDirectionWaypointId = ref(null);

let searchDebounceTimer = null;
let geolocationWatchId = null;
let voiceRecognition = null;
let interactionsAreBound = false;
let moveEndIsBound = false;
let directionWaypointNextId = 1;
let markerSplashFrameId = null;
let markerSplashTimeoutId = null;
let systemThemeMediaQuery = null;

const mapHeaderLinks = [
    { label: 'John Doe', href: '/#johndoe' },
    { label: 'How it works', href: '/#how' },
    { label: 'Android Auto', href: '/#android-auto' },
    { label: 'Apps', href: '/#apps' },
    { label: 'FAQ', href: '/#faq' },
    { label: 'Hotlist', href: '/hotlist' },
    { label: 'Contribute', href: '/help' },
];

const segmentOptions = [
    { label: 'Map', value: 'map', icon: 'layers' },
    { label: 'Directions', value: 'directions', icon: 'navigation' },
];

const selectedMapStyleUrl = computed(() =>
    mapStyle.value === 'satellite'
        ? MAPBOX_STANDARD_SATELLITE_STYLE
        : MAPBOX_STANDARD_STYLE,
);

const routeOptions = computed(() => {
    const routes = directionsRoute.value?.routes ?? {};

    return [ROUTE_KEYS.private, ROUTE_KEYS.fastest]
        .map((routeKey) => routes[routeKey])
        .filter((route) => route?.coordinates?.length >= 2);
});

const routeSelectionCardIsVisible = computed(
    () =>
        activeMode.value === 'directions' &&
        (routeOptions.value.length > 0 ||
            directionsIsLoading.value ||
            Boolean(directionsError.value)),
);

const routePanelClasses = computed(() => [
    'pointer-events-auto relative w-[calc(100%_-_22px)] transition-transform duration-200 ease-out motion-reduce:transition-none sm:absolute sm:bottom-5 sm:left-5 sm:w-[26rem]',
    routePanelIsCollapsed.value
        ? '-translate-x-[calc(100%_-_1.375rem)] sm:-translate-x-[calc(100%_+_1.25rem_-_1.375rem)]'
        : 'translate-x-0',
]);

const markerPanelClasses = computed(() => [
    'relative w-full transition-transform duration-200 ease-out motion-reduce:transition-none',
    markerPanelIsCollapsed.value
        ? 'translate-x-[calc(100%_-_1.375rem)] sm:translate-x-[calc(100%_+_1.25rem_-_1.375rem)]'
        : 'translate-x-0',
]);

const detailPanelStackClasses =
    'pointer-events-auto relative ml-[22px] flex w-[calc(100%_-_22px)] flex-col items-end gap-2 self-end sm:absolute sm:bottom-5 sm:right-5 sm:ml-0 sm:w-[25rem]';

const routePanelToggleLabel = computed(() =>
    routePanelIsCollapsed.value ? 'Show route options' : 'Hide route options',
);

const markerPanelToggleLabel = computed(() =>
    markerPanelIsCollapsed.value
        ? 'Show selected details'
        : 'Hide selected details',
);

const selectedDetailItemIsVisible = computed(
    () => Boolean(selectedMarker.value) || Boolean(selectedPlace.value),
);

const selectedRoute = computed(() => {
    return (
        routeOptions.value.find(
            (route) => route.routeKey === selectedRouteKey.value,
        ) ??
        routeOptions.value[0] ??
        null
    );
});

const fastestRouteNodeCount = computed(
    () => directionsRoute.value?.fastestRouteNodeCount ?? 0,
);

const visibleMarkerCount = computed(() => markerFeatures.value.features.length);

const visibleMarkerCountLabel = computed(() =>
    visibleMarkerCount.value.toLocaleString(),
);

const markersAreLoading = computed(() => markerRequestsInFlight.value > 0);

const avoidBufferLabel = computed(
    () => `${avoidBufferMeters.value.toLocaleString()} m`,
);

const avoidBufferImperialLabel = computed(
    () =>
        `${Math.round(avoidBufferMeters.value * FEET_PER_METER).toLocaleString()} ft`,
);

const searchPlaceholder = computed(() =>
    activeMode.value === 'directions'
        ? 'Search destination for private route'
        : 'Search a place or address',
);

const directionWaypointRows = computed(() => {
    const waypoints = directionWaypoints.value;
    const destinationIndex = waypoints.length - 1;

    return waypoints.map((waypoint, index) => {
        const isDestination = index === destinationIndex;

        return {
            id: waypoint.id,
            canRemove:
                index > 0 && !isDestination && !waypoint.usesCurrentLocation,
            isActive: activeDirectionWaypointId.value === waypoint.id,
            isDestination,
            isOrigin: index === 0,
            isStop: index > 0 && !isDestination,
            placeholder:
                index === 0
                    ? 'Choose starting point'
                    : isDestination
                      ? 'Choose destination'
                      : 'Add stop',
            showConnector: index < destinationIndex,
            usesCurrentLocation: waypoint.usesCurrentLocation,
            value: waypoint.value,
        };
    });
});

const zipCodeSearchSuggestion = computed(() => {
    const zipCode = fiveDigitZipCode(searchQuery.value);

    if (activeMode.value !== 'map' || !zipCode) {
        return null;
    }

    if (localityBoundaryActiveZipCode.value === zipCode) {
        return null;
    }

    return {
        key: `zip-locality-${zipCode}`,
        meta: 'ZIP',
        sublabel: 'Highlight the city boundary',
        title: `Show locality for ${zipCode}`,
        zipCode,
    };
});

const searchPanelIsVisible = computed(
    () =>
        Boolean(zipCodeSearchSuggestion.value) ||
        searchIsLoading.value ||
        searchError.value ||
        searchResults.value.length > 0,
);

const mapSplashIsVisible = computed(() => !initialMarkersLoaded.value);

const nodeTotalsCardIsVisible = computed(
    () => initialMarkersLoaded.value && !mapStatus.value,
);

const displayedSearchResults = computed(() =>
    searchResults.value.map((result) => ({
        icon: getPlaceIcon(result),
        key:
            result.id ??
            result.name ??
            result.formattedAddress ??
            getPlaceDisplayName(result),
        meta: getPlaceDistance(result),
        raw: result,
        sublabel: getPlaceAddress(result),
        title: getPlaceDisplayName(result),
    })),
);

const selectedPlaceData = computed(() => selectedPlace.value?.place ?? null);

const selectedPlaceCoordinate = computed(
    () => selectedPlace.value?.coordinate ?? null,
);

const selectedPlaceIsAddress = computed(() =>
    placeIsAddress(selectedPlaceData.value),
);

const selectedPlaceTitle = computed(() =>
    getPlaceDisplayName(selectedPlaceData.value),
);

const selectedPlaceAddressLabel = computed(() =>
    getPlaceAddress(selectedPlaceData.value),
);

const selectedPlaceCoordinateLabel = computed(() =>
    formatMarkerCoordinates(selectedPlaceCoordinate.value),
);

const selectedPlaceIconName = computed(() =>
    selectedPlaceIsAddress.value
        ? 'home'
        : getPlaceIcon(selectedPlaceData.value),
);

const selectedPlaceTypeLabel = computed(() =>
    getPlaceTypeLabel(selectedPlaceData.value),
);

const selectedPlaceAreaLabel = computed(
    () =>
        addressAreaFromPlace(selectedPlaceData.value) ??
        selectedPlaceTypeLabel.value,
);

const selectedPlacePriceLabel = computed(() =>
    formatPlacePrice(selectedPlaceData.value?.priceLevel),
);

const selectedPlaceRatingValueLabel = computed(() =>
    formatPlaceRatingValue(selectedPlaceData.value),
);

const selectedPlaceRatingCountLabel = computed(() =>
    formatPlaceRatingCount(selectedPlaceData.value),
);

const selectedPlaceOpenStatusLabel = computed(() =>
    formatPlaceOpenStatus(selectedPlaceData.value),
);

const selectedPlaceCategoryPriceLabel = computed(() =>
    [selectedPlaceTypeLabel.value, selectedPlacePriceLabel.value]
        .filter(Boolean)
        .join(' · '),
);

const selectedPlaceNeighborhoodLabel = computed(
    () => neighborhoodFromPlace(selectedPlaceData.value) ?? 'Unknown',
);

const selectedPlacePhoneLabel = computed(
    () =>
        selectedPlaceData.value?.nationalPhoneNumber ??
        selectedPlaceData.value?.internationalPhoneNumber ??
        'Unavailable',
);

const selectedPlaceWebsiteLabel = computed(() =>
    formatWebsiteHost(selectedPlaceData.value?.websiteUri),
);

const selectedPlaceGoogleMapsUrl = computed(
    () => selectedPlaceData.value?.googleMapsUri ?? '',
);

const selectedPlacePostalCode = computed(
    () => postalCodeFromPlace(selectedPlaceData.value) ?? 'Unknown',
);

const selectedPlaceCountyLabel = computed(
    () => countyFromPlace(selectedPlaceData.value) ?? 'Unknown',
);

const selectedPlacePlusCodeLabel = computed(
    () => plusCodeFromPlace(selectedPlaceData.value) ?? 'Unknown',
);

const selectedPlaceBusinessFields = computed(() => {
    if (!selectedPlaceData.value) {
        return [];
    }

    return [
        {
            label: 'Hours',
            mono: false,
            value: selectedPlaceOpenStatusLabel.value,
        },
        {
            label: 'Phone',
            mono: false,
            value: selectedPlacePhoneLabel.value,
        },
        {
            brand: true,
            label: 'Website',
            mono: false,
            value: selectedPlaceWebsiteLabel.value,
        },
        {
            label: 'Neighborhood',
            mono: false,
            value: selectedPlaceNeighborhoodLabel.value,
        },
    ];
});

const selectedPlaceResidentialFields = computed(() => {
    if (!selectedPlaceData.value) {
        return [];
    }

    return [
        {
            label: 'Neighborhood',
            mono: false,
            value: selectedPlaceNeighborhoodLabel.value,
        },
        {
            label: 'ZIP',
            mono: true,
            value: selectedPlacePostalCode.value,
        },
        {
            label: 'County',
            mono: false,
            value: selectedPlaceCountyLabel.value,
        },
        {
            label: 'Plus code',
            mono: true,
            value: selectedPlacePlusCodeLabel.value,
        },
    ];
});

const selectedPlaceNearbyNodeCount = computed(() => {
    const coordinate = selectedPlaceCoordinate.value;

    if (!coordinate) {
        return 0;
    }

    return markerFeatures.value.features.filter((feature) => {
        const markerCoordinate = normalizeLngLat(
            feature?.geometry?.coordinates,
        );

        return (
            markerCoordinate &&
            distanceBetweenCoordinates(coordinate, markerCoordinate) <=
                NEARBY_NODE_RADIUS_METERS
        );
    }).length;
});

const selectedPlaceNearbyNodeCountLabel = computed(() => {
    const count = selectedPlaceNearbyNodeCount.value;

    return `${count.toLocaleString()} ALPR ${count === 1 ? 'camera' : 'cameras'}`;
});

const selectedMarkerNormalizedHeading = computed(() =>
    normalizeHeading(
        selectedMarker.value?.properties?.heading ??
            selectedMarker.value?.properties?.bearing,
    ),
);

const selectedMarkerCoordinateLabel = computed(() =>
    formatMarkerCoordinates(selectedMarker.value?.coordinates),
);

const selectedMarkerOsmNode = computed(() =>
    firstArrayItem(arrayProperty(selectedMarker.value?.properties?.osm_nodes)),
);

const selectedMarkerTags = computed(() =>
    objectProperty(selectedMarkerOsmNode.value?.tags),
);

const selectedMarkerManufacturer = computed(
    () =>
        markerTagValue(selectedMarkerTags.value, [
            'manufacturer',
            'brand',
            'operator',
        ]) ?? 'Flock Safety',
);

const selectedMarkerDirection = computed(() => {
    if (selectedMarkerNormalizedHeading.value === null) {
        return 'Unknown';
    }

    const heading = Math.round(selectedMarkerNormalizedHeading.value);

    return `${heading} deg - facing ${cardinalDirection(heading)}`;
});

const selectedMarkerOsmId = computed(
    () =>
        selectedMarker.value?.properties?.osm_id ??
        selectedMarkerOsmNode.value?.node_id ??
        null,
);

const selectedMarkerOsmIdLabel = computed(() =>
    selectedMarkerOsmId.value ? `node/${selectedMarkerOsmId.value}` : 'Unknown',
);

const selectedMarkerUpdatedLabel = computed(() =>
    formatMarkerDate(
        selectedMarker.value?.properties?.updated_at ??
            selectedMarker.value?.properties?.created_at,
    ),
);

const selectedMarkerOsmUrl = computed(() =>
    selectedMarkerOsmId.value
        ? `https://www.openstreetmap.org/node/${encodeURIComponent(selectedMarkerOsmId.value)}`
        : '',
);

const selectedMarkerFields = computed(() => [
    {
        label: 'Manufacturer',
        mono: false,
        value: selectedMarkerManufacturer.value,
    },
    {
        label: 'Direction',
        mono: false,
        value: selectedMarkerDirection.value,
    },
    {
        label: 'OSM ID',
        mono: true,
        value: selectedMarkerOsmIdLabel.value,
    },
    {
        label: 'Updated',
        mono: true,
        value: selectedMarkerUpdatedLabel.value,
    },
]);

const floatingMapMessage = computed(
    () => localityBoundaryMessage.value || mapMessage.value,
);

onMounted(() => {
    setMarkerPoints(toRaw(props.points));
    window.addEventListener('keydown', handleMapOptionsKeydown);
    bindSystemThemeListener();
    applyUiThemeForMapTimeOfDay();

    if (initialZipCode || initialSelectedMarker) {
        centeredOnCurrentPosition.value = true;
    }

    if (initialZipCode) {
        searchQuery.value = initialZipCode;
    }

    initializeMap();
});

watch(activeMode, handleActiveModeChanged);

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleMapOptionsKeydown);
    unbindSystemThemeListener();

    if (searchDebounceTimer) {
        window.clearTimeout(searchDebounceTimer);
    }

    if (geolocationWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(geolocationWatchId);
    }

    if (voiceRecognition) {
        voiceRecognition.stop();
    }

    if (markerSplashFrameId !== null) {
        window.cancelAnimationFrame(markerSplashFrameId);
        markerSplashFrameId = null;
    }

    if (markerSplashTimeoutId !== null) {
        window.clearTimeout(markerSplashTimeoutId);
        markerSplashTimeoutId = null;
    }

    if (map.value) {
        map.value.remove();
    }
});

function initializeMap() {
    if (!accessToken) {
        mapStatus.value = 'Map token is not configured';
        initialMarkersLoaded.value = true;

        return;
    }

    mapboxgl.accessToken = accessToken;

    const instance = new mapboxgl.Map({
        attributionControl: false,
        center: initialSelectedMarker?.coordinates ?? [-98.5795, 39.8283],
        config: {
            basemap: {
                lightPreset: currentMapLightPreset(),
            },
        },
        container: mapContainer.value,
        cooperativeGestures: false,
        pitch: 0,
        style: selectedMapStyleUrl.value,
        zoom: initialSelectedMarker ? 13.4 : 3.4,
    });

    map.value = instance;
    instance.scrollZoom.enable();

    instance.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        'bottom-right',
    );

    instance.on('load', () => {
        mapLoaded.value = true;
        mapStatus.value = '';
        markerLoadingStage.value = 'layers';
        refreshRuntimeLayers();
        bindMapInteractions();
        bindMoveEndMarkerLoading();
        instance.on('idle', syncVisibleMarkerCones);
        getMarkers();
        requestCurrentLocation();

        if (initialZipCode) {
            loadLocalityBoundary(initialZipCode);
        }
    });

    instance.on('style.load', () => {
        if (!mapLoaded.value) {
            return;
        }

        refreshRuntimeLayers();
    });

    instance.on('error', () => {
        if (!mapLoaded.value) {
            mapStatus.value = 'Map tiles are temporarily unavailable';
            completeInitialMarkerLoad();

            return;
        }

        mapMessage.value = 'Map tiles are temporarily unavailable';
    });
}

function refreshRuntimeLayers() {
    addRuntimeSourcesAndLayers();
    syncMapLayerColors();
    syncMarkerSources();
    syncCurrentLocationSource();
    syncDestinationSource();
    syncRouteSources();
    syncSelectedMarkerSource();
    syncLocalityBoundarySource();
    updateRouteLayerStyles();
}

function bindMoveEndMarkerLoading() {
    if (moveEndIsBound || !map.value) {
        return;
    }

    map.value.on('moveend', getMarkers);
    moveEndIsBound = true;
}

function bindMapInteractions() {
    if (interactionsAreBound || !map.value) {
        return;
    }

    map.value.on('click', 'daf-marker-dot', (event) => {
        const feature = event.features?.[0] ?? null;

        if (!feature) {
            return;
        }

        clearPendingSelectedMarker();
        setSelectedMarkerFromFeature(feature);
    });

    map.value.on('click', 'daf-marker-cluster', (event) => {
        const feature = event.features?.[0] ?? null;
        const clusterId = feature?.properties?.cluster_id;
        const source = map.value?.getSource('source-markers');

        if (!feature || clusterId === undefined || !source) {
            return;
        }

        source.getClusterExpansionZoom(clusterId, (error, zoom) => {
            if (error || !map.value) {
                return;
            }

            map.value.easeTo({
                center: feature.geometry.coordinates,
                duration: 400,
                zoom,
            });
        });
    });

    map.value.on('mouseenter', 'daf-marker-dot', () => {
        map.value.getCanvas().style.cursor = 'pointer';
    });

    map.value.on('mouseleave', 'daf-marker-dot', () => {
        map.value.getCanvas().style.cursor = '';
    });

    interactionsAreBound = true;
}

function addRuntimeSourcesAndLayers() {
    const instance = map.value;

    if (!instance || instance.getSource('source-markers')) {
        return;
    }

    const colors = mapColors();

    instance.addSource('source-route-direct', {
        data: EMPTY_FEATURE_COLLECTION,
        type: 'geojson',
    });
    instance.addSource('source-route-ideal', {
        data: EMPTY_FEATURE_COLLECTION,
        type: 'geojson',
    });
    instance.addSource('source-marker-cones', {
        data: EMPTY_FEATURE_COLLECTION,
        type: 'geojson',
    });
    instance.addSource('source-markers', {
        cluster: true,
        clusterMaxZoom: 15,
        data: EMPTY_FEATURE_COLLECTION,
        type: 'geojson',
    });
    instance.addSource('source-current-location', {
        data: EMPTY_FEATURE_COLLECTION,
        type: 'geojson',
    });
    instance.addSource('source-destination', {
        data: EMPTY_FEATURE_COLLECTION,
        type: 'geojson',
    });
    instance.addSource('source-selected-marker', {
        data: EMPTY_FEATURE_COLLECTION,
        type: 'geojson',
    });
    instance.addSource('source-locality-boundary', {
        data: EMPTY_FEATURE_COLLECTION,
        type: 'geojson',
    });

    addRouteLayerPair('direct', 'source-route-direct', {
        casing: colors.routeFastCasing,
        line: colors.routeFast,
    });
    addRouteLayerPair('ideal', 'source-route-ideal', {
        casing: colors.routePrivateCasing,
        line: colors.routePrivate,
    });

    instance.addLayer({
        id: 'daf-locality-boundary-fill',
        paint: {
            'fill-color': colors.brand,
            'fill-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'fill-opacity': 0.18,
        },
        source: 'source-locality-boundary',
        type: 'fill',
    });

    instance.addLayer({
        id: 'daf-locality-boundary-outline',
        paint: {
            'line-color': colors.nodeMonitored,
            'line-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'line-opacity': 0.92,
            'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.5, 13, 3],
        },
        source: 'source-locality-boundary',
        type: 'line',
    });

    instance.addLayer({
        id: 'daf-marker-cones-fill',
        minzoom: 11,
        paint: {
            'fill-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'fill-color': colors.markerCone,
            'fill-opacity': 1,
        },
        source: 'source-marker-cones',
        type: 'fill',
    });

    instance.addLayer({
        id: 'daf-marker-cones-outline',
        minzoom: 11,
        paint: {
            'line-color': colors.markerConeEdge,
            'line-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'line-opacity': 0.85,
            'line-width': 1.4,
        },
        source: 'source-marker-cones',
        type: 'line',
    });

    instance.addLayer({
        filter: ['has', 'point_count'],
        id: 'daf-marker-cluster',
        paint: {
            'circle-color': colors.markerAlpr,
            'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'circle-opacity': 0.92,
            'circle-radius': [
                'step',
                ['get', 'point_count'],
                19,
                25,
                24,
                100,
                30,
            ],
            'circle-stroke-color': colors.surfaceMarker,
            'circle-stroke-width': 2,
        },
        source: 'source-markers',
        type: 'circle',
    });

    instance.addLayer({
        filter: ['has', 'point_count'],
        id: 'daf-marker-cluster-count',
        layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12,
        },
        paint: {
            'text-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'text-color': '#ffffff',
        },
        source: 'source-markers',
        type: 'symbol',
    });

    instance.addLayer({
        filter: ['!', ['has', 'point_count']],
        id: 'daf-marker-halo',
        paint: {
            'circle-color': colors.markerAlprGlow,
            'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'circle-opacity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                6,
                0.22,
                15,
                0.42,
            ],
            'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                6,
                8,
                15,
                18,
            ],
        },
        source: 'source-markers',
        type: 'circle',
    });

    instance.addLayer({
        filter: ['!', ['has', 'point_count']],
        id: 'daf-marker-dot',
        paint: {
            'circle-color': colors.markerAlpr,
            'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 5, 16, 9],
            'circle-stroke-color': colors.surfaceMarker,
            'circle-stroke-width': 2,
        },
        source: 'source-markers',
        type: 'circle',
    });

    instance.addLayer({
        id: 'daf-destination-halo',
        paint: {
            'circle-color': colors.markerDestination,
            'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'circle-opacity': 0.22,
            'circle-radius': 20,
        },
        source: 'source-destination',
        type: 'circle',
    });

    instance.addLayer({
        id: 'daf-destination-dot',
        paint: {
            'circle-color': colors.markerDestination,
            'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'circle-radius': 8,
            'circle-stroke-color': colors.surfaceMarker,
            'circle-stroke-width': 2,
        },
        source: 'source-destination',
        type: 'circle',
    });

    instance.addLayer({
        id: 'daf-current-location-halo',
        paint: {
            'circle-color': colors.markerUserHalo,
            'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'circle-radius': 24,
        },
        source: 'source-current-location',
        type: 'circle',
    });

    instance.addLayer({
        id: 'daf-current-location-dot',
        paint: {
            'circle-color': colors.markerUser,
            'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'circle-radius': 8,
            'circle-stroke-color': colors.surfaceMarker,
            'circle-stroke-width': 2,
        },
        source: 'source-current-location',
        type: 'circle',
    });

    instance.addLayer({
        id: 'daf-selected-marker-ring',
        paint: {
            'circle-color': colors.surfaceMarker,
            'circle-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'circle-radius': 8,
            'circle-stroke-color': colors.nodeMonitored,
            'circle-stroke-width': 4,
        },
        source: 'source-selected-marker',
        type: 'circle',
    });
}

function addRouteLayerPair(routeKey, source, colors) {
    const instance = map.value;

    instance.addLayer({
        id: `daf-route-${routeKey}-casing`,
        layout: {
            'line-cap': 'round',
            'line-join': 'round',
        },
        paint: {
            'line-color': colors.casing,
            'line-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'line-opacity': 0,
            'line-width': ['interpolate', ['linear'], ['zoom'], 4, 6, 17, 12],
        },
        source,
        type: 'line',
    });

    instance.addLayer({
        id: `daf-route-${routeKey}`,
        layout: {
            'line-cap': 'round',
            'line-join': 'round',
        },
        paint: {
            'line-color': colors.line,
            'line-emissive-strength': MAP_LAYER_EMISSIVE_STRENGTH,
            'line-opacity': 0,
            'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 17, 8],
        },
        source,
        type: 'line',
    });
}

function requestCurrentLocation() {
    if (!navigator.geolocation) {
        mapMessage.value =
            'Location is unavailable. Search and routes can use the map center.';

        return;
    }

    navigator.geolocation.getCurrentPosition(
        handleLocationChanged,
        () => {
            mapMessage.value =
                'Location is unavailable. Search and routes can use the map center.';
        },
        {
            enableHighAccuracy: true,
            maximumAge: 30000,
            timeout: 7000,
        },
    );

    geolocationWatchId = navigator.geolocation.watchPosition(
        handleLocationChanged,
        () => {},
        {
            enableHighAccuracy: true,
            maximumAge: 10000,
            timeout: 10000,
        },
    );
}

function handleLocationChanged(position) {
    currentPosition.value = position;
    mapMessage.value = '';
    syncCurrentLocationSource();

    if (!centeredOnCurrentPosition.value && map.value) {
        centeredOnCurrentPosition.value = true;
        map.value.easeTo({
            center: [position.coords.longitude, position.coords.latitude],
            duration: 700,
            pitch: 0,
            zoom: 11,
        });
    }
}

function queueSearch(query) {
    searchError.value = '';

    if (searchDebounceTimer) {
        window.clearTimeout(searchDebounceTimer);
    }

    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
        clearLocalityBoundary();
    }

    if (trimmedQuery.length < 2) {
        searchResults.value = [];
        searchIsLoading.value = false;

        return;
    }

    searchDebounceTimer = window.setTimeout(() => {
        searchPlaces(query);
    }, SEARCH_DEBOUNCE_MS);
}

async function searchPlaces(query) {
    const textQuery = query.trim();

    if (!textQuery) {
        return;
    }

    searchIsLoading.value = true;
    searchError.value = '';

    try {
        const payload = {
            textQuery,
        };
        const locationBias = getSearchLocationBias();

        if (locationBias) {
            payload.locationBias = locationBias;
        }

        const response = await axios.post('/search', payload);
        searchResults.value = response.data?.places ?? [];
    } catch {
        searchResults.value = [];
        searchError.value = 'Search is temporarily unavailable.';
    } finally {
        searchIsLoading.value = false;
    }
}

async function submitSearch(query) {
    const zipCode = fiveDigitZipCode(query);

    if (zipCode) {
        await selectZipCodeSearchSuggestion(zipCode);

        return;
    }

    if (searchResults.value.length > 0) {
        await selectSearchResult(searchResults.value[0]);

        return;
    }

    await searchPlaces(query);
}

async function selectSearchResult(result) {
    const coordinate = getPlaceCoordinate(result);

    if (!coordinate) {
        searchError.value = 'That result does not include a map location.';

        return;
    }

    clearPendingSelectedMarker();
    selectedMarker.value = null;
    selectedPlace.value = null;
    selectedPlaceDetailsIsLoading.value = false;
    searchResults.value = [];

    if (activeMode.value === 'directions') {
        setDirectionWaypointResult(
            activeDirectionWaypointId.value ?? directionDestinationWaypointId(),
            result,
            coordinate,
        );
        syncDestinationSource();
        await maybeLoadDirectionsRoute();

        return;
    }

    searchQuery.value = getPlaceDisplayName(result);
    setSelectedPlace(result, coordinate);
    clearLocalityBoundary();
    clearLoadedDirectionsRoute();

    map.value?.easeTo({
        center: coordinate,
        duration: 500,
        zoom: Math.max(map.value.getZoom(), 12),
    });
}

function setSelectedPlace(place, coordinate) {
    selectedPlace.value = {
        coordinate,
        key: selectedPlaceKey(place),
        place,
    };
    selectedPlaceDetailsIsLoading.value = false;
    markerPanelIsCollapsed.value = false;
    syncSelectedMarkerSource();
    syncDestinationSource();
    updateRouteLayerStyles();
    loadSelectedPlaceDetails(place);
}

function selectedPlaceKey(place) {
    return (
        place?.id ??
        place?.name ??
        place?.formattedAddress ??
        getPlaceDisplayName(place)
    );
}

async function loadSelectedPlaceDetails(place) {
    const placeId = place?.id;

    if (!placeId) {
        return;
    }

    const selectedKey = selectedPlaceKey(place);

    selectedPlaceDetailsIsLoading.value = true;

    try {
        const response = await axios.get(
            `/api/place/${encodeURIComponent(placeId)}`,
        );

        if (selectedPlace.value?.key !== selectedKey) {
            return;
        }

        selectedPlace.value = {
            ...selectedPlace.value,
            place: {
                ...place,
                ...(response.data ?? {}),
            },
        };
    } catch {
        // The search result contains enough data for the card fallback.
    } finally {
        if (selectedPlace.value?.key === selectedKey) {
            selectedPlaceDetailsIsLoading.value = false;
        }
    }
}

async function startDirectionsToSelectedPlace() {
    const place = selectedPlaceData.value;
    const coordinate = selectedPlaceCoordinate.value;

    if (!place || !coordinate) {
        return;
    }

    activeMode.value = 'directions';
    activeDirectionWaypointId.value = directionDestinationWaypointId();
    setDirectionWaypointResult(
        directionDestinationWaypointId(),
        place,
        coordinate,
    );
    searchResults.value = [];
    searchError.value = '';
    searchIsLoading.value = false;
    syncDestinationSource();

    await maybeLoadDirectionsRoute();
}

async function selectZipCodeSearchSuggestion(zipCode) {
    if (searchDebounceTimer) {
        window.clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
    }

    searchQuery.value = zipCode;
    searchResults.value = [];
    searchError.value = '';
    searchIsLoading.value = false;

    await loadLocalityBoundary(zipCode);
}

function handleActiveModeChanged() {
    if (searchDebounceTimer) {
        window.clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
    }

    searchResults.value = [];
    searchError.value = '';
    searchIsLoading.value = false;
    syncDestinationSource();
    updateRouteLayerStyles();
}

function addDirectionStop() {
    const waypoints = directionWaypoints.value.slice();
    const id = `stop-${directionWaypointNextId++}`;

    waypoints.splice(waypoints.length - 1, 0, {
        coordinate: null,
        id,
        place: null,
        usesCurrentLocation: false,
        value: '',
    });

    directionWaypoints.value = waypoints;
    activeDirectionWaypointId.value = id;
    searchResults.value = [];
    clearLoadedDirectionsRoute();
}

async function removeDirectionWaypoint(id) {
    directionWaypoints.value = directionWaypoints.value.filter(
        (waypoint) => waypoint.id !== id || waypoint.usesCurrentLocation,
    );
    searchResults.value = [];
    clearLoadedDirectionsRoute();
    syncDestinationSource();
    await maybeLoadDirectionsRoute();
}

function updateDirectionWaypoint(id, value) {
    activeDirectionWaypointId.value = id;
    directionWaypoints.value = directionWaypoints.value.map((waypoint) =>
        waypoint.id === id && !waypoint.usesCurrentLocation
            ? {
                  ...waypoint,
                  coordinate: null,
                  place: null,
                  value,
              }
            : waypoint,
    );

    clearLoadedDirectionsRoute();
    syncDestinationSource();

    if (!value.trim()) {
        searchResults.value = [];
        searchIsLoading.value = false;

        return;
    }

    queueSearch(value);
}

async function submitDirectionWaypoint(waypoint) {
    activeDirectionWaypointId.value = waypoint.id;

    if (searchResults.value.length > 0) {
        await selectSearchResult(searchResults.value[0]);

        return;
    }

    await searchPlaces(waypoint.value);
}

function directionDestinationWaypointId() {
    return directionWaypoints.value[directionWaypoints.value.length - 1]?.id;
}

function resetDirectionWaypoints() {
    directionWaypoints.value = initialDirectionWaypoints();
    activeDirectionWaypointId.value = null;
    draggingDirectionWaypointId.value = null;
}

function initialDirectionWaypoints() {
    return INITIAL_DIRECTION_WAYPOINTS.map((waypoint) => ({ ...waypoint }));
}

function activateDirectionWaypointSearch(id) {
    activeDirectionWaypointId.value = id;
    searchResults.value = [];
    searchError.value = '';
}

function setDirectionWaypointResult(id, result, coordinate) {
    directionWaypoints.value = directionWaypoints.value.map((waypoint) =>
        waypoint.id === id && !waypoint.usesCurrentLocation
            ? {
                  ...waypoint,
                  coordinate,
                  place: result,
                  value: getPlaceDisplayName(result),
              }
            : waypoint,
    );
}

async function startDirectionWaypointDrag(id, event) {
    draggingDirectionWaypointId.value = id;

    try {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
    } catch {
        // Drag metadata can be unavailable in some browser automation contexts.
    }
}

function dragOverDirectionWaypoint(targetId, event) {
    event.preventDefault();

    const draggedId = draggingDirectionWaypointId.value;

    if (!draggedId || draggedId === targetId) {
        return;
    }

    const waypoints = directionWaypoints.value.slice();
    const fromIndex = waypoints.findIndex(
        (waypoint) => waypoint.id === draggedId,
    );
    const toIndex = waypoints.findIndex((waypoint) => waypoint.id === targetId);

    if (fromIndex < 0 || toIndex < 0) {
        return;
    }

    const [dragged] = waypoints.splice(fromIndex, 1);
    waypoints.splice(toIndex, 0, dragged);
    directionWaypoints.value = waypoints;
}

async function dropDirectionWaypoint(event) {
    event.preventDefault();
    draggingDirectionWaypointId.value = null;
    clearLoadedDirectionsRoute();
    syncDestinationSource();
    await maybeLoadDirectionsRoute();
}

function endDirectionWaypointDrag() {
    draggingDirectionWaypointId.value = null;
}

function clearSearch() {
    searchResults.value = [];
    searchError.value = '';
    clearSelectedPlace();
    clearLocalityBoundary();
    clearDirections();

    if (voiceRecognition) {
        voiceRecognition.stop();
    }
}

function startVoiceSearch() {
    const SpeechRecognition =
        window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        searchError.value = 'Voice search is not supported by this browser.';

        return;
    }

    if (voiceRecognition && voiceIsListening.value) {
        voiceRecognition.stop();

        return;
    }

    const recognition = new SpeechRecognition();

    voiceRecognition = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-US';

    recognition.onstart = () => {
        voiceIsListening.value = true;
        searchError.value = '';
    };
    recognition.onend = () => {
        voiceIsListening.value = false;
    };
    recognition.onerror = () => {
        searchError.value = 'Voice search could not hear a query.';
    };
    recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim() ?? '';

        if (!transcript) {
            return;
        }

        if (activeMode.value === 'directions') {
            updateDirectionWaypoint(
                activeDirectionWaypointId.value ??
                    directionDestinationWaypointId(),
                transcript,
            );

            return;
        }

        searchQuery.value = transcript;
        searchPlaces(transcript);
    };

    recognition.start();
}

async function maybeLoadDirectionsRoute() {
    if (!directionWaypointsAreReady()) {
        clearLoadedDirectionsRoute();

        return;
    }

    await getDirections();
}

async function getDirections() {
    const coordinates = directionRouteCoordinates();

    if (!coordinates) {
        directionsError.value =
            'Choose a starting point, destination, and any stops first.';

        return;
    }

    const startCoordinate = coordinates[0];
    const endCoordinate = coordinates[coordinates.length - 1];
    const waypointCoordinates = coordinates.slice(1, -1);

    routePanelIsCollapsed.value = false;
    directionsIsLoading.value = true;
    directionsError.value = '';

    try {
        const response = await axios.post('/api/v1/directions', {
            avoid_buffer: avoidBufferMeters.value,
            allow_alpr_near_start_destination:
                allowAlprNearStartDestination.value,
            continue_straight: true,
            end: {
                latitude: endCoordinate[1],
                longitude: endCoordinate[0],
            },
            profile: [GENERIC_ALPR_PROFILE],
            show_zone: false,
            start: {
                latitude: startCoordinate[1],
                longitude: startCoordinate[0],
            },
            waypoints: waypointCoordinates.map((coordinate) => ({
                latitude: coordinate[1],
                longitude: coordinate[0],
            })),
        });
        const normalizedRoute = normalizeDirectionsRouteResponse(
            response.data?.result ?? response.data,
        );

        directionsRoute.value = normalizedRoute;
        selectedRouteKey.value = normalizedRoute.selectedRouteKey;
        syncRouteSources();
        updateRouteLayerStyles();
        fitMapToSelectedRoute();
    } catch {
        directionsRoute.value = null;
        syncRouteSources();
        directionsError.value = 'Directions are temporarily unavailable.';
    } finally {
        directionsIsLoading.value = false;
    }
}

async function handleAvoidBufferChanged() {
    await maybeLoadDirectionsRoute();
}

async function handleAllowAlprNearStartDestinationChanged(value) {
    allowAlprNearStartDestination.value = value;
    await maybeLoadDirectionsRoute();
}

function toggleRoutePanel() {
    routePanelIsCollapsed.value = !routePanelIsCollapsed.value;
}

function toggleMarkerPanel() {
    markerPanelIsCollapsed.value = !markerPanelIsCollapsed.value;
}

function clearSelectedMarker() {
    clearPendingSelectedMarker();
    selectedMarker.value = null;
    markerPanelIsCollapsed.value = false;
    syncSelectedMarkerSource();
}

function clearSelectedPlace() {
    selectedPlace.value = null;
    selectedPlaceDetailsIsLoading.value = false;
    markerPanelIsCollapsed.value = false;
    syncDestinationSource();
    updateRouteLayerStyles();
}

function selectRoute(routeKey) {
    selectedRouteKey.value = routeKey;
    directionsRoute.value = selectDirectionsRoute(
        directionsRoute.value,
        routeKey,
    );
    updateRouteLayerStyles();
    fitMapToSelectedRoute();
}

function clearDirections() {
    directionsRoute.value = null;
    directionsError.value = '';
    directionsNotice.value = '';
    selectedRouteKey.value = ROUTE_KEYS.private;
    resetDirectionWaypoints();
    setDestinationCoordinate(null);
    syncRouteSources();
    updateRouteLayerStyles();
    activeMode.value = 'map';
}

function clearLoadedDirectionsRoute() {
    directionsRoute.value = null;
    directionsError.value = '';
    directionsNotice.value = '';
    selectedRouteKey.value = ROUTE_KEYS.private;
    syncRouteSources();
    updateRouteLayerStyles();
}

function openMapOptions() {
    mapOptionsOpen.value = true;
}

function closeMapOptions() {
    mapOptionsOpen.value = false;
}

function handleMapOptionsKeydown(event) {
    if (event.key === 'Escape' && mapOptionsOpen.value) {
        event.preventDefault();
        closeMapOptions();
    }
}

function selectMapStyle(style) {
    if (mapStyle.value === style) {
        return;
    }

    mapStyle.value = style;
    applyMapStyle();
}

function selectMapTimeOfDay(timeOfDay) {
    if (mapTimeOfDay.value === timeOfDay) {
        return;
    }

    mapTimeOfDay.value = timeOfDay;
    applyUiThemeForMapTimeOfDay();
    applyMapLightPreset();
}

function bindSystemThemeListener() {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        systemThemeMediaQuery = window.matchMedia(
            '(prefers-color-scheme: dark)',
        );
        systemThemeMediaQuery.addEventListener(
            'change',
            handleSystemThemeChanged,
        );
    } catch {
        systemThemeMediaQuery = null;
    }
}

function unbindSystemThemeListener() {
    if (!systemThemeMediaQuery) {
        return;
    }

    try {
        systemThemeMediaQuery.removeEventListener(
            'change',
            handleSystemThemeChanged,
        );
    } catch {
        // Ignore browsers that do not support media query listener removal.
    }

    systemThemeMediaQuery = null;
}

function handleSystemThemeChanged() {
    if (mapTimeOfDay.value === 'auto') {
        applyUiThemeForMapTimeOfDay();
    }
}

function applyUiThemeForMapTimeOfDay() {
    const theme =
        mapTimeOfDay.value === 'auto'
            ? applySystemDafTheme()
            : applyDafTheme(uiThemeForMapTimeOfDay(mapTimeOfDay.value));

    window.dispatchEvent(
        new CustomEvent('daf-theme-change', {
            detail: { theme },
        }),
    );
    syncMapLayerColors();
    updateRouteLayerStyles();
}

function uiThemeForMapTimeOfDay(timeOfDay) {
    return ['dawn', 'day'].includes(timeOfDay) ? 'light' : 'dark';
}

function applyMapStyle() {
    reloadMapStyle();
}

function reloadMapStyle() {
    const instance = map.value;

    if (!instance) {
        return false;
    }

    try {
        instance.setStyle(selectedMapStyleUrl.value, {
            config: mapStyleConfig(),
        });

        return true;
    } catch {
        mapMessage.value = 'Map style is temporarily unavailable.';

        return false;
    }
}

function applyMapLightPreset() {
    const instance = map.value;

    if (!instance) {
        return;
    }

    const lightPreset = currentMapLightPreset();

    try {
        if (typeof instance.setConfigProperty === 'function') {
            instance.setConfigProperty('basemap', 'lightPreset', lightPreset);
        } else {
            reloadMapStyle();
        }
    } catch {
        reloadMapStyle();
    }

    syncMapLayerColors();
    updateRouteLayerStyles();
}

function mapStyleConfig() {
    return {
        basemap: {
            lightPreset: currentMapLightPreset(),
        },
    };
}

function zoomIn() {
    map.value?.easeTo({
        duration: 240,
        zoom: map.value.getZoom() + 1,
    });
}

function zoomOut() {
    map.value?.easeTo({
        duration: 240,
        zoom: map.value.getZoom() - 1,
    });
}

function locateUser() {
    if (currentPosition.value && map.value) {
        map.value.easeTo({
            center: [
                currentPosition.value.coords.longitude,
                currentPosition.value.coords.latitude,
            ],
            duration: 500,
            pitch: 0,
            zoom: Math.max(map.value.getZoom(), 12),
        });

        return;
    }

    requestCurrentLocation();
}

async function loadLocalityBoundary(zipCode) {
    const normalizedZipCode = normalizeZipCode(zipCode);

    if (!normalizedZipCode) {
        return;
    }

    localityBoundaryIsLoading.value = true;
    localityBoundaryActiveZipCode.value = normalizedZipCode;
    localityBoundaryError.value = '';
    localityBoundaryMessage.value = `Finding the city boundary for ${normalizedZipCode}...`;

    try {
        const response = await axios.get('/api/locality-boundary', {
            params: {
                zip: normalizedZipCode,
            },
        });
        const normalizedBoundary = normalizeLocalityBoundaryResponse(
            response.data,
        );

        if (!normalizedBoundary) {
            throw new Error('Boundary response was missing geometry.');
        }

        localityBoundary.value = normalizedBoundary;
        clearPendingSelectedMarker();
        selectedMarker.value = null;
        selectedPlace.value = null;
        selectedPlaceDetailsIsLoading.value = false;
        markerPanelIsCollapsed.value = false;
        syncDestinationSource();
        syncSelectedMarkerSource();
        syncLocalityBoundarySource();
        setZipCodeInUrl(normalizedZipCode);
        fitMapToLocalityBoundary(normalizedBoundary.bounds);

        localityBoundaryMessage.value = `Showing the ${normalizedBoundary.name} boundary.`;
    } catch (error) {
        localityBoundary.value = null;
        localityBoundaryActiveZipCode.value = '';
        syncLocalityBoundarySource();

        localityBoundaryError.value =
            error?.response?.status === 404
                ? `No city boundary was found for ${normalizedZipCode}.`
                : 'City boundary lookup is temporarily unavailable.';
        localityBoundaryMessage.value = localityBoundaryError.value;
    } finally {
        localityBoundaryIsLoading.value = false;
    }
}

function normalizeLocalityBoundaryResponse(payload) {
    const featureCollection = normalizeFeatureCollection(payload?.boundary);
    const bounds =
        normalizeBoundaryBounds(payload?.bounds) ??
        geoJsonFeatureCollectionBounds(featureCollection);

    if (!featureCollection.features.length || !bounds) {
        return null;
    }

    return {
        bounds,
        featureCollection,
        name: payload?.name ?? payload?.zip ?? 'selected locality',
        zip: payload?.zip ?? '',
    };
}

function normalizeFeatureCollection(value) {
    if (value?.type === 'FeatureCollection' && Array.isArray(value.features)) {
        return value;
    }

    if (value?.type === 'Feature') {
        return {
            type: 'FeatureCollection',
            features: [value],
        };
    }

    if (['Polygon', 'MultiPolygon'].includes(value?.type)) {
        return {
            type: 'FeatureCollection',
            features: [
                {
                    geometry: value,
                    properties: {},
                    type: 'Feature',
                },
            ],
        };
    }

    return EMPTY_FEATURE_COLLECTION;
}

function normalizeBoundaryBounds(bounds) {
    const sw = normalizeLngLat(bounds?.sw);
    const ne = normalizeLngLat(bounds?.ne);

    if (!sw || !ne) {
        return null;
    }

    return new mapboxgl.LngLatBounds(sw, ne);
}

function geoJsonFeatureCollectionBounds(featureCollection) {
    const bounds = new mapboxgl.LngLatBounds();
    let hasCoordinates = false;

    for (const feature of featureCollection.features) {
        hasCoordinates =
            extendBoundsWithGeometry(bounds, feature?.geometry) ||
            hasCoordinates;
    }

    return hasCoordinates ? bounds : null;
}

function extendBoundsWithGeometry(bounds, geometry) {
    if (!geometry?.coordinates) {
        return false;
    }

    return extendBoundsWithCoordinates(bounds, geometry.coordinates);
}

function extendBoundsWithCoordinates(bounds, coordinates) {
    if (!Array.isArray(coordinates)) {
        return false;
    }

    if (coordinates.length >= 2 && isFiniteCoordinatePair(coordinates)) {
        const coordinate = normalizeLngLat(coordinates);

        if (!coordinate) {
            return false;
        }

        bounds.extend(coordinate);

        return true;
    }

    return coordinates.reduce(
        (hasCoordinates, coordinate) =>
            extendBoundsWithCoordinates(bounds, coordinate) || hasCoordinates,
        false,
    );
}

function isFiniteCoordinatePair(coordinates) {
    return (
        numericValue(coordinates[0]) !== null &&
        numericValue(coordinates[1]) !== null
    );
}

function normalizeLngLat(coordinate) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return null;
    }

    const longitude = numericValue(coordinate[0]);
    const latitude = numericValue(coordinate[1]);

    if (
        longitude === null ||
        latitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return [clampLongitude(longitude), clampLatitude(latitude)];
}

function fitMapToLocalityBoundary(bounds) {
    if (!map.value || !bounds) {
        return;
    }

    map.value.fitBounds(
        expandBounds(bounds, LOCALITY_BOUNDARY_FIT_BUFFER_RATIO),
        {
            duration: 700,
            padding: 0,
            retainPadding: false,
        },
    );
}

function expandBounds(bounds, bufferRatio) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const longitudeBuffer = getLongitudeSpan(sw.lng, ne.lng) * bufferRatio;
    const latitudeBuffer = Math.abs(ne.lat - sw.lat) * bufferRatio;

    return new mapboxgl.LngLatBounds(
        [
            clampLongitude(sw.lng - longitudeBuffer),
            clampLatitude(sw.lat - latitudeBuffer),
        ],
        [
            clampLongitude(ne.lng + longitudeBuffer),
            clampLatitude(ne.lat + latitudeBuffer),
        ],
    );
}

async function getMarkers() {
    markerLoadingStage.value = 'bounds';

    if (!map.value) {
        completeInitialMarkerLoad();

        return;
    }

    const bounds = visibleMapBounds();

    if (!bounds) {
        completeInitialMarkerLoad();

        return;
    }

    const requestConfig = {};
    const requestIsBounded = markerBoundsAreRequestable(bounds);

    if (!requestIsBounded && markerLoadMode.value === 'nationwide') {
        completeInitialMarkerLoad();

        return;
    }

    if (requestIsBounded) {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();

        requestConfig.params = {
            ne_lat: ne.lat,
            ne_lng: ne.lng,
            sw_lat: sw.lat,
            sw_lng: sw.lng,
        };
    }

    markerRequestsInFlight.value += 1;
    markerLoadingStage.value = 'markers';

    try {
        const response = await axios.get('/markers', requestConfig);

        markerLoadMode.value = requestIsBounded ? 'viewport' : 'nationwide';
        markerLoadingStage.value = 'render';
        setMarkerPoints(response.data?.points ?? []);
    } catch {
        mapMessage.value = 'Zoom in to load nearby cameras.';
    } finally {
        markerRequestsInFlight.value = Math.max(
            0,
            markerRequestsInFlight.value - 1,
        );
        completeInitialMarkerLoad();
    }
}

function visibleMapBounds() {
    const instance = map.value;
    const canvas = instance?.getCanvas();

    if (!instance || !canvas?.clientWidth || !canvas?.clientHeight) {
        return instance?.getBounds() ?? null;
    }

    const bounds = new mapboxgl.LngLatBounds();

    bounds.extend(instance.unproject([0, 0]));
    bounds.extend(instance.unproject([canvas.clientWidth, 0]));
    bounds.extend(
        instance.unproject([canvas.clientWidth, canvas.clientHeight]),
    );
    bounds.extend(instance.unproject([0, canvas.clientHeight]));

    return bounds;
}

function completeInitialMarkerLoad() {
    markerLoadingStage.value = 'ready';

    if (
        initialMarkersLoaded.value ||
        markerSplashFrameId !== null ||
        markerSplashTimeoutId !== null
    ) {
        return;
    }

    markerSplashFrameId = window.requestAnimationFrame(() => {
        markerSplashFrameId = null;
        markerSplashTimeoutId = window.setTimeout(() => {
            initialMarkersLoaded.value = true;
            markerSplashTimeoutId = null;
        }, MARKER_SPLASH_SETTLE_DELAY_MS);
    });
}

function setMarkerPoints(points) {
    const features = points
        .map((point) => normalizeMarkerFeature(point))
        .filter(Boolean);

    markerFeatures.value = {
        type: 'FeatureCollection',
        features,
    };
    markerConeFeatures.value = {
        type: 'FeatureCollection',
        features: [],
    };

    syncMarkerSources();
    reconcilePendingSelectedMarker();
    syncSelectedMarkerSource();
    window.requestAnimationFrame(syncVisibleMarkerCones);
}

function setSelectedMarkerFromFeature(feature) {
    const coordinates = normalizeLngLat(feature?.geometry?.coordinates);

    if (!coordinates) {
        return;
    }

    selectedMarker.value = {
        coordinates,
        properties: decodeMarkerProperties(feature.properties ?? {}),
    };
    selectedPlace.value = null;
    selectedPlaceDetailsIsLoading.value = false;
    markerPanelIsCollapsed.value = false;

    syncDestinationSource();
    syncSelectedMarkerSource();
}

function reconcilePendingSelectedMarker() {
    if (!pendingSelectedMarkerId.value && !pendingSelectedMarkerOsmId.value) {
        return;
    }

    const feature = markerFeatures.value.features.find((markerFeature) =>
        markerFeatureMatchesPendingSelection(markerFeature),
    );

    if (!feature) {
        return;
    }

    setSelectedMarkerFromFeature(feature);
    clearPendingSelectedMarker();
}

function markerFeatureMatchesPendingSelection(feature) {
    const properties = feature?.properties ?? {};

    if (
        pendingSelectedMarkerId.value &&
        String(properties.id ?? '') === pendingSelectedMarkerId.value
    ) {
        return true;
    }

    if (!pendingSelectedMarkerOsmId.value) {
        return false;
    }

    if (String(properties.osm_id ?? '') === pendingSelectedMarkerOsmId.value) {
        return true;
    }

    return arrayProperty(properties.osm_nodes).some(
        (node) =>
            String(node?.node_id ?? '') === pendingSelectedMarkerOsmId.value,
    );
}

function clearPendingSelectedMarker() {
    pendingSelectedMarkerId.value = '';
    pendingSelectedMarkerOsmId.value = '';
}

function syncMarkerSources() {
    setSourceData('source-markers', markerFeatures.value);
    setSourceData('source-marker-cones', markerConeFeatures.value);
}

function syncVisibleMarkerCones() {
    if (!map.value?.getLayer('daf-marker-dot')) {
        return;
    }

    const renderedMarkers = map.value.queryRenderedFeatures(undefined, {
        layers: ['daf-marker-dot'],
    });
    const seenMarkerIds = new Set();
    const features = [];

    for (const renderedMarker of renderedMarkers) {
        const markerId =
            renderedMarker.properties?.id ??
            renderedMarker.geometry?.coordinates?.join(',');

        if (seenMarkerIds.has(markerId)) {
            continue;
        }

        seenMarkerIds.add(markerId);

        const cone = markerConeFeature({
            geometry: renderedMarker.geometry,
            properties: decodeMarkerProperties(renderedMarker.properties ?? {}),
        });

        if (cone) {
            features.push(cone);
        }
    }

    markerConeFeatures.value = {
        type: 'FeatureCollection',
        features,
    };
    setSourceData('source-marker-cones', markerConeFeatures.value);
}

function syncCurrentLocationSource() {
    if (!currentPosition.value) {
        setSourceData('source-current-location', EMPTY_FEATURE_COLLECTION);

        return;
    }

    setSourceData('source-current-location', {
        type: 'FeatureCollection',
        features: [
            {
                geometry: {
                    coordinates: [
                        currentPosition.value.coords.longitude,
                        currentPosition.value.coords.latitude,
                    ],
                    type: 'Point',
                },
                properties: {
                    accuracy: currentPosition.value.coords.accuracy,
                    heading: currentPosition.value.coords.heading,
                },
                type: 'Feature',
            },
        ],
    });
}

function setDestinationCoordinate(coordinate) {
    setSourceData(
        'source-destination',
        coordinate
            ? {
                  type: 'FeatureCollection',
                  features: [
                      {
                          geometry: {
                              coordinates: coordinate,
                              type: 'Point',
                          },
                          properties: {},
                          type: 'Feature',
                      },
                  ],
              }
            : EMPTY_FEATURE_COLLECTION,
    );
}

function syncDestinationSource() {
    const coordinate =
        activeMode.value === 'directions'
            ? directionDestinationCoordinate()
            : selectedPlaceCoordinate.value;

    setDestinationCoordinate(coordinate);
}

function syncRouteSources() {
    const routes = directionsRoute.value?.routes ?? {};

    setSourceData(
        'source-route-direct',
        routeFeatureCollection(routes[ROUTE_KEYS.fastest]),
    );
    setSourceData(
        'source-route-ideal',
        routeFeatureCollection(routes[ROUTE_KEYS.private]),
    );
}

function syncSelectedMarkerSource() {
    setSourceData(
        'source-selected-marker',
        selectedMarker.value
            ? {
                  type: 'FeatureCollection',
                  features: [
                      {
                          geometry: {
                              coordinates: selectedMarker.value.coordinates,
                              type: 'Point',
                          },
                          properties: {},
                          type: 'Feature',
                      },
                  ],
              }
            : EMPTY_FEATURE_COLLECTION,
    );
}

function syncLocalityBoundarySource() {
    setSourceData(
        'source-locality-boundary',
        localityBoundary.value?.featureCollection ?? EMPTY_FEATURE_COLLECTION,
    );
}

function clearLocalityBoundary() {
    localityBoundary.value = null;
    localityBoundaryActiveZipCode.value = '';
    localityBoundaryError.value = '';
    localityBoundaryMessage.value = '';
    syncLocalityBoundarySource();
    clearZipCodeFromUrl();
}

function updateRouteLayerStyles() {
    if (activeMode.value !== 'directions') {
        setRouteOpacity('direct', 0);
        setRouteOpacity('ideal', 0);
        setDestinationOpacity(selectedPlaceCoordinate.value ? 1 : 0);

        return;
    }

    const selectedKey = selectedRouteKey.value;
    const hasPrivateRoute = Boolean(
        directionsRoute.value?.routes?.[ROUTE_KEYS.private],
    );
    const hasFastestRoute = Boolean(
        directionsRoute.value?.routes?.[ROUTE_KEYS.fastest],
    );

    setRouteOpacity(
        'direct',
        hasFastestRoute
            ? selectedKey === ROUTE_KEYS.fastest || !hasPrivateRoute
                ? 0.95
                : 0.32
            : 0,
    );
    setRouteOpacity(
        'ideal',
        hasPrivateRoute
            ? selectedKey === ROUTE_KEYS.private
                ? 0.95
                : 0.32
            : 0,
    );
    setDestinationOpacity(directionDestinationCoordinate() ? 1 : 0);
}

function setRouteOpacity(routeId, opacity) {
    setLayerPaintProperty(`daf-route-${routeId}`, 'line-opacity', opacity);
    setLayerPaintProperty(
        `daf-route-${routeId}-casing`,
        'line-opacity',
        opacity > 0 ? Math.min(opacity + 0.05, 1) : 0,
    );
}

function setDestinationOpacity(opacity) {
    setLayerPaintProperty(
        'daf-destination-halo',
        'circle-opacity',
        opacity > 0 ? 0.22 : 0,
    );
    setLayerPaintProperty('daf-destination-dot', 'circle-opacity', opacity);
}

function fitMapToSelectedRoute() {
    if (!map.value || !selectedRoute.value?.coordinates?.length) {
        return;
    }

    const coordinates = selectedRoute.value.coordinates;
    const bounds = coordinates.reduce(
        (nextBounds, coordinate) => nextBounds.extend(coordinate),
        new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]),
    );

    map.value.fitBounds(bounds, {
        duration: 700,
        maxZoom: 14,
        padding: routeFitPadding(),
        retainPadding: false,
    });
}

function routeFitPadding() {
    const width = mapContainer.value?.clientWidth ?? window.innerWidth;

    if (width < 640) {
        return {
            bottom: 340,
            left: 48,
            right: 48,
            top: activeMode.value === 'directions' ? 248 : 168,
        };
    }

    return {
        bottom: activeMode.value === 'directions' ? 320 : 240,
        left: activeMode.value === 'directions' ? 500 : 80,
        right: 96,
        top: 168,
    };
}

function directionWaypointsAreReady() {
    return Boolean(directionRouteCoordinates({ setNotice: false }));
}

function directionRouteCoordinates({ setNotice = true } = {}) {
    const coordinates = [];

    if (setNotice) {
        directionsNotice.value = '';
    }

    for (const waypoint of directionWaypoints.value) {
        const coordinate = resolveDirectionWaypointCoordinate(waypoint, {
            setNotice,
        });

        if (!coordinate) {
            return null;
        }

        coordinates.push(coordinate);
    }

    return coordinates.length >= 2 ? coordinates : null;
}

function directionDestinationCoordinate() {
    const waypoint =
        directionWaypoints.value[directionWaypoints.value.length - 1];

    return waypoint
        ? resolveDirectionWaypointCoordinate(waypoint, { setNotice: false })
        : null;
}

function resolveDirectionWaypointCoordinate(
    waypoint,
    { setNotice = true } = {},
) {
    if (!waypoint?.usesCurrentLocation) {
        return waypoint?.coordinate ?? null;
    }

    return getCurrentLocationCoordinate({ setNotice });
}

function getCurrentLocationCoordinate({ setNotice = true } = {}) {
    if (setNotice) {
        directionsNotice.value = '';
    }

    if (currentPosition.value) {
        return [
            currentPosition.value.coords.longitude,
            currentPosition.value.coords.latitude,
        ];
    }

    const center = map.value?.getCenter();

    if (!center) {
        return null;
    }

    if (setNotice) {
        directionsNotice.value =
            'Using the map center as the current-location waypoint because location is unavailable.';
    }

    return [center.lng, center.lat];
}

function getSearchLocationBias() {
    const coordinate = currentPosition.value
        ? {
              latitude: currentPosition.value.coords.latitude,
              longitude: currentPosition.value.coords.longitude,
          }
        : map.value
          ? {
                latitude: map.value.getCenter().lat,
                longitude: map.value.getCenter().lng,
            }
          : null;

    if (!coordinate) {
        return null;
    }

    return {
        circle: {
            center: coordinate,
        },
    };
}

function normalizeDirectionsRouteResponse(result) {
    const directSource = result?.routes?.direct ?? result?.direct ?? null;
    const idealSource =
        result?.routes?.ideal ?? result?.ideal ?? result?.route ?? null;
    const fastestNodeCount = numericValue(
        result?.fastest_route_node_count ??
            directSource?.node_count ??
            directSource?.fastest_route_node_count,
    );
    const direct = directSource
        ? normalizeDirectionsRoute(
              {
                  ...directSource,
                  fastest_route_node_count:
                      directSource.fastest_route_node_count ?? fastestNodeCount,
                  node_count: directSource.node_count ?? fastestNodeCount,
              },
              ROUTE_KEYS.fastest,
          )
        : null;
    const ideal = idealSource
        ? normalizeDirectionsRoute(idealSource, ROUTE_KEYS.private)
        : null;

    if (!direct && !ideal) {
        throw new Error('Directions response did not include a route.');
    }

    return selectDirectionsRoute(
        {
            fastestRouteNodeCount: fastestNodeCount ?? direct?.nodeCount ?? 0,
            routes: {
                ...(direct ? { [ROUTE_KEYS.fastest]: direct } : {}),
                ...(ideal ? { [ROUTE_KEYS.private]: ideal } : {}),
            },
        },
        ideal ? ROUTE_KEYS.private : ROUTE_KEYS.fastest,
    );
}

function normalizeDirectionsRoute(route, routeKey) {
    const coordinates = Array.isArray(route?.coordinates)
        ? route.coordinates.map(normalizeRouteCoordinate).filter(Boolean)
        : [];

    if (coordinates.length < 2) {
        return null;
    }

    return {
        coordinates,
        distance: numericValue(route?.distance),
        duration: numericValue(route?.duration),
        maneuvers: Array.isArray(route?.maneuvers) ? route.maneuvers : [],
        nodeCount: numericValue(
            route?.node_count ?? route?.fastest_route_node_count,
        ),
        routeKey,
    };
}

function selectDirectionsRoute(route, routeKey) {
    const routeOption =
        route?.routes?.[routeKey] ??
        route?.routes?.[ROUTE_KEYS.private] ??
        route?.routes?.[ROUTE_KEYS.fastest] ??
        null;

    if (!routeOption) {
        return route;
    }

    return {
        ...route,
        bounds: routeBounds(routeOption.coordinates),
        coordinates: routeOption.coordinates,
        distance: routeOption.distance,
        duration: routeOption.duration,
        maneuvers: routeOption.maneuvers,
        nodeCount: routeOption.nodeCount,
        selectedRouteKey: routeOption.routeKey,
    };
}

function routeBounds(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return null;
    }

    const longitudes = coordinates.map((coordinate) => coordinate[0]);
    const latitudes = coordinates.map((coordinate) => coordinate[1]);

    return {
        ne: [Math.max(...longitudes), Math.max(...latitudes)],
        sw: [Math.min(...longitudes), Math.min(...latitudes)],
    };
}

function routeFeatureCollection(route) {
    if (!route?.coordinates?.length) {
        return EMPTY_FEATURE_COLLECTION;
    }

    return {
        type: 'FeatureCollection',
        features: [
            {
                geometry: {
                    coordinates: route.coordinates,
                    type: 'LineString',
                },
                properties: {
                    routeKey: route.routeKey,
                },
                type: 'Feature',
            },
        ],
    };
}

function normalizeRouteCoordinate(coordinate) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return null;
    }

    const first = numericValue(coordinate[0]);
    const second = numericValue(coordinate[1]);

    if (first === null || second === null) {
        return null;
    }

    const firstLooksLikeLatitude = first >= -90 && first <= 90;
    const secondLooksLikeLatitude = second >= -90 && second <= 90;
    const longitude =
        firstLooksLikeLatitude && !secondLooksLikeLatitude ? second : first;
    const latitude =
        firstLooksLikeLatitude && !secondLooksLikeLatitude ? first : second;

    if (latitude < -90 || latitude > 90) {
        return null;
    }

    return [normalizeLongitude(longitude), latitude];
}

function normalizeMarkerFeature(point) {
    const location = Array.isArray(point?.location) ? point.location : null;
    const longitude = numericValue(location?.[0]);
    const latitude = numericValue(location?.[1]);

    if (
        longitude === null ||
        latitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    const properties = point?.properties ?? {};
    const heading = normalizeHeading(properties.heading ?? properties.bearing);

    return {
        geometry: {
            coordinates: [normalizeLongitude(longitude), latitude],
            type: 'Point',
        },
        properties: {
            ...properties,
            heading: heading ?? '',
            hasHeading: heading !== null,
        },
        type: 'Feature',
    };
}

function markerConeFeature(feature) {
    const heading = normalizeHeading(feature.properties?.heading);

    if (heading === null) {
        return null;
    }

    const origin = feature.geometry.coordinates;
    const left = destinationCoordinate(
        origin,
        heading - MARKER_CONE_SPREAD_DEGREES,
        MARKER_CONE_DISTANCE_METERS,
    );
    const center = destinationCoordinate(
        origin,
        heading,
        MARKER_CONE_DISTANCE_METERS * 1.15,
    );
    const right = destinationCoordinate(
        origin,
        heading + MARKER_CONE_SPREAD_DEGREES,
        MARKER_CONE_DISTANCE_METERS,
    );

    return {
        geometry: {
            coordinates: [[origin, left, center, right, origin]],
            type: 'Polygon',
        },
        properties: {
            markerId: feature.properties?.id,
        },
        type: 'Feature',
    };
}

function destinationCoordinate(origin, bearingDegrees, distanceMeters) {
    const [longitude, latitude] = origin;
    const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
    const bearing = degreesToRadians(bearingDegrees);
    const lat1 = degreesToRadians(latitude);
    const lon1 = degreesToRadians(longitude);
    const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(angularDistance) +
            Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const lon2 =
        lon1 +
        Math.atan2(
            Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
            Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
        );

    return [normalizeLongitude(radiansToDegrees(lon2)), radiansToDegrees(lat2)];
}

function markerBoundsAreRequestable(bounds) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const latitudeSpan = Math.abs(ne.lat - sw.lat);
    const longitudeSpan = getLongitudeSpan(sw.lng, ne.lng);

    return (
        latitudeSpan <= MAX_MARKER_REQUEST_LATITUDE_SPAN_DEGREES &&
        longitudeSpan <= MAX_MARKER_REQUEST_LONGITUDE_SPAN_DEGREES
    );
}

function getLongitudeSpan(west, east) {
    if (!Number.isFinite(west) || !Number.isFinite(east)) {
        return Number.POSITIVE_INFINITY;
    }

    if (west <= east) {
        return east - west;
    }

    return 360 - west + east;
}

function getPlaceCoordinate(place) {
    const latitude = numericValue(place?.location?.latitude);
    const longitude = numericValue(place?.location?.longitude);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return [normalizeLongitude(longitude), latitude];
}

function getPlaceIcon(place) {
    const types = placeTypes(place);

    if (types.some((type) => ADDRESS_PLACE_TYPES.has(type))) {
        return 'crosshair';
    }

    for (const category of PLACE_ICON_TYPES) {
        if (category.types.some((type) => types.includes(type))) {
            return category.icon;
        }
    }

    return getPlaceIconFromName(place) ?? 'map-pin';
}

function getPlaceIconFromName(place) {
    const label = `${getPlaceDisplayName(place)} ${getPlaceAddress(place)}`
        .toLowerCase()
        .trim();

    if (!label) {
        return null;
    }

    if (
        label.includes('coffee') ||
        label.includes('cafe') ||
        label.includes('restaurant') ||
        label.includes('bakery')
    ) {
        return 'coffee';
    }

    if (
        label.includes('fuel') ||
        label.includes('gas') ||
        label.includes('shell')
    ) {
        return 'fuel';
    }

    if (label.includes('home')) {
        return 'home';
    }

    if (label.includes('work') || label.includes('office')) {
        return 'briefcase';
    }

    return null;
}

function placeTypes(place) {
    return [place?.primaryType, ...(place?.types ?? [])]
        .filter(Boolean)
        .map((type) => String(type).toLowerCase());
}

function placeIsAddress(place) {
    return placeTypes(place).some((type) => ADDRESS_PLACE_TYPES.has(type));
}

function getPlaceTypeLabel(place) {
    return (
        place?.primaryTypeDisplayName?.text ??
        formatPlaceType(place?.primaryType) ??
        (placeIsAddress(place) ? 'Address' : 'Place')
    );
}

function formatPlaceType(type) {
    if (!type) {
        return null;
    }

    const label = String(type).replaceAll('_', ' ').trim().toLowerCase();

    return label ? label.charAt(0).toUpperCase() + label.slice(1) : null;
}

function formatPlaceRatingValue(place) {
    const rating = numericValue(place?.rating);

    return rating === null ? '' : rating.toFixed(1);
}

function formatPlaceRatingCount(place) {
    const userRatingCount = numericValue(place?.userRatingCount);

    return userRatingCount === null
        ? ''
        : `(${userRatingCount.toLocaleString()})`;
}

function formatPlacePrice(priceLevel) {
    return PRICE_LEVEL_LABELS[priceLevel] ?? '';
}

function formatPlaceOpenStatus(place) {
    const openNow =
        place?.currentOpeningHours?.openNow ??
        place?.regularOpeningHours?.openNow;

    if (openNow === true) {
        return 'Open now';
    }

    if (openNow === false) {
        return 'Closed now';
    }

    return 'Hours unavailable';
}

function formatWebsiteHost(url) {
    if (!url) {
        return 'Unavailable';
    }

    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

function postalCodeFromPlace(place) {
    return (
        addressComponentValue(place, ['postal_code'], { short: true }) ??
        getPlaceAddress(place).match(/\b\d{5}(?:-\d{4})?\b/)?.[0] ??
        null
    );
}

function addressAreaFromPlace(place) {
    const parts = String(
        place?.shortFormattedAddress ?? place?.formattedAddress ?? '',
    )
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length <= 1) {
        return null;
    }

    return parts.slice(1).join(', ');
}

function neighborhoodFromPlace(place) {
    return (
        addressComponentValue(place, [
            'neighborhood',
            'sublocality',
            'sublocality_level_1',
            'locality',
        ]) ?? addressAreaFromPlace(place)
    );
}

function countyFromPlace(place) {
    const county = addressComponentValue(place, [
        'administrative_area_level_2',
    ]);

    return county?.replace(/\s+County$/i, '') ?? null;
}

function plusCodeFromPlace(place) {
    return (
        place?.plusCode?.compoundCode ??
        place?.plusCode?.globalCode ??
        place?.plusCode?.global_code ??
        place?.plusCode?.compound_code ??
        null
    );
}

function addressComponentValue(place, expectedTypes, { short = false } = {}) {
    const components = Array.isArray(place?.addressComponents)
        ? place.addressComponents
        : [];

    const component = components.find((addressComponent) => {
        const types = Array.isArray(addressComponent?.types)
            ? addressComponent.types
            : [];

        return expectedTypes.some((type) => types.includes(type));
    });

    if (!component) {
        return null;
    }

    return short
        ? (component.shortText ?? component.longText ?? null)
        : (component.longText ?? component.shortText ?? null);
}

function getPlaceDistance(place) {
    const placeCoordinate = getPlaceCoordinate(place);
    const originCoordinate = getSearchOriginCoordinate();

    if (!placeCoordinate || !originCoordinate) {
        return '';
    }

    return formatSearchDistance(
        distanceBetweenCoordinates(originCoordinate, placeCoordinate),
    );
}

function getSearchOriginCoordinate() {
    if (currentPosition.value) {
        return [
            currentPosition.value.coords.longitude,
            currentPosition.value.coords.latitude,
        ];
    }

    const center = map.value?.getCenter();

    return center ? [center.lng, center.lat] : null;
}

function getPlaceDisplayName(place) {
    return (
        place?.displayName?.text ??
        place?.formattedAddress ??
        'Selected destination'
    );
}

function getPlaceAddress(place) {
    return place?.formattedAddress ?? '';
}

function distanceBetweenCoordinates(origin, destination) {
    const originLatitude = degreesToRadians(origin[1]);
    const destinationLatitude = degreesToRadians(destination[1]);
    const latitudeDelta = degreesToRadians(destination[1] - origin[1]);
    const longitudeDelta = degreesToRadians(destination[0] - origin[0]);
    const haversine =
        Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
        Math.cos(originLatitude) *
            Math.cos(destinationLatitude) *
            Math.sin(longitudeDelta / 2) *
            Math.sin(longitudeDelta / 2);

    return (
        EARTH_RADIUS_METERS *
        2 *
        Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
}

function formatMarkerCoordinates(coordinates) {
    const longitude = numericValue(coordinates?.[0]);
    const latitude = numericValue(coordinates?.[1]);

    if (longitude === null || latitude === null) {
        return 'Unknown';
    }

    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

function formatMarkerDate(value) {
    if (!value) {
        return 'Unknown';
    }

    if (typeof value === 'string') {
        const dateMatch = value.match(/^\d{4}-\d{2}-\d{2}/);

        if (dateMatch) {
            return dateMatch[0];
        }
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return 'Unknown';
    }

    return date.toISOString().slice(0, 10);
}

function cardinalDirection(heading) {
    const normalizedHeading = normalizeHeading(heading);

    if (normalizedHeading === null) {
        return 'Unknown';
    }

    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(normalizedHeading / 45) % directions.length;

    return directions[index];
}

function arrayProperty(value) {
    const decodedValue = decodeMapboxProperty(value);

    return Array.isArray(decodedValue) ? decodedValue : [];
}

function objectProperty(value) {
    const decodedValue = decodeMapboxProperty(value);

    return decodedValue &&
        typeof decodedValue === 'object' &&
        !Array.isArray(decodedValue)
        ? decodedValue
        : {};
}

function firstArrayItem(value) {
    return value.length > 0 ? value[0] : null;
}

function markerTagValue(tags, keys) {
    for (const key of keys) {
        const value = tags[key];

        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return null;
}

function decodeMarkerProperties(properties) {
    return Object.fromEntries(
        Object.entries(properties).map(([key, value]) => [
            key,
            decodeMapboxProperty(value),
        ]),
    );
}

function decodeMapboxProperty(value) {
    if (typeof value !== 'string') {
        return value;
    }

    if (
        (value.startsWith('{') && value.endsWith('}')) ||
        (value.startsWith('[') && value.endsWith(']'))
    ) {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }

    return value;
}

function setSourceData(sourceId, data) {
    const source = map.value?.getSource(sourceId);

    if (source) {
        source.setData(data);
    }
}

function setLayerPaintProperty(layerId, property, value) {
    if (map.value?.getLayer(layerId)) {
        map.value.setPaintProperty(layerId, property, value);
    }
}

function syncMapLayerColors() {
    const colors = mapColors();

    setLayerPaintProperty(
        'daf-route-direct-casing',
        'line-color',
        colors.routeFastCasing,
    );
    setLayerPaintProperty('daf-route-direct', 'line-color', colors.routeFast);
    setLayerPaintProperty(
        'daf-route-ideal-casing',
        'line-color',
        colors.routePrivateCasing,
    );
    setLayerPaintProperty('daf-route-ideal', 'line-color', colors.routePrivate);
    setLayerPaintProperty(
        'daf-locality-boundary-fill',
        'fill-color',
        colors.brand,
    );
    setLayerPaintProperty(
        'daf-locality-boundary-outline',
        'line-color',
        colors.nodeMonitored,
    );
    setLayerPaintProperty(
        'daf-marker-cones-fill',
        'fill-color',
        colors.markerCone,
    );
    setLayerPaintProperty(
        'daf-marker-cones-outline',
        'line-color',
        colors.markerConeEdge,
    );
    setLayerPaintProperty(
        'daf-marker-cluster',
        'circle-color',
        colors.markerAlpr,
    );
    setLayerPaintProperty(
        'daf-marker-cluster',
        'circle-stroke-color',
        colors.surfaceMarker,
    );
    setLayerPaintProperty(
        'daf-marker-halo',
        'circle-color',
        colors.markerAlprGlow,
    );
    setLayerPaintProperty('daf-marker-dot', 'circle-color', colors.markerAlpr);
    setLayerPaintProperty(
        'daf-marker-dot',
        'circle-stroke-color',
        colors.surfaceMarker,
    );
    setLayerPaintProperty(
        'daf-destination-halo',
        'circle-color',
        colors.markerDestination,
    );
    setLayerPaintProperty(
        'daf-destination-dot',
        'circle-color',
        colors.markerDestination,
    );
    setLayerPaintProperty(
        'daf-destination-dot',
        'circle-stroke-color',
        colors.surfaceMarker,
    );
    setLayerPaintProperty(
        'daf-current-location-halo',
        'circle-color',
        colors.markerUserHalo,
    );
    setLayerPaintProperty(
        'daf-current-location-dot',
        'circle-color',
        colors.markerUser,
    );
    setLayerPaintProperty(
        'daf-current-location-dot',
        'circle-stroke-color',
        colors.surfaceMarker,
    );
    setLayerPaintProperty(
        'daf-selected-marker-ring',
        'circle-color',
        colors.surfaceMarker,
    );
    setLayerPaintProperty(
        'daf-selected-marker-ring',
        'circle-stroke-color',
        colors.nodeMonitored,
    );
}

function mapLightPresetForTimeOfDay(timeOfDay) {
    return timeOfDay === 'auto' ? automaticMapLightPreset() : timeOfDay;
}

function currentMapLightPreset() {
    return mapLightPresetForTimeOfDay(mapTimeOfDay.value);
}

function automaticMapLightPreset() {
    const hour = new Date().getHours();

    if (hour < 5 || hour >= 20) {
        return 'night';
    }

    if (hour < 8) {
        return 'dawn';
    }

    if (hour >= 17) {
        return 'dusk';
    }

    return 'day';
}

function mapStylePreviewStyle(preview) {
    if (preview === 'satellite') {
        return {
            '--preview-alt': '#454a38',
            '--preview-land': '#3a3f2e',
            '--preview-park': '#36492c',
            '--preview-road': '#e9e4d6',
            '--preview-road-minor': 'rgba(233,228,214,0.38)',
            '--preview-water': '#1e3046',
        };
    }

    return {
        '--preview-alt': '#E1E5E9',
        '--preview-land': '#EAEDF0',
        '--preview-park': '#DCEBD6',
        '--preview-road': '#FFFFFF',
        '--preview-road-minor': '#F4F6F8',
        '--preview-water': '#BBD7EE',
    };
}

function mapColors() {
    return {
        brand: cssVar('--brand', '#1FBF6B'),
        markerAlpr: cssVar('--marker-alpr', '#FF4D4F'),
        markerAlprGlow: cssVar('--marker-alpr-glow', 'rgba(255,77,79,0.55)'),
        markerCone: cssVar('--marker-cone', 'rgba(255,77,79,0.30)'),
        markerConeEdge: cssVar('--marker-cone-edge', 'rgba(255,77,79,0.55)'),
        markerDestination: cssVar('--marker-destination', '#7A5CFF'),
        markerUser: cssVar('--marker-user', '#1FBF6B'),
        markerUserHalo: cssVar('--marker-user-halo', 'rgba(31,191,107,0.22)'),
        nodeMonitored: cssVar('--node-monitored', '#FFB02E'),
        routeFast: cssVar('--route-fast', '#2E8BFF'),
        routeFastCasing: cssVar('--route-fast-casing', '#FFFFFF'),
        routePrivate: cssVar('--route-private', '#1FBF6B'),
        routePrivateCasing: cssVar('--route-private-casing', '#FFFFFF'),
        surfaceMarker: cssVar('--surface-marker', '#FFFFFF'),
    };
}

function cssVar(name, fallback) {
    return (
        getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim() || fallback
    );
}

function formatSearchDistance(meters) {
    const distance = numericValue(meters);

    if (distance === null) {
        return '';
    }

    if (distance < 0.1 * METERS_PER_MILE) {
        return `${Math.round(distance * FEET_PER_METER)} ft`;
    }

    return `${(distance / METERS_PER_MILE).toFixed(1)} mi`;
}

function formatDistance(meters) {
    const distance = numericValue(meters);

    if (distance === null) {
        return '--';
    }

    if (distance >= METERS_PER_MILE) {
        return `${(distance / METERS_PER_MILE).toFixed(1)} mi`;
    }

    return `${Math.round(distance * FEET_PER_METER)} ft`;
}

function formatDuration(seconds) {
    const duration = numericValue(seconds);

    if (duration === null) {
        return '--';
    }

    const minutes = Math.max(1, Math.round(duration / 60));

    if (minutes < 60) {
        return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return remainingMinutes > 0
        ? `${hours} hr ${remainingMinutes} min`
        : `${hours} hr`;
}

function normalizeHeading(value) {
    const heading = numericValue(value);

    if (heading === null) {
        return null;
    }

    return ((heading % 360) + 360) % 360;
}

function normalizeLongitude(value) {
    const longitude = numericValue(value);

    if (longitude === null) {
        return 0;
    }

    return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function initialZipCodeFromUrl() {
    if (typeof window === 'undefined') {
        return '';
    }

    return normalizeZipCode(
        new URLSearchParams(window.location.search).get('zip'),
    );
}

function initialSelectedMarkerFromUrl() {
    if (typeof window === 'undefined') {
        return null;
    }

    const params = new URLSearchParams(window.location.search);
    const id = String(params.get('marker') ?? '').trim();
    const coordinates = normalizeLngLat([params.get('lng'), params.get('lat')]);

    if (!id || !coordinates) {
        return null;
    }

    return {
        coordinates,
        id,
        osmId: String(params.get('osm_id') ?? '').trim(),
    };
}

function initialSelectedMarkerValue(marker) {
    if (!marker) {
        return null;
    }

    return {
        coordinates: marker.coordinates,
        properties: {
            id: marker.id,
            osm_id: marker.osmId,
            osm_nodes: marker.osmId
                ? [
                      {
                          node_id: marker.osmId,
                          tags: {},
                      },
                  ]
                : [],
        },
    };
}

function normalizeZipCode(value) {
    const trimmedValue = String(value ?? '').trim();

    return /^\d{5}(?:-\d{4})?$/.test(trimmedValue) ? trimmedValue : '';
}

function fiveDigitZipCode(value) {
    const trimmedValue = String(value ?? '').trim();

    return /^\d{5}$/.test(trimmedValue) ? trimmedValue : '';
}

function setZipCodeInUrl(zipCode) {
    if (typeof window === 'undefined') {
        return;
    }

    const url = new URL(window.location.href);

    url.searchParams.set('zip', zipCode);
    window.history.replaceState(
        {},
        '',
        `${url.pathname}${url.search}${url.hash}`,
    );
}

function clearZipCodeFromUrl() {
    if (typeof window === 'undefined') {
        return;
    }

    const url = new URL(window.location.href);

    if (!url.searchParams.has('zip')) {
        return;
    }

    url.searchParams.delete('zip');
    window.history.replaceState(
        {},
        '',
        `${url.pathname}${url.search}${url.hash}`,
    );
}

function clampLatitude(value) {
    return Math.max(-90, Math.min(90, value));
}

function clampLongitude(value) {
    return Math.max(-180, Math.min(180, value));
}

function numericValue(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

function degreesToRadians(degrees) {
    return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians) {
    return (radians * 180) / Math.PI;
}
</script>

<template>
    <Head title="Map" />

    <div
        class="flex h-screen min-h-screen flex-col overflow-hidden bg-daf-surface-page text-daf-text-primary"
    >
        <DafSiteHeader
            variant="app"
            :links="mapHeaderLinks"
            :cta-href="''"
            home-href="/"
        />

        <main class="relative min-h-0 flex-1 overflow-hidden">
            <div ref="mapContainer" class="absolute inset-0" />

            <div
                v-if="mapStatus"
                class="absolute inset-0 z-10 flex items-center justify-center bg-daf-surface-page text-daf-body font-semibold text-daf-text-secondary"
            >
                {{ mapStatus }}
            </div>

            <section
                :class="[
                    'absolute left-1/2 z-30 flex max-w-[calc(100vw_-_1rem)] -translate-x-1/2 items-center justify-center gap-2 sm:gap-2.5',
                    activeMode === 'directions'
                        ? 'top-4'
                        : 'top-[76px] sm:top-4',
                ]"
            >
                <DafSegmentedControl
                    v-model="activeMode"
                    :options="segmentOptions"
                    tone="glass"
                />
                <DafNodeStatusBadge
                    v-if="nodeTotalsCardIsVisible"
                    :count-label="visibleMarkerCountLabel"
                    :loading="markersAreLoading"
                />
            </section>

            <section
                :class="[
                    'absolute left-4 right-16 z-20 sm:right-auto sm:w-[380px] sm:max-w-[calc(100%_-_32px)]',
                    activeMode === 'directions'
                        ? 'top-[76px] sm:top-4'
                        : 'top-4',
                ]"
            >
                <DafSearchBar
                    v-if="activeMode === 'map'"
                    v-model="searchQuery"
                    :placeholder="searchPlaceholder"
                    :show-menu="false"
                    :show-directions="false"
                    :voice-active="voiceIsListening"
                    show-voice
                    @clear="clearSearch"
                    @search="queueSearch"
                    @submit="submitSearch"
                    @voice="startVoiceSearch"
                />

                <div
                    v-else
                    class="rounded-daf2xl border border-daf-border-glass bg-daf-surface-raised p-3.5 text-daf-text-primary shadow-dafFloat"
                >
                    <div class="mb-3.5 flex items-center gap-2">
                        <span
                            class="flex size-[30px] shrink-0 items-center justify-center rounded-dafMd bg-[var(--brand-soft)] text-daf-text-brand"
                        >
                            <DafIcon name="navigation" size="17" />
                        </span>
                        <span
                            class="font-display text-daf-body-lg font-bold tracking-[var(--ls-heading)]"
                        >
                            Directions
                        </span>
                        <span class="flex-1" />
                        <button
                            class="daf-pressable flex size-[30px] items-center justify-center rounded-dafMd text-daf-text-tertiary hover:bg-daf-surface-alt hover:text-daf-text-primary"
                            type="button"
                            aria-label="Close directions"
                            @click="activeMode = 'map'"
                        >
                            <DafIcon name="x" size="17" stroke="2.2" />
                        </button>
                    </div>

                    <div class="flex flex-col gap-2">
                        <div
                            v-for="waypoint in directionWaypointRows"
                            :key="waypoint.id"
                            class="flex items-center gap-2"
                            @dragover="
                                dragOverDirectionWaypoint(waypoint.id, $event)
                            "
                            @drop="dropDirectionWaypoint"
                        >
                            <button
                                aria-label="Drag to reorder waypoint"
                                class="grid shrink-0 cursor-grab grid-cols-2 gap-[3px] rounded-dafSm px-[3px] py-1.5 text-daf-text-tertiary hover:bg-daf-surface-alt active:cursor-grabbing"
                                draggable="true"
                                type="button"
                                @dragstart="
                                    startDirectionWaypointDrag(
                                        waypoint.id,
                                        $event,
                                    )
                                "
                                @dragend="endDirectionWaypointDrag"
                            >
                                <span
                                    v-for="dot in 6"
                                    :key="`${waypoint.id}-${dot}`"
                                    class="size-0.5 rounded-full bg-current"
                                />
                            </button>

                            <span
                                aria-hidden="true"
                                class="relative flex w-3.5 shrink-0 self-stretch"
                            >
                                <span
                                    v-if="waypoint.showConnector"
                                    class="absolute left-1/2 top-1/2 h-[calc(100%+8px)] -translate-x-1/2 border-l-2 border-dotted border-daf-border-strong"
                                />
                                <span
                                    class="relative z-[1] m-auto block"
                                    :class="[
                                        waypoint.isDestination
                                            ? 'size-3 rounded-[3px] bg-daf-text-brand'
                                            : waypoint.isStop
                                              ? 'size-[9px] rounded-full bg-daf-text-tertiary'
                                              : 'size-3 rounded-full border-[3px] border-daf-text-secondary bg-daf-surface-raised',
                                    ]"
                                />
                            </span>

                            <input
                                :class="[
                                    'min-h-10 min-w-0 flex-1 rounded-dafMd border-[1.5px] px-3 py-2 text-daf-body text-daf-text-primary placeholder:text-daf-text-tertiary focus:border-daf-brand focus:bg-daf-surface-raised focus:ring-0',
                                    waypoint.isActive
                                        ? 'border-daf-brand bg-daf-surface-raised'
                                        : 'border-transparent bg-daf-surface-alt',
                                ]"
                                :placeholder="waypoint.placeholder"
                                :readonly="waypoint.usesCurrentLocation"
                                type="text"
                                :value="waypoint.value"
                                @focus="
                                    activateDirectionWaypointSearch(waypoint.id)
                                "
                                @input="
                                    updateDirectionWaypoint(
                                        waypoint.id,
                                        $event.target.value,
                                    )
                                "
                                @keydown.enter.prevent="
                                    submitDirectionWaypoint(waypoint)
                                "
                            />

                            <button
                                v-if="waypoint.canRemove"
                                class="daf-pressable flex size-7 shrink-0 items-center justify-center rounded-dafMd text-daf-text-tertiary hover:bg-daf-surface-alt hover:text-daf-text-primary"
                                type="button"
                                aria-label="Remove stop"
                                @click="removeDirectionWaypoint(waypoint.id)"
                            >
                                <DafIcon name="x" size="15" stroke="2.2" />
                            </button>
                        </div>
                    </div>

                    <button
                        class="daf-pressable mt-2.5 flex items-center gap-2 rounded-dafMd px-1 py-2 text-daf-body font-medium text-daf-text-secondary hover:bg-daf-surface-alt hover:text-daf-text-primary"
                        type="button"
                        @click="addDirectionStop"
                    >
                        <span
                            class="flex size-[22px] items-center justify-center rounded-full bg-daf-surface-alt text-daf-text-secondary"
                        >
                            <DafIcon name="plus" size="15" />
                        </span>
                        Add stop
                    </button>
                </div>

                <div
                    v-if="searchPanelIsVisible"
                    class="mt-1.5 overflow-hidden rounded-dafMd border border-daf-border-glass bg-daf-surface-card shadow-dafFloat"
                >
                    <div
                        class="max-h-[324px] overflow-y-auto p-1.5 [scrollbar-gutter:stable]"
                    >
                        <button
                            v-if="zipCodeSearchSuggestion"
                            :key="zipCodeSearchSuggestion.key"
                            class="daf-pressable flex w-full items-center gap-[11px] rounded-dafSm px-2.5 py-2 text-left hover:bg-daf-surface-alt"
                            type="button"
                            @click="
                                selectZipCodeSearchSuggestion(
                                    zipCodeSearchSuggestion.zipCode,
                                )
                            "
                        >
                            <span
                                class="flex size-[34px] shrink-0 items-center justify-center rounded-dafSm bg-[var(--brand-soft)] text-daf-text-brand"
                            >
                                <DafIcon name="map-pin" size="18" />
                            </span>
                            <span class="min-w-0 flex-1">
                                <span
                                    class="block truncate text-daf-body font-medium text-daf-text-primary"
                                >
                                    {{ zipCodeSearchSuggestion.title }}
                                </span>
                                <span
                                    class="block truncate text-daf-body-sm text-daf-text-tertiary"
                                >
                                    {{ zipCodeSearchSuggestion.sublabel }}
                                </span>
                            </span>
                            <span
                                class="shrink-0 font-mono text-daf-body-sm text-daf-text-tertiary"
                            >
                                {{ zipCodeSearchSuggestion.meta }}
                            </span>
                        </button>
                        <div
                            v-if="
                                zipCodeSearchSuggestion &&
                                (searchIsLoading ||
                                    searchError ||
                                    displayedSearchResults.length)
                            "
                            class="my-1 border-t border-daf-border-glass"
                        />
                        <p
                            v-if="searchIsLoading"
                            class="px-3 py-3 text-center text-daf-body-sm text-daf-text-tertiary"
                        >
                            Searching places...
                        </p>
                        <p
                            v-else-if="searchError"
                            class="px-3 py-3 text-center text-daf-body-sm text-daf-danger"
                        >
                            {{ searchError }}
                        </p>
                        <button
                            v-for="result in displayedSearchResults"
                            v-else
                            :key="result.key"
                            class="daf-pressable flex w-full items-center gap-[11px] rounded-dafSm px-2.5 py-2 text-left hover:bg-daf-surface-alt"
                            type="button"
                            @click="selectSearchResult(result.raw)"
                        >
                            <span
                                class="flex size-[34px] shrink-0 items-center justify-center rounded-dafSm bg-daf-surface-alt text-daf-text-secondary"
                            >
                                <DafIcon :name="result.icon" size="18" />
                            </span>
                            <span class="min-w-0 flex-1">
                                <span
                                    class="block truncate text-daf-body font-medium text-daf-text-secondary"
                                >
                                    {{ result.title }}
                                </span>
                                <span
                                    v-if="result.sublabel"
                                    class="block truncate text-daf-body-sm text-daf-text-tertiary"
                                >
                                    {{ result.sublabel }}
                                </span>
                            </span>
                            <span
                                v-if="result.meta"
                                class="shrink-0 font-mono text-daf-body-sm text-daf-text-tertiary"
                            >
                                {{ result.meta }}
                            </span>
                        </button>
                    </div>
                </div>
            </section>

            <section class="absolute right-4 top-4 z-20 flex flex-col gap-2">
                <DafIconButton
                    :active="mapOptionsOpen"
                    icon="layers"
                    label="Map options"
                    @click="openMapOptions"
                />
                <DafIconButton icon="plus" label="Zoom in" @click="zoomIn" />
                <DafIconButton icon="minus" label="Zoom out" @click="zoomOut" />
                <DafIconButton
                    icon="crosshair"
                    label="Use current location"
                    @click="locateUser"
                />
            </section>

            <Transition
                enter-active-class="duration-150 ease-out"
                enter-from-class="opacity-0"
                enter-to-class="opacity-100"
                leave-active-class="duration-100 ease-in"
                leave-from-class="opacity-100"
                leave-to-class="opacity-0"
            >
                <div
                    v-if="mapOptionsOpen"
                    class="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 py-20 backdrop-blur-sm sm:items-center sm:py-6"
                    @click.self="closeMapOptions"
                >
                    <section
                        aria-labelledby="map-options-title"
                        aria-modal="true"
                        class="w-full max-w-[26rem] rounded-daf2xl border border-daf-border-glass bg-daf-surface-raised p-5 text-daf-text-primary shadow-dafSheet"
                        role="dialog"
                    >
                        <div
                            class="mb-5 flex items-start justify-between gap-4"
                        >
                            <div class="min-w-0">
                                <p
                                    class="font-mono text-daf-label font-semibold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary"
                                >
                                    Map
                                </p>
                                <h2
                                    id="map-options-title"
                                    class="font-display text-daf-h3 font-semibold text-daf-text-primary"
                                >
                                    Map options
                                </h2>
                            </div>
                            <DafIconButton
                                icon="x"
                                label="Close map options"
                                variant="plain"
                                @click="closeMapOptions"
                            />
                        </div>

                        <div class="flex flex-col gap-5">
                            <div>
                                <div
                                    class="mb-2 font-mono text-daf-label font-semibold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary"
                                >
                                    Map type
                                </div>
                                <div
                                    class="flex flex-col gap-2"
                                    role="radiogroup"
                                    aria-label="Map type"
                                >
                                    <button
                                        v-for="option in MAP_STYLE_OPTIONS"
                                        :key="option.value"
                                        :aria-checked="
                                            mapStyle === option.value
                                        "
                                        :class="[
                                            'daf-pressable flex w-full items-center gap-3 rounded-dafLg border p-2.5 text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daf-focus',
                                            mapStyle === option.value
                                                ? 'border-daf-brand bg-daf-surface-card shadow-dafCard'
                                                : 'border-daf-border bg-daf-surface-alt hover:border-daf-border-strong',
                                        ]"
                                        role="radio"
                                        type="button"
                                        @click="selectMapStyle(option.value)"
                                    >
                                        <span
                                            :style="
                                                mapStylePreviewStyle(
                                                    option.preview,
                                                )
                                            "
                                            class="relative h-14 w-20 shrink-0 overflow-hidden rounded-dafSm border border-daf-border-glass bg-[var(--preview-land)]"
                                            aria-hidden="true"
                                        >
                                            <span
                                                class="absolute right-[-18%] top-[-10%] h-9 w-11 rounded-full bg-[var(--preview-water)]"
                                            />
                                            <span
                                                class="absolute bottom-[-18%] left-[-12%] h-8 w-12 rounded-full bg-[var(--preview-park)]"
                                            />
                                            <span
                                                class="absolute left-[32%] top-[28%] h-5 w-8 rounded-dafSm bg-[var(--preview-alt)]"
                                            />
                                            <span
                                                class="absolute left-[26%] top-[-10%] h-[120%] w-1 rounded-dafPill bg-[var(--preview-road-minor)]"
                                            />
                                            <span
                                                class="absolute left-[62%] top-[-10%] h-[120%] w-1 rounded-dafPill bg-[var(--preview-road-minor)]"
                                            />
                                            <span
                                                class="absolute left-[-10%] top-[38%] h-1 w-[120%] rounded-dafPill bg-[var(--preview-road-minor)]"
                                            />
                                            <span
                                                class="absolute left-[-12%] top-[58%] h-1.5 w-[128%] -rotate-6 rounded-dafPill bg-[var(--preview-road)]"
                                            />
                                            <span
                                                class="absolute left-[48%] top-[-12%] h-[124%] w-1.5 rotate-3 rounded-dafPill bg-[var(--preview-road)]"
                                            />
                                        </span>
                                        <span class="min-w-0 flex-1">
                                            <span
                                                class="block truncate text-daf-body font-semibold text-daf-text-primary"
                                            >
                                                {{ option.label }}
                                            </span>
                                            <span
                                                class="block truncate text-daf-caption text-daf-text-tertiary"
                                            >
                                                {{ option.description }}
                                            </span>
                                        </span>
                                        <span
                                            :class="[
                                                'flex size-6 shrink-0 items-center justify-center rounded-full transition-opacity duration-150',
                                                mapStyle === option.value
                                                    ? 'bg-daf-brand text-daf-brand-contrast opacity-100'
                                                    : 'opacity-0',
                                            ]"
                                            aria-hidden="true"
                                        >
                                            <DafIcon
                                                name="check"
                                                size="14"
                                                stroke="3"
                                            />
                                        </span>
                                    </button>
                                </div>
                            </div>

                            <div>
                                <div
                                    class="mb-2 font-mono text-daf-label font-semibold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary"
                                >
                                    Time of day
                                </div>
                                <div
                                    class="grid grid-cols-5 rounded-dafPill border border-daf-border bg-daf-surface-card p-1 shadow-dafCard"
                                    role="radiogroup"
                                    aria-label="Time of day"
                                >
                                    <button
                                        v-for="option in MAP_TIME_OF_DAY_OPTIONS"
                                        :key="option.value"
                                        :aria-checked="
                                            mapTimeOfDay === option.value
                                        "
                                        :class="[
                                            'daf-pressable flex min-h-9 items-center justify-center rounded-dafPill px-2 text-center text-daf-caption font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daf-focus',
                                            mapTimeOfDay === option.value
                                                ? 'bg-daf-brand text-daf-brand-contrast shadow-dafCard'
                                                : 'text-daf-text-secondary hover:text-daf-text-primary',
                                        ]"
                                        role="radio"
                                        type="button"
                                        @click="
                                            selectMapTimeOfDay(option.value)
                                        "
                                    >
                                        {{ option.label }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </Transition>

            <div
                v-if="
                    floatingMapMessage &&
                    activeMode === 'map' &&
                    routeOptions.length === 0 &&
                    !directionsIsLoading &&
                    !directionsError
                "
                class="daf-glass absolute bottom-4 left-1/2 z-20 w-[calc(100%_-_1.5rem)] max-w-sm -translate-x-1/2 rounded-dafLg px-4 py-3 text-center text-daf-body-sm text-daf-text-secondary"
            >
                {{ floatingMapMessage }}
            </div>

            <section
                v-if="
                    routeSelectionCardIsVisible || selectedDetailItemIsVisible
                "
                class="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex max-h-[calc(100%_-_1rem)] flex-col gap-2 overflow-y-auto sm:pointer-events-none sm:inset-0 sm:block sm:max-h-none sm:overflow-visible"
            >
                <div
                    v-if="routeSelectionCardIsVisible"
                    :class="routePanelClasses"
                >
                    <DafBottomSheet
                        id="route-selection-card"
                        class="relative z-20"
                        :aria-hidden="routePanelIsCollapsed ? 'true' : 'false'"
                        eyebrow="Directions"
                        :glass="true"
                        :inert="routePanelIsCollapsed ? '' : null"
                        :show-handle="false"
                        title="Choose route"
                    >
                        <div class="flex flex-col gap-3">
                            <p
                                v-if="directionsNotice"
                                class="text-daf-body-sm text-daf-text-secondary"
                            >
                                {{ directionsNotice }}
                            </p>
                            <p
                                v-if="directionsIsLoading"
                                class="text-daf-body-sm text-daf-text-secondary"
                            >
                                Comparing routes around known cameras...
                            </p>
                            <p
                                v-if="directionsError"
                                class="text-daf-body-sm font-semibold text-daf-danger"
                            >
                                {{ directionsError }}
                            </p>

                            <DafRouteCard
                                v-if="directionsRoute?.routes?.ideal"
                                :cameras="fastestRouteNodeCount"
                                :distance="
                                    formatDistance(
                                        directionsRoute.routes.ideal.distance,
                                    )
                                "
                                :eta="
                                    formatDuration(
                                        directionsRoute.routes.ideal.duration,
                                    )
                                "
                                :selected="
                                    selectedRouteKey === ROUTE_KEYS.private
                                "
                                type="private"
                                @click="selectRoute(ROUTE_KEYS.private)"
                            />
                            <DafRouteCard
                                v-if="directionsRoute?.routes?.direct"
                                :cameras="fastestRouteNodeCount"
                                :distance="
                                    formatDistance(
                                        directionsRoute.routes.direct.distance,
                                    )
                                "
                                :eta="
                                    formatDuration(
                                        directionsRoute.routes.direct.duration,
                                    )
                                "
                                :selected="
                                    selectedRouteKey === ROUTE_KEYS.fastest
                                "
                                type="fastest"
                                @click="selectRoute(ROUTE_KEYS.fastest)"
                            />

                            <div class="border-t border-daf-border-glass pt-3">
                                <button
                                    class="daf-pressable flex w-full items-center gap-2 rounded-dafSm px-1 py-2 text-left text-daf-body-sm font-semibold text-daf-text-secondary hover:bg-daf-surface-alt hover:text-daf-text-primary"
                                    type="button"
                                    :aria-expanded="advancedSettingsOpen"
                                    @click="
                                        advancedSettingsOpen =
                                            !advancedSettingsOpen
                                    "
                                >
                                    <DafIcon
                                        name="sliders-horizontal"
                                        size="16"
                                    />
                                    <span class="min-w-0 flex-1 truncate">
                                        Advanced Settings
                                    </span>
                                    <span
                                        class="shrink-0 font-mono text-daf-caption text-daf-text-tertiary"
                                    >
                                        {{ avoidBufferLabel }}
                                    </span>
                                    <DafIcon
                                        :class="[
                                            'text-daf-text-tertiary transition-transform duration-200 motion-reduce:transition-none',
                                            advancedSettingsOpen
                                                ? 'rotate-180'
                                                : '',
                                        ]"
                                        name="chevron-down"
                                        size="16"
                                    />
                                </button>

                                <Transition name="settings-disclosure">
                                    <div
                                        v-if="advancedSettingsOpen"
                                        class="pt-3"
                                    >
                                        <div
                                            class="mb-4 flex items-center justify-between gap-3 rounded-dafSm border border-daf-border-glass bg-daf-surface-alt px-3 py-3"
                                        >
                                            <span
                                                id="allow-alpr-near-start-destination-label"
                                                class="min-w-0 flex-1 text-daf-body-sm font-semibold text-daf-text-primary"
                                            >
                                                {{
                                                    ALLOW_ALPR_NEAR_START_DESTINATION_LABEL
                                                }}
                                            </span>
                                            <DafSwitch
                                                aria-labelledby="allow-alpr-near-start-destination-label"
                                                :model-value="
                                                    allowAlprNearStartDestination
                                                "
                                                size="xs"
                                                @update:model-value="
                                                    handleAllowAlprNearStartDestinationChanged
                                                "
                                            />
                                        </div>
                                        <label
                                            class="mb-2 flex items-end justify-between gap-3 text-daf-body-sm font-semibold text-daf-text-secondary"
                                            for="avoid-buffer-meters"
                                        >
                                            <span>Avoid cameras by</span>
                                            <span
                                                class="text-right font-mono text-daf-caption font-semibold text-daf-text-primary"
                                            >
                                                {{ avoidBufferLabel }}
                                                <span
                                                    class="text-daf-text-tertiary"
                                                >
                                                    /
                                                    {{
                                                        avoidBufferImperialLabel
                                                    }}
                                                </span>
                                            </span>
                                        </label>
                                        <input
                                            id="avoid-buffer-meters"
                                            v-model.number="avoidBufferMeters"
                                            class="daf-avoid-buffer-range"
                                            :max="MAX_AVOID_BUFFER_METERS"
                                            :min="MIN_AVOID_BUFFER_METERS"
                                            :step="AVOID_BUFFER_STEP_METERS"
                                            type="range"
                                            @change="handleAvoidBufferChanged"
                                        />
                                        <div
                                            class="mt-1.5 flex justify-between font-mono text-daf-label text-daf-text-tertiary"
                                        >
                                            <span>
                                                {{
                                                    MIN_AVOID_BUFFER_METERS.toLocaleString()
                                                }}
                                                m
                                            </span>
                                            <span>
                                                {{
                                                    MAX_AVOID_BUFFER_METERS.toLocaleString()
                                                }}
                                                m
                                            </span>
                                        </div>
                                    </div>
                                </Transition>
                            </div>

                            <div
                                class="flex items-center justify-between gap-3"
                            >
                                <DafBadge icon="camera" tone="alert">
                                    {{ fastestRouteNodeCount }} cameras on
                                    direct path
                                </DafBadge>
                                <DafButton
                                    variant="secondary"
                                    @click="clearDirections"
                                >
                                    Clear
                                </DafButton>
                            </div>
                        </div>
                    </DafBottomSheet>
                    <button
                        class="absolute right-[-22px] top-1/2 z-10 flex h-14 w-[22px] -translate-y-1/2 items-center justify-center rounded-r-dafMd border border-l-0 border-daf-border-glass bg-daf-surface-raised p-0 text-daf-text-tertiary shadow-dafFloat transition-colors duration-150 hover:text-daf-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daf-focus sm:h-[60px]"
                        type="button"
                        aria-controls="route-selection-card"
                        :aria-expanded="!routePanelIsCollapsed"
                        :aria-label="routePanelToggleLabel"
                        @click="toggleRoutePanel"
                    >
                        <DafIcon
                            :class="[
                                'transition-transform duration-200 motion-reduce:transition-none',
                                routePanelIsCollapsed ? 'rotate-180' : '',
                            ]"
                            name="chevron-left"
                            size="15"
                            stroke="2.3"
                        />
                    </button>
                </div>

                <div
                    v-if="selectedDetailItemIsVisible"
                    :class="detailPanelStackClasses"
                >
                    <div
                        v-if="selectedDetailItemIsVisible"
                        :class="markerPanelClasses"
                    >
                        <section
                            id="marker-details-card"
                            class="relative z-20 rounded-daf2xl border border-daf-border-glass bg-daf-surface-raised p-6 text-daf-text-primary shadow-dafSheet"
                            :aria-hidden="
                                markerPanelIsCollapsed ? 'true' : 'false'
                            "
                            :inert="markerPanelIsCollapsed ? '' : null"
                            role="dialog"
                            aria-modal="false"
                        >
                            <button
                                class="daf-pressable absolute right-3.5 top-3.5 flex size-[30px] items-center justify-center rounded-dafMd text-daf-text-tertiary hover:bg-daf-surface-alt hover:text-daf-text-primary"
                                type="button"
                                :aria-label="
                                    selectedPlace
                                        ? 'Close place detail'
                                        : 'Close camera detail'
                                "
                                @click="
                                    selectedPlace
                                        ? clearSelectedPlace()
                                        : clearSelectedMarker()
                                "
                            >
                                <DafIcon name="x" size="17" stroke="2.2" />
                            </button>

                            <template
                                v-if="selectedPlace && !selectedPlaceIsAddress"
                            >
                                <div
                                    class="mb-3.5 mr-9 flex items-start gap-[13px]"
                                >
                                    <span
                                        class="flex size-11 shrink-0 items-center justify-center rounded-dafMd bg-[var(--brand-soft)] text-daf-text-brand"
                                    >
                                        <DafIcon
                                            :name="selectedPlaceIconName"
                                            size="22"
                                        />
                                    </span>
                                    <div class="min-w-0">
                                        <h2
                                            class="mb-0.5 font-display text-daf-h3 font-bold leading-[var(--lh-h3)] tracking-[var(--ls-heading)] text-daf-text-primary"
                                        >
                                            {{ selectedPlaceTitle }}
                                        </h2>
                                        <div
                                            class="flex flex-wrap items-center gap-1.5 text-daf-body-sm text-daf-text-secondary"
                                        >
                                            <span
                                                v-if="
                                                    selectedPlaceRatingValueLabel
                                                "
                                                class="text-daf-warning"
                                                aria-hidden="true"
                                            >
                                                <svg
                                                    class="block size-3.5"
                                                    viewBox="0 0 24 24"
                                                    fill="currentColor"
                                                    stroke="none"
                                                >
                                                    <polygon
                                                        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                                                    />
                                                </svg>
                                            </span>
                                            <span
                                                v-if="
                                                    selectedPlaceRatingValueLabel
                                                "
                                                class="font-semibold text-daf-text-primary"
                                            >
                                                {{
                                                    selectedPlaceRatingValueLabel
                                                }}
                                            </span>
                                            <span
                                                v-if="
                                                    selectedPlaceRatingCountLabel
                                                "
                                            >
                                                {{
                                                    selectedPlaceRatingCountLabel
                                                }}
                                            </span>
                                            <span
                                                v-if="
                                                    selectedPlaceRatingValueLabel &&
                                                    selectedPlaceCategoryPriceLabel
                                                "
                                                class="text-daf-text-tertiary"
                                            >
                                                &middot;
                                            </span>
                                            <span
                                                v-if="
                                                    selectedPlaceCategoryPriceLabel
                                                "
                                            >
                                                {{
                                                    selectedPlaceCategoryPriceLabel
                                                }}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div
                                    v-if="selectedPlaceAddressLabel"
                                    class="mb-3.5 font-mono text-daf-body-sm text-daf-text-tertiary"
                                >
                                    {{ selectedPlaceAddressLabel }}
                                </div>

                                <div class="mb-[18px] flex flex-wrap gap-2">
                                    <DafBadge tone="brand">
                                        {{ selectedPlaceTypeLabel }}
                                    </DafBadge>
                                    <DafBadge
                                        v-if="
                                            selectedPlaceOpenStatusLabel !==
                                            'Hours unavailable'
                                        "
                                        tone="info"
                                    >
                                        {{ selectedPlaceOpenStatusLabel }}
                                    </DafBadge>
                                    <DafBadge
                                        v-if="selectedPlaceDetailsIsLoading"
                                        tone="ghost"
                                    >
                                        Updating
                                    </DafBadge>
                                </div>

                                <div
                                    class="mb-4 grid grid-cols-2 gap-x-4 gap-y-3.5"
                                >
                                    <div
                                        v-for="field in selectedPlaceBusinessFields"
                                        :key="field.label"
                                        class="min-w-0"
                                    >
                                        <div
                                            class="mb-[3px] font-mono text-daf-label font-semibold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary"
                                        >
                                            {{ field.label }}
                                        </div>
                                        <div
                                            :class="[
                                                'break-words text-daf-body-sm text-daf-text-primary',
                                                field.mono
                                                    ? 'font-mono'
                                                    : 'font-medium',
                                                field.brand
                                                    ? 'text-daf-text-brand'
                                                    : '',
                                            ]"
                                        >
                                            {{ field.value }}
                                        </div>
                                    </div>
                                </div>

                                <div
                                    class="mb-4 flex items-center gap-[9px] rounded-dafSm bg-[rgba(255,176,46,0.12)] px-3 py-2.5"
                                >
                                    <DafIcon
                                        class="shrink-0 text-daf-warning"
                                        name="scan-eye"
                                        size="16"
                                    />
                                    <span
                                        class="text-daf-caption text-daf-text-secondary"
                                    >
                                        <strong
                                            class="font-semibold text-daf-text-primary"
                                        >
                                            {{
                                                selectedPlaceNearbyNodeCountLabel
                                            }}
                                        </strong>
                                        within {{ NEARBY_NODE_RADIUS_LABEL }}
                                    </span>
                                </div>

                                <div class="grid gap-2">
                                    <DafButton
                                        full-width
                                        size="sm"
                                        @click="startDirectionsToSelectedPlace"
                                    >
                                        Directions
                                    </DafButton>
                                    <DafButton
                                        v-if="selectedPlaceGoogleMapsUrl"
                                        :external="true"
                                        full-width
                                        :href="selectedPlaceGoogleMapsUrl"
                                        size="sm"
                                        trailing-icon="external-link"
                                        variant="secondary"
                                    >
                                        Open in Google Maps
                                    </DafButton>
                                    <DafButton
                                        v-else
                                        disabled
                                        full-width
                                        size="sm"
                                        variant="secondary"
                                    >
                                        Open in Google Maps
                                    </DafButton>
                                </div>
                            </template>

                            <template v-else-if="selectedPlace">
                                <div
                                    class="mb-3.5 mr-9 flex items-start gap-[13px]"
                                >
                                    <span
                                        class="flex size-11 shrink-0 items-center justify-center rounded-dafMd bg-daf-surface-alt text-daf-text-secondary"
                                    >
                                        <DafIcon name="home" size="22" />
                                    </span>
                                    <div class="min-w-0">
                                        <h2
                                            class="mb-0.5 font-display text-daf-h3 font-bold leading-[var(--lh-h3)] tracking-[var(--ls-heading)] text-daf-text-primary"
                                        >
                                            {{ selectedPlaceTitle }}
                                        </h2>
                                        <div
                                            class="text-daf-body-sm text-daf-text-secondary"
                                        >
                                            {{ selectedPlaceAreaLabel }}
                                        </div>
                                    </div>
                                </div>

                                <div
                                    class="mb-3.5 font-mono text-daf-body-sm text-daf-text-tertiary"
                                >
                                    {{ selectedPlaceCoordinateLabel }}
                                </div>

                                <div class="mb-[18px] flex flex-wrap gap-2">
                                    <DafBadge tone="neutral">
                                        Residential
                                    </DafBadge>
                                    <DafBadge tone="ghost"> Address </DafBadge>
                                    <DafBadge
                                        v-if="selectedPlaceDetailsIsLoading"
                                        tone="ghost"
                                    >
                                        Updating
                                    </DafBadge>
                                </div>

                                <div
                                    class="mb-4 grid grid-cols-2 gap-x-4 gap-y-3.5"
                                >
                                    <div
                                        v-for="field in selectedPlaceResidentialFields"
                                        :key="field.label"
                                        class="min-w-0"
                                    >
                                        <div
                                            class="mb-[3px] font-mono text-daf-label font-semibold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary"
                                        >
                                            {{ field.label }}
                                        </div>
                                        <div
                                            :class="[
                                                'break-words text-daf-body-sm text-daf-text-primary',
                                                field.mono
                                                    ? 'font-mono'
                                                    : 'font-medium',
                                            ]"
                                        >
                                            {{ field.value }}
                                        </div>
                                    </div>
                                </div>

                                <div
                                    class="mb-4 flex items-center gap-[9px] rounded-dafSm bg-[rgba(255,176,46,0.12)] px-3 py-2.5"
                                >
                                    <DafIcon
                                        class="shrink-0 text-daf-warning"
                                        name="scan-eye"
                                        size="16"
                                    />
                                    <span
                                        class="text-daf-caption text-daf-text-secondary"
                                    >
                                        <strong
                                            class="font-semibold text-daf-text-primary"
                                        >
                                            {{
                                                selectedPlaceNearbyNodeCountLabel
                                            }}
                                        </strong>
                                        within {{ NEARBY_NODE_RADIUS_LABEL }}
                                    </span>
                                </div>

                                <div class="grid gap-2">
                                    <DafButton
                                        full-width
                                        size="sm"
                                        @click="startDirectionsToSelectedPlace"
                                    >
                                        Directions
                                    </DafButton>
                                    <DafButton
                                        v-if="selectedPlaceGoogleMapsUrl"
                                        :external="true"
                                        full-width
                                        :href="selectedPlaceGoogleMapsUrl"
                                        size="sm"
                                        trailing-icon="external-link"
                                        variant="secondary"
                                    >
                                        Open in Google Maps
                                    </DafButton>
                                    <DafButton
                                        v-else
                                        disabled
                                        full-width
                                        size="sm"
                                        variant="secondary"
                                    >
                                        Open in Google Maps
                                    </DafButton>
                                </div>
                            </template>

                            <template v-else>
                                <h2
                                    class="mb-0.5 mr-9 font-display text-daf-h3 font-bold leading-[var(--lh-h3)] tracking-[var(--ls-heading)] text-daf-text-primary"
                                >
                                    ALPR camera
                                </h2>
                                <div
                                    class="mb-3.5 font-mono text-daf-body-sm text-daf-text-tertiary"
                                >
                                    {{ selectedMarkerCoordinateLabel }}
                                </div>

                                <div class="mb-[18px] flex flex-wrap gap-2">
                                    <DafBadge icon="scan-eye" tone="alert">
                                        ALPR
                                    </DafBadge>
                                    <DafBadge tone="neutral">
                                        {{ selectedMarkerManufacturer }}
                                    </DafBadge>
                                </div>

                                <div
                                    class="mb-4 grid grid-cols-2 gap-x-4 gap-y-3.5"
                                >
                                    <div
                                        v-for="field in selectedMarkerFields"
                                        :key="field.label"
                                        class="min-w-0"
                                    >
                                        <div
                                            class="mb-[3px] font-mono text-daf-label font-semibold uppercase tracking-[var(--ls-label)] text-daf-text-tertiary"
                                        >
                                            {{ field.label }}
                                        </div>
                                        <div
                                            :class="[
                                                'break-words text-daf-body-sm text-daf-text-primary',
                                                field.mono
                                                    ? 'font-mono'
                                                    : 'font-medium',
                                            ]"
                                        >
                                            {{ field.value }}
                                        </div>
                                    </div>
                                </div>

                                <div
                                    class="mb-4 flex items-center gap-[9px] rounded-dafSm bg-daf-surface-alt px-3 py-2.5"
                                >
                                    <DafIcon
                                        class="shrink-0 text-daf-text-tertiary"
                                        name="map-pin"
                                        size="16"
                                    />
                                    <span
                                        class="text-daf-caption text-daf-text-secondary"
                                    >
                                        From OpenStreetMap contributors
                                    </span>
                                </div>

                                <div class="grid gap-2">
                                    <DafButton
                                        :disabled="!selectedMarkerOsmUrl"
                                        :external="true"
                                        full-width
                                        :href="selectedMarkerOsmUrl"
                                        trailing-icon="external-link"
                                        variant="secondary"
                                    >
                                        Open on OpenStreetMap
                                    </DafButton>
                                </div>
                            </template>
                        </section>
                        <button
                            class="absolute left-[-22px] top-1/2 z-10 flex h-14 w-[22px] -translate-y-1/2 items-center justify-center rounded-l-dafMd border border-r-0 border-daf-border-glass bg-daf-surface-raised p-0 text-daf-text-tertiary shadow-dafFloat transition-colors duration-150 hover:text-daf-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daf-focus sm:h-[60px]"
                            type="button"
                            aria-controls="marker-details-card"
                            :aria-expanded="!markerPanelIsCollapsed"
                            :aria-label="markerPanelToggleLabel"
                            @click="toggleMarkerPanel"
                        >
                            <DafIcon
                                :class="[
                                    'transition-transform duration-200 motion-reduce:transition-none',
                                    markerPanelIsCollapsed ? 'rotate-180' : '',
                                ]"
                                name="chevron-right"
                                size="15"
                                stroke="2.3"
                            />
                        </button>
                    </div>
                </div>
            </section>

            <Transition name="map-splash">
                <div
                    v-if="mapSplashIsVisible"
                    class="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-daf-surface-page text-daf-text-primary"
                    role="status"
                    aria-live="polite"
                    aria-label="Loading camera markers"
                >
                    <DafMarkerLoadingProgress
                        :stage="markerLoadingStage"
                        :stages="MARKER_LOADING_STAGES"
                    />
                </div>
            </Transition>
        </main>
    </div>
</template>

<style scoped>
.settings-disclosure-enter-active,
.settings-disclosure-leave-active {
    max-height: 15rem;
    overflow: hidden;
    transition:
        max-height var(--dur-base) var(--ease-standard),
        opacity var(--dur-base) var(--ease-standard),
        transform var(--dur-base) var(--ease-standard);
}

.settings-disclosure-enter-from,
.settings-disclosure-leave-to {
    max-height: 0;
    opacity: 0;
    transform: translateY(-0.25rem);
}

.daf-avoid-buffer-range {
    width: 100%;
    height: 0.5rem;
    cursor: pointer;
    appearance: none;
    border-radius: var(--radius-pill);
    background: var(--surface-card-alt);
}

.daf-avoid-buffer-range:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 3px;
}

.daf-avoid-buffer-range::-webkit-slider-thumb {
    width: 1.125rem;
    height: 1.125rem;
    appearance: none;
    border: 2px solid var(--brand-contrast);
    border-radius: 9999px;
    background: var(--brand);
    box-shadow: var(--shadow-card);
}

.daf-avoid-buffer-range::-moz-range-thumb {
    width: 1.125rem;
    height: 1.125rem;
    border: 2px solid var(--brand-contrast);
    border-radius: 9999px;
    background: var(--brand);
    box-shadow: var(--shadow-card);
}

.map-splash-enter-active,
.map-splash-leave-active {
    transition:
        opacity var(--dur-sheet) var(--ease-standard),
        transform var(--dur-sheet) var(--ease-standard);
}

.map-splash-enter-from,
.map-splash-leave-to {
    opacity: 0;
    transform: scale(1.01);
}

@media (prefers-reduced-motion: reduce) {
    .settings-disclosure-enter-active,
    .settings-disclosure-leave-active,
    .map-splash-enter-active,
    .map-splash-leave-active {
        transition-duration: 0ms;
    }

    .map-splash-enter-from,
    .map-splash-leave-to {
        transform: none;
    }
}
</style>
