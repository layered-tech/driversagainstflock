import {
    addEnhancedLocationListener,
    getLastEnhancedLocationAsync,
} from '@rnmapbox/navigation';
import * as Location from 'expo-location';
import {
    startAutoDriveSimulation,
    stopAutoDriveSimulation,
} from './auto-play-drive-simulation';
import {
    getAutoPlayMapControlHandlers,
    setAutoPlayMapButtonAppearanceListener,
    setAutoPlayMapColorScheme,
} from './auto-play-map-surface';
// Metro resolves the platform adapter per platform: Android Auto specifics in
// auto-play-platform.android.js, CarPlay specifics in auto-play-platform.ios.js.
import { autoPlayPlatform } from './auto-play-platform';
import {
    DEFAULT_AUTO_PLAY_STATE,
    getAutoPlayState,
    setAutoPlayState,
} from './auto-play-state';
import {
    getDirections,
    getPlaceDetails,
    searchPlaces,
    searchTextPlaces,
} from './map/api';
import { PLACE_SEARCH_MIN_QUERY_LENGTH } from './map/constants';
import {
    createCurrentLocationDirectionsWaypoint,
    createPlaceDirectionsWaypoint,
    DIRECTIONS_ROUTE_FASTEST,
    DIRECTIONS_ROUTE_PRIVATE,
    formatDirectionsDistance,
    formatDirectionsDistanceDelta,
    formatDirectionsDuration,
    formatDirectionsDurationDelta,
    formatDirectionsManeuverDistance,
    getActiveDirectionsManeuver,
    getDirectionsDistanceEstimate,
    getDirectionsRouteOptions,
    getDirectionsRouteProgress,
    getDirectionsWaypointApiCoord,
    getSelectedDirectionsRouteOption,
    selectDirectionsRoute,
} from './map/directions';
import { formatSearchResultDistance } from './map/search-formatters';
import {
    addSharedRoutingStateListener,
    getDirectionsRouteSyncKey,
    getSharedRoutingState,
    setSharedRoutingState,
} from './map/shared-routing-state';
import {
    getEnhancedLocationUpdate,
    mapboxNavigationEnhancedLocationIsSupported,
} from './map/use-device-location';

const LOCATION_TIMEOUT_MS = 10000;
const SEARCH_DEBOUNCE_MS = 450;
const NAVIGATION_LOCATION_INTERVAL_MS = 4000;
const NAVIGATION_LOCATION_DISTANCE_METERS = 12;
const AUTO_PLAY_ICON_FONT_NAME = 'font_awesome';
const AUTO_PLAY_ICON_GLYPH_MAP = {
    'arrow-left': 0xf060,
    'arrow-right': 0xf061,
    'arrow-up': 0xf062,
    arrows: 0xf047,
    car: 0xf1b9,
    crosshairs: 0xf05b,
    'flag-checkered': 0xf11e,
    'level-up-alt': 0xf3bf,
    location: 0xf3c5,
    minus: 0xf068,
    plus: 0xf067,
    search: 0xf002,
    xmark: 0xf00d,
};
const AUTO_PLAY_GLYPH_COLOR = {
    darkColor: 'white',
    lightColor: 'black',
};
const AUTO_PLAY_GLYPH_BACKGROUND_COLOR = {
    darkColor: 'rgba(23,23,23,0.72)',
    lightColor: 'rgba(255,255,255,0.68)',
};
const ROOT_MAP_BUTTON_APPEARANCE_DEFAULTS = {
    isDarkMapLayer: false,
    trackingState: 'inactive',
};
const ROOT_MAP_BUTTON_ACTIVE_ICON_COLOR = '#2563eb';
const ROOT_MAP_BUTTON_DARK_ICON_COLOR = '#ffffff';
const ROOT_MAP_BUTTON_LIGHT_ICON_COLOR = '#171717';
const ROOT_MAP_BUTTON_ACTIVE_BACKGROUND_COLOR = 'rgba(239,246,255,0.78)';
const ROOT_MAP_BUTTON_EXIT_ICON_COLOR = {
    darkColor: '#fca5a5',
    lightColor: '#b91c1c',
};
const ROOT_MAP_BUTTON_EXIT_BACKGROUND_COLOR = AUTO_PLAY_GLYPH_BACKGROUND_COLOR;
const AUTO_PLAY_MANEUVER_CARD_BACKGROUND_COLOR = {
    darkColor: '#111827',
    lightColor: '#f9fafb',
};
const AUTO_PLAY_MANEUVER_TYPE = {
    Arrive: 10,
    Depart: 0,
    Keep: 90,
    Roundabout: 40,
    Straight: 20,
    Turn: 30,
};
const AUTO_PLAY_TRAFFIC_SIDE = {
    Right: 0,
};
const AUTO_PLAY_TURN_TYPE = {
    NoTurn: 0,
    NormalLeft: 3,
    NormalRight: 4,
    SharpLeft: 5,
    SharpRight: 6,
    SlightLeft: 1,
    SlightRight: 2,
    UTurnLeft: 7,
};
const AUTO_PLAY_KEEP_TYPE = {
    Left: 0,
    Right: 1,
};

function getRootMapButtonDefaultIconColor() {
    return rootMapButtonAppearance.isDarkMapLayer
        ? ROOT_MAP_BUTTON_DARK_ICON_COLOR
        : ROOT_MAP_BUTTON_LIGHT_ICON_COLOR;
}

// The car host resolves {darkColor, lightColor} pairs with its own day/night
// state (CarContext.isDarkMode), which ignores the app's time-of-day light
// preset. Android Auto pins this card dark to match its host-owned controls
// and destination card; other platforms keep following the rendered map.
function getManeuverCardBackgroundColor() {
    if (autoPlayPlatform?.maneuverCardAppearance === 'dark') {
        return AUTO_PLAY_MANEUVER_CARD_BACKGROUND_COLOR.darkColor;
    }

    return rootMapButtonAppearance.isDarkMapLayer
        ? AUTO_PLAY_MANEUVER_CARD_BACKGROUND_COLOR.darkColor
        : AUTO_PLAY_MANEUVER_CARD_BACKGROUND_COLOR.lightColor;
}

function getManeuverCardIconColor() {
    return (
        autoPlayPlatform?.maneuverCardIconColor ??
        getRootMapButtonDefaultIconColor()
    );
}

function makeGlyphImage(name, options = {}) {
    return {
        backgroundColor:
            options.backgroundColor ?? AUTO_PLAY_GLYPH_BACKGROUND_COLOR,
        color: options.color ?? AUTO_PLAY_GLYPH_COLOR,
        name,
        type: 'glyph',
    };
}

const ROOT_MAP_CONTROL_BUTTON_IMAGE = {
    fontScale: 0.78,
};

let autoPlayModule;
let autoPlayRegistered = false;
let rootMapTemplate = null;
let rootMapTemplateIsReady = false;
let rootMapButtonAppearance = ROOT_MAP_BUTTON_APPEARANCE_DEFAULTS;
let rootMapButtonAppearanceKey = '';
let navigationLocationSubscription = null;
let searchAbortController = null;
let searchDebounceTimer = null;
let activeNavigationRoute = null;
let lastNavigationGuidanceLocation = null;
// Latched when the car host invokes NavigationManagerCallback.onAutoDriveEnabled
// and held until the Android Auto session is destroyed, per the Play Store
// navigation quality requirements.
let autoDriveIsEnabled = false;

// Android Auto's host process throttles template refreshes (~5/30s outside
// navigation). Each setMapButtons / setHeaderActions call posts a separate
// Screen.invalidate() on the native side, so firing them back-to-back during
// the same React tick wastes the quota and makes button presses feel delayed.
// Coalesce them into a single trailing-edge flush per microtask.
let templateUpdateScheduled = false;
let templateUpdateNeedsMapButtons = false;
let templateUpdateNeedsHeaderActions = false;

function flushTemplateUpdates() {
    templateUpdateScheduled = false;
    const needsMapButtons = templateUpdateNeedsMapButtons;
    const needsHeaderActions = templateUpdateNeedsHeaderActions;
    templateUpdateNeedsMapButtons = false;
    templateUpdateNeedsHeaderActions = false;

    if (!rootMapTemplate || !rootMapTemplateIsReady) {
        return;
    }

    if (needsMapButtons) {
        try {
            rootMapTemplate.setMapButtons(getRootMapButtons()).catch(() => {});
        } catch {
            // Map buttons can be restored on the next surface state update.
        }
    }

    if (needsHeaderActions) {
        try {
            rootMapTemplate
                .setHeaderActions(getRootMapHeaderActions())
                .catch(() => {});
        } catch {
            // Header actions are chrome; a failed refresh should not stop navigation.
        }
    }
}

function scheduleTemplateUpdate({ mapButtons = false, headerActions = false }) {
    templateUpdateNeedsMapButtons ||= mapButtons;
    templateUpdateNeedsHeaderActions ||= headerActions;

    if (templateUpdateScheduled) {
        return;
    }
    templateUpdateScheduled = true;
    Promise.resolve().then(flushTemplateUpdates);
}
let activeNavigationDestination = null;
let sharedRoutingStateUnsubscribe = null;

function loadAutoPlayModule() {
    if (!autoPlayModule) {
        autoPlayModule = require('@iternio/react-native-auto-play');
        autoPlayModule.setIconFont?.(
            AUTO_PLAY_ICON_FONT_NAME,
            AUTO_PLAY_ICON_GLYPH_MAP,
        );
    }

    return autoPlayModule;
}

function makeAutoText(value) {
    return { text: String(value ?? '') };
}

function getTimezone() {
    return (
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'
    );
}

function getFiniteNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

function normalizeCoordinatePair(coordinate) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return null;
    }

    const longitude = getFiniteNumber(coordinate[0]);
    const latitude = getFiniteNumber(coordinate[1]);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return [longitude, latitude];
}

function getAutoPlayLocation(coordinates) {
    const latitude = getFiniteNumber(coordinates?.lat);
    const longitude = getFiniteNumber(coordinates?.lon);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return {
        latitude,
        longitude,
    };
}

function getLocationFromPosition(position) {
    const latitude = getFiniteNumber(position?.coords?.latitude);
    const longitude = getFiniteNumber(position?.coords?.longitude);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90
    ) {
        return null;
    }

    return {
        latitude,
        longitude,
    };
}

function withTimeout(promise, timeoutMs, message) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(message));
            }, timeoutMs);
        }),
    ]);
}

async function getLocationPermissionIsGranted() {
    const permission = await Location.getForegroundPermissionsAsync().catch(
        () => null,
    );

    return permission?.status === 'granted';
}

async function getLastKnownLocation() {
    if (!(await getLocationPermissionIsGranted())) {
        return null;
    }

    const position = await Location.getLastKnownPositionAsync().catch(
        () => null,
    );

    return getLocationFromPosition(position);
}

async function getCurrentLocation() {
    if (!(await getLocationPermissionIsGranted())) {
        throw new Error(
            'Location permission is required. Open the phone app and allow location before starting car screen directions.',
        );
    }

    const currentPosition = await withTimeout(
        Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        }),
        LOCATION_TIMEOUT_MS,
        'Current location timed out.',
    ).catch(() => null);
    const currentLocation = getLocationFromPosition(currentPosition);

    if (currentLocation) {
        return currentLocation;
    }

    const lastKnownLocation = await getLastKnownLocation();

    if (lastKnownLocation) {
        return lastKnownLocation;
    }

    throw new Error('Current location is not available.');
}

async function getStartWaypoint(preferredLocation) {
    const location = preferredLocation ?? (await getCurrentLocation());
    const waypoint = createCurrentLocationDirectionsWaypoint(location);

    if (!waypoint) {
        throw new Error('Current location is not available.');
    }

    return {
        ...waypoint,
        label: preferredLocation ? 'Car location' : waypoint.label,
    };
}

function getSearchResultSubtitle(result) {
    const distanceLabel = formatSearchResultDistance(result?.distanceMeters);

    return [result?.secondaryText, distanceLabel].filter(Boolean).join(' - ');
}

function makeDisabledSearchRow(title, detailedText) {
    return {
        detailedText: makeAutoText(detailedText),
        enabled: false,
        onPress: () => {},
        title: makeAutoText(title),
        type: 'default',
    };
}

function makeSearchRows(results, query, preferredStartLocation, template) {
    if (!results.length) {
        return [
            makeDisabledSearchRow(
                'No results',
                query
                    ? `No places found for "${query}".`
                    : 'Enter a destination.',
            ),
        ];
    }

    return results.slice(0, 6).map((result) => ({
        detailedText: makeAutoText(getSearchResultSubtitle(result)),
        onPress: () => {
            handleSearchResultSelected(
                result,
                preferredStartLocation,
                template,
            );
        },
        title: makeAutoText(result.primaryText || result.label || 'Place'),
        type: 'default',
    }));
}

function updateSearchTemplateResults(template, results, query, startLocation) {
    updateSearchTemplateSection(template, {
        items: makeSearchRows(results, query, startLocation, template),
        type: 'default',
    });
}

function updateSearchTemplateLoadingRoute(template, title) {
    updateSearchTemplateSection(template, {
        items: [
            makeDisabledSearchRow(
                'Loading route',
                title
                    ? `Loading directions to ${title}.`
                    : 'Loading directions.',
            ),
        ],
        type: 'default',
    });
}

function updateSearchTemplateSection(template, section) {
    try {
        const updatePromise = template?.updateSearchResults(section);

        if (updatePromise && typeof updatePromise.catch === 'function') {
            updatePromise.catch(() => {});
        }
    } catch {
        // The native SearchTemplate can be removed before debounced search results return.
    }
}

function abortSearchRequest() {
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
    }

    if (searchAbortController) {
        searchAbortController.abort();
        searchAbortController = null;
    }
}

async function runPlaceAutocomplete(template, searchText, startLocation) {
    const input = String(searchText ?? '').trim();

    if (input.length < PLACE_SEARCH_MIN_QUERY_LENGTH) {
        updateSearchTemplateResults(template, [], input, startLocation);
        return;
    }

    abortSearchRequest();
    const abortController = new AbortController();
    searchAbortController = abortController;

    try {
        const location = startLocation ?? (await getLastKnownLocation());
        const results = await searchPlaces({
            input,
            location,
            signal: abortController.signal,
        });

        updateSearchTemplateResults(template, results, input, startLocation);
    } catch (error) {
        if (error?.name !== 'AbortError') {
            updateSearchTemplateResults(
                template,
                [],
                error?.message || 'Search failed.',
                startLocation,
            );
            setAutoPlayState({
                errorText: error?.message || 'Search failed.',
                statusLabel: 'Search error',
            });
        }
    } finally {
        if (searchAbortController === abortController) {
            searchAbortController = null;
        }
    }
}

async function runPlaceTextSearch(template, searchText, startLocation) {
    const textQuery = String(searchText ?? '').trim();

    if (textQuery.length < PLACE_SEARCH_MIN_QUERY_LENGTH) {
        updateSearchTemplateResults(template, [], textQuery, startLocation);
        return;
    }

    abortSearchRequest();
    const abortController = new AbortController();
    searchAbortController = abortController;

    try {
        const location = startLocation ?? (await getLastKnownLocation());
        const results = await searchTextPlaces({
            location,
            signal: abortController.signal,
            textQuery,
        });

        updateSearchTemplateResults(
            template,
            results,
            textQuery,
            startLocation,
        );
    } catch (error) {
        if (error?.name !== 'AbortError') {
            updateSearchTemplateResults(
                template,
                [],
                error?.message || 'Search failed.',
                startLocation,
            );
            setAutoPlayState({
                errorText: error?.message || 'Search failed.',
                statusLabel: 'Search error',
            });
        }
    } finally {
        if (searchAbortController === abortController) {
            searchAbortController = null;
        }
    }
}

function schedulePlaceAutocomplete(template, searchText, startLocation) {
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
    }

    searchDebounceTimer = setTimeout(() => {
        runPlaceAutocomplete(template, searchText, startLocation);
    }, SEARCH_DEBOUNCE_MS);
}

// onBeforePop runs for explicit back presses; CarPlay does not deliver
// onPopped for every template, so cleanup must ride the button itself there.
function getBackHeaderAction(onBeforePop) {
    const { HybridAutoPlay } = loadAutoPlayModule();
    const backButton = {
        onPress: () => {
            onBeforePop?.();
            HybridAutoPlay.popTemplate().catch(() => {});
        },
        type: 'back',
    };

    return {
        android: {
            startHeaderAction: backButton,
        },
        ios: {
            backButton,
        },
    };
}

function openSearchTemplate(initialSearchText = '', preferredStartLocation) {
    const { SearchTemplate } = loadAutoPlayModule();
    const template = new SearchTemplate({
        headerActions: getBackHeaderAction(abortSearchRequest),
        initialSearchText,
        onSearchTextChanged: (searchText) => {
            schedulePlaceAutocomplete(
                template,
                searchText,
                preferredStartLocation,
            );
        },
        onSearchTextSubmitted: (searchText) => {
            runPlaceTextSearch(template, searchText, preferredStartLocation);
        },
        onPopped: () => {
            abortSearchRequest();
        },
        results: {
            items: [
                makeDisabledSearchRow(
                    'Search',
                    'Enter a destination or use voice.',
                ),
            ],
            type: 'default',
        },
        searchHint: 'Where to?',
        title: makeAutoText('Destination'),
    });

    setAutoPlayState({
        detailText: 'Choose a destination on the car screen.',
        errorText: '',
        statusLabel: 'Search',
    });

    template.push().catch((error) => {
        setAutoPlayState({
            errorText: error?.message || 'Search could not be opened.',
            statusLabel: 'Search error',
        });
    });

    if (initialSearchText) {
        runPlaceTextSearch(template, initialSearchText, preferredStartLocation);
    }
}

function getRouteNumberDelta(value, baseline) {
    const numericValue = Number(value);
    const numericBaseline = Number(baseline);

    return Number.isFinite(numericValue) && Number.isFinite(numericBaseline)
        ? numericValue - numericBaseline
        : null;
}

function getPotentiallyAvoidedNodeCount(route, baselineRouteOption) {
    return (
        Number(route?.fastestRouteNodeCount) ||
        Number(baselineRouteOption?.nodeCount) ||
        0
    );
}

function getPotentiallyAvoidedNodesText(nodeCount) {
    return nodeCount > 0
        ? `Potentially avoids ${nodeCount} monitored ${nodeCount === 1 ? 'node' : 'nodes'}`
        : '';
}

function getRouteOptionDetail(routeOption, baselineRouteOption, route) {
    const durationLabel = formatDirectionsDuration(routeOption.duration);
    const distanceLabel = formatDirectionsDistance(routeOption.distance);
    const potentiallyAvoidedNodeCount = getPotentiallyAvoidedNodeCount(
        route,
        baselineRouteOption,
    );
    const durationDelta = getRouteNumberDelta(
        routeOption.duration,
        baselineRouteOption?.duration,
    );
    const distanceDelta = getRouteNumberDelta(
        routeOption.distance,
        baselineRouteOption?.distance,
    );
    const baselineDetail =
        routeOption.routeKey === DIRECTIONS_ROUTE_FASTEST
            ? 'Fastest baseline'
            : '';
    const deltaDetail =
        routeOption.routeKey !== DIRECTIONS_ROUTE_FASTEST
            ? [
                  durationDelta === null
                      ? ''
                      : formatDirectionsDurationDelta(durationDelta),
                  distanceDelta === null
                      ? ''
                      : formatDirectionsDistanceDelta(distanceDelta),
              ]
                  .filter(Boolean)
                  .join(' - ')
            : '';
    const privateRouteDetail =
        routeOption.routeKey === DIRECTIONS_ROUTE_PRIVATE
            ? getPotentiallyAvoidedNodesText(potentiallyAvoidedNodeCount)
            : '';

    return [
        durationLabel,
        distanceLabel,
        baselineDetail,
        deltaDetail,
        privateRouteDetail,
    ]
        .filter(Boolean)
        .join(' - ');
}

function showRoutePreview(route) {
    const { ListTemplate } = loadAutoPlayModule();
    const routeOptions = getDirectionsRouteOptions(route);
    const baselineRouteOption =
        routeOptions.find(
            (routeOption) => routeOption.routeKey === DIRECTIONS_ROUTE_FASTEST,
        ) ?? routeOptions[0];
    const items = routeOptions.map((routeOption) => ({
        detailedText: makeAutoText(
            getRouteOptionDetail(routeOption, baselineRouteOption, route),
        ),
        onPress: () => {
            startAutoPlayNavigation(
                selectDirectionsRoute(route, routeOption.routeKey),
            );
        },
        title: makeAutoText(`Start ${routeOption.routeLabel} route`),
        type: 'default',
    }));
    const previewTemplate = new ListTemplate({
        headerActions: getBackHeaderAction(),
        sections: {
            items: items.length
                ? items
                : [
                      makeDisabledSearchRow(
                          'Route unavailable',
                          'Directions did not include a usable route.',
                      ),
                  ],
            type: 'default',
        },
        title: makeAutoText('Route options'),
    });
    const selectedRoute = getSelectedDirectionsRouteOption(route);

    setAutoPlayState({
        detailText: 'Review the available route options.',
        directionsRoute: null,
        errorText: '',
        isNavigating: false,
        maneuverText: '',
        routeDistanceText: formatDirectionsDistance(selectedRoute?.distance),
        routeDurationText: formatDirectionsDuration(selectedRoute?.duration),
        routeName: selectedRoute?.routeLabel
            ? `${selectedRoute.routeLabel} route`
            : 'Route',
        statusLabel: 'Route ready',
        title: route.destination?.label || 'Destination',
    });

    previewTemplate.push().catch((error) => {
        setAutoPlayState({
            errorText: error?.message || 'Route options could not be opened.',
            statusLabel: 'Route error',
        });
    });
}

async function resolvePlaceForResult(result) {
    if (result?.place?.location) {
        return result.place;
    }

    if (!result?.placeId) {
        throw new Error('Place details could not be loaded.');
    }

    return getPlaceDetails({ placeId: result.placeId });
}

async function handleSearchResultSelected(
    result,
    preferredStartLocation,
    template,
) {
    abortSearchRequest();

    const title = result?.primaryText || result?.label || 'Destination';
    updateSearchTemplateLoadingRoute(template, title);

    setAutoPlayState({
        detailText: 'Loading place details and route.',
        directionsRoute: null,
        errorText: '',
        maneuverText: '',
        routeDistanceText: '',
        routeDurationText: '',
        routeName: '',
        statusLabel: 'Loading route',
        title,
    });

    try {
        const place = await resolvePlaceForResult(result);
        const destinationWaypoint = createPlaceDirectionsWaypoint({
            address: result?.secondaryText,
            name: result?.primaryText,
            place,
            result,
        });

        if (!destinationWaypoint) {
            throw new Error('Destination location could not be loaded.');
        }

        const startWaypoint = await getStartWaypoint(preferredStartLocation);
        const routeStart = getDirectionsWaypointApiCoord(startWaypoint);
        const routeEnd = getDirectionsWaypointApiCoord(destinationWaypoint);

        if (!routeStart || !routeEnd) {
            throw new Error('Directions need both a start and destination.');
        }

        const { route } = await getDirections({
            end: routeEnd,
            start: routeStart,
        });

        showRoutePreview({
            ...route,
            destination: destinationWaypoint,
            requestedAt: Date.now(),
            start: startWaypoint,
        });
    } catch (error) {
        showAutoPlayError(
            'Route unavailable',
            error?.message || 'Directions could not be loaded.',
        );
    }
}

function getTripPointFromCoordinate(coordinate, name, estimates) {
    const normalizedCoordinate = normalizeCoordinatePair(coordinate);

    if (!normalizedCoordinate) {
        return null;
    }

    return {
        latitude: normalizedCoordinate[1],
        longitude: normalizedCoordinate[0],
        name,
        travelEstimates: estimates,
    };
}

function getWaypointLocationCoordinate(waypoint) {
    if (
        waypoint?.location?.latitude === null ||
        waypoint?.location?.latitude === undefined ||
        waypoint?.location?.longitude === null ||
        waypoint?.location?.longitude === undefined
    ) {
        return null;
    }

    const latitude = getFiniteNumber(waypoint?.location?.latitude);
    const longitude = getFiniteNumber(waypoint?.location?.longitude);

    return normalizeCoordinatePair([longitude, latitude]);
}

function makeTravelEstimates(distanceMeters, durationSeconds, tripText) {
    const distanceRemaining = getDirectionsDistanceEstimate(distanceMeters) ?? {
        unit: 'feet',
        value: 0,
    };

    return {
        distanceRemaining,
        timeRemaining: {
            seconds: Math.max(0, Math.round(Number(durationSeconds) || 0)),
            timezone: getTimezone(),
        },
        ...(tripText ? { tripText: { text: tripText } } : {}),
    };
}

function getManeuverCoordinate(routeOption, maneuver, fallbackIndex) {
    const waypointIndex = Array.isArray(maneuver?.way_points)
        ? Math.max(0, Math.round(Number(maneuver.way_points[0]) || 0))
        : fallbackIndex;

    return (
        normalizeCoordinatePair(routeOption.coordinates?.[waypointIndex]) ??
        normalizeCoordinatePair(maneuver?.maneuver?.location) ??
        normalizeCoordinatePair(routeOption.coordinates?.[fallbackIndex]) ??
        normalizeCoordinatePair(routeOption.coordinates?.[0])
    );
}

function makeTripSteps(routeOption, route) {
    const maneuvers = routeOption?.maneuvers ?? [];
    const steps = [];
    let remainingDistance =
        Number(routeOption?.distance) ||
        maneuvers.reduce(
            (total, maneuver) => total + (maneuver.distance || 0),
            0,
        );
    let remainingDuration =
        Number(routeOption?.duration) ||
        maneuvers.reduce(
            (total, maneuver) => total + (maneuver.duration || 0),
            0,
        );

    maneuvers.forEach((maneuver, index) => {
        const coordinate = getManeuverCoordinate(routeOption, maneuver, index);
        const instruction =
            maneuver.instruction ||
            maneuver.name ||
            (index === 0 ? 'Start route' : 'Continue');
        const step = getTripPointFromCoordinate(
            coordinate,
            instruction,
            makeTravelEstimates(
                remainingDistance,
                remainingDuration,
                instruction,
            ),
        );

        if (step) {
            steps.push(step);
        }

        remainingDistance = Math.max(
            0,
            remainingDistance - (maneuver.distance || 0),
        );
        remainingDuration = Math.max(
            0,
            remainingDuration - (maneuver.duration || 0),
        );
    });

    const destinationCoordinate =
        routeOption.coordinates?.[routeOption.coordinates.length - 1];
    const destinationName =
        route?.destination?.label ||
        route?.destination?.inputValue ||
        'Destination';
    const destinationStep = getTripPointFromCoordinate(
        destinationCoordinate,
        destinationName,
        makeTravelEstimates(0, 0, destinationName),
    );

    if (destinationStep) {
        steps.push(destinationStep);
    }

    if (steps.length < 2) {
        const startCoordinate =
            getWaypointLocationCoordinate(route?.start) ??
            normalizeCoordinatePair(routeOption?.coordinates?.[0]);
        const fallbackDestinationCoordinate =
            getWaypointLocationCoordinate(route?.destination) ??
            normalizeCoordinatePair(destinationCoordinate);
        const startStep = getTripPointFromCoordinate(
            startCoordinate,
            route?.start?.label || 'Start',
            makeTravelEstimates(
                routeOption?.distance,
                routeOption?.duration,
                'Start',
            ),
        );

        if (startStep) {
            steps.unshift(startStep);
        }

        const fallbackDestinationStep = getTripPointFromCoordinate(
            fallbackDestinationCoordinate,
            destinationName,
            makeTravelEstimates(0, 0, destinationName),
        );

        if (fallbackDestinationStep && steps.length < 2) {
            steps.push(fallbackDestinationStep);
        }
    }

    return steps.filter(Boolean).slice(0, 12);
}

function makeTripConfig(route) {
    const routeOption = getSelectedDirectionsRouteOption(route);
    const routeLabel = routeOption?.routeLabel || 'Route';
    const routeSummary = [
        formatDirectionsDuration(routeOption?.duration),
        formatDirectionsDistance(routeOption?.distance),
    ]
        .filter(Boolean)
        .join(' - ');
    const steps = makeTripSteps(routeOption, route);

    if (steps.length < 2) {
        throw new Error('Route did not include enough navigation steps.');
    }

    return {
        id: `daf-${routeOption?.routeKey || 'route'}-${Date.now()}`,
        routeChoice: {
            additionalInformationVariants: [routeSummary || routeLabel],
            id: routeOption?.routeKey || 'route',
            selectionSummaryVariants: [routeSummary || routeLabel],
            steps,
            summaryVariants: [`${routeLabel} route`],
        },
    };
}

function getManeuverInstruction(maneuver) {
    return (
        maneuver?.instruction ||
        maneuver?.name ||
        maneuver?.typeLabel ||
        'Continue'
    );
}

function getManeuverNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

function getAutoPlayManeuverConfig(maneuver) {
    switch (getManeuverNumber(maneuver?.type)) {
        case 0:
            return {
                glyph: 'arrow-left',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Turn,
                turnType: AUTO_PLAY_TURN_TYPE.NormalLeft,
            };
        case 1:
            return {
                glyph: 'arrow-right',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Turn,
                turnType: AUTO_PLAY_TURN_TYPE.NormalRight,
            };
        case 2:
            return {
                glyph: 'arrow-left',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Turn,
                turnType: AUTO_PLAY_TURN_TYPE.SharpLeft,
            };
        case 3:
            return {
                glyph: 'arrow-right',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Turn,
                turnType: AUTO_PLAY_TURN_TYPE.SharpRight,
            };
        case 4:
            return {
                glyph: 'arrow-left',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Turn,
                turnType: AUTO_PLAY_TURN_TYPE.SlightLeft,
            };
        case 5:
            return {
                glyph: 'arrow-right',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Turn,
                turnType: AUTO_PLAY_TURN_TYPE.SlightRight,
            };
        case 7:
        case 8:
            return {
                exitNumber:
                    getManeuverNumber(maneuver?.exit_number) ?? undefined,
                glyph: 'level-up-alt',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Roundabout,
            };
        case 9:
            return {
                glyph: 'level-up-alt',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Turn,
                turnType: AUTO_PLAY_TURN_TYPE.UTurnLeft,
            };
        case 10:
            return {
                glyph: 'flag-checkered',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Arrive,
            };
        case 11:
            return {
                glyph: 'arrow-up',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Depart,
            };
        case 12:
            return {
                glyph: 'arrow-left',
                keepType: AUTO_PLAY_KEEP_TYPE.Left,
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Keep,
            };
        case 13:
            return {
                glyph: 'arrow-right',
                keepType: AUTO_PLAY_KEEP_TYPE.Right,
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Keep,
            };
        case 6:
        default:
            return {
                glyph: 'arrow-up',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Straight,
                turnType: AUTO_PLAY_TURN_TYPE.NoTurn,
            };
    }
}

function getManeuverDurationSeconds(maneuver, distanceRemaining, routeOption) {
    const maneuverDuration = getManeuverNumber(maneuver?.duration);
    const maneuverDistance = getManeuverNumber(maneuver?.distance);

    if (maneuverDuration !== null && maneuverDuration >= 0) {
        if (
            maneuverDistance !== null &&
            maneuverDistance > 0 &&
            distanceRemaining < maneuverDistance
        ) {
            return Math.max(
                0,
                maneuverDuration * (distanceRemaining / maneuverDistance),
            );
        }

        return maneuverDuration;
    }

    const routeDistance = getManeuverNumber(routeOption?.distance);
    const routeDuration = getManeuverNumber(routeOption?.duration);

    if (routeDistance && routeDuration) {
        return Math.max(0, routeDuration * (distanceRemaining / routeDistance));
    }

    return 0;
}

function getManeuverDistanceRemaining(maneuver) {
    const distanceToManeuver = getManeuverNumber(maneuver?.distanceToManeuver);

    if (distanceToManeuver !== null) {
        return distanceToManeuver;
    }

    const distance = getManeuverNumber(maneuver?.distance);

    return distance !== null ? Math.max(0, distance) : 0;
}

function getNextDirectionsManeuver(route, currentManeuver) {
    const routeOption = getSelectedDirectionsRouteOption(route);
    const maneuvers = routeOption?.maneuvers ?? [];
    const currentStepIndex = getManeuverNumber(currentManeuver?.stepIndex);

    if (currentStepIndex === null) {
        return null;
    }

    return (
        maneuvers.find((maneuver) => {
            return (
                getManeuverNumber(maneuver?.stepIndex) > currentStepIndex &&
                getManeuverNumber(maneuver?.type) !== 11
            );
        }) ?? null
    );
}

function makeAutoPlayRoutingManeuver(route, maneuver) {
    if (!maneuver) {
        return null;
    }

    const routeOption = getSelectedDirectionsRouteOption(route);
    const instruction = getManeuverInstruction(maneuver);
    const distanceRemaining = getManeuverDistanceRemaining(maneuver);
    const maneuverConfig = getAutoPlayManeuverConfig(maneuver);
    const durationRemaining = getManeuverDurationSeconds(
        maneuver,
        distanceRemaining,
        routeOption,
    );

    return {
        attributedInstructionVariants: [{ text: instruction }],
        cardBackgroundColor: getManeuverCardBackgroundColor(),
        highwayExitLabel:
            maneuverConfig.exitNumber === undefined
                ? undefined
                : String(maneuverConfig.exitNumber),
        // CarPlay only repaints a maneuver when its id changes (same-id updates
        // refresh travel estimates only), so the baked card color keys the id to
        // force a redraw when the map layer flips between light and dark.
        id: [
            routeOption?.routeKey || 'route',
            maneuver.stepIndex ?? 'step',
            getManeuverNumber(maneuver?.type) ?? 'unknown',
            rootMapButtonAppearance.isDarkMapLayer ? 'dark' : 'light',
        ].join(':'),
        keepType: maneuverConfig.keepType,
        maneuverType: maneuverConfig.maneuverType,
        roadName: maneuver?.name ? [maneuver.name] : undefined,
        symbolImage: makeGlyphImage(maneuverConfig.glyph, {
            backgroundColor: 'transparent',
            color: getManeuverCardIconColor(),
        }),
        trafficSide: AUTO_PLAY_TRAFFIC_SIDE.Right,
        travelEstimates: makeTravelEstimates(
            distanceRemaining,
            durationRemaining,
            instruction,
        ),
        turnType: maneuverConfig.turnType,
        type: 'routing',
        ...(maneuverConfig.exitNumber === undefined
            ? {}
            : { exitNumber: maneuverConfig.exitNumber }),
    };
}

function makeAutoPlayRoutingManeuvers(route, userLocation) {
    const currentManeuver = getActiveDirectionsManeuver(route, userLocation);
    const currentRoutingManeuver = makeAutoPlayRoutingManeuver(
        route,
        currentManeuver,
    );

    if (!currentRoutingManeuver) {
        return [];
    }

    const nextRoutingManeuver = makeAutoPlayRoutingManeuver(
        route,
        getNextDirectionsManeuver(route, currentManeuver),
    );

    return [currentRoutingManeuver, nextRoutingManeuver].filter(Boolean);
}

function getRemainingRouteValues(route, userLocation) {
    const routeOption = getSelectedDirectionsRouteOption(route);
    const progress = getDirectionsRouteProgress(route, userLocation);
    const routeDistance = Number(routeOption?.distance) || 0;
    const routeDuration = Number(routeOption?.duration) || 0;
    const distanceRemaining = progress
        ? Math.max(0, routeDistance - progress.alongRouteDistance)
        : routeDistance;
    const durationRemaining =
        routeDistance > 0
            ? Math.max(0, routeDuration * (distanceRemaining / routeDistance))
            : routeDuration;

    return {
        distanceRemaining,
        durationRemaining,
    };
}

function makeNavigationMessage(route, userLocation) {
    const activeManeuver = getActiveDirectionsManeuver(route, userLocation);
    const routeOption = getSelectedDirectionsRouteOption(route);
    const destinationName =
        route.destination?.label ||
        route.destination?.inputValue ||
        'destination';
    const instruction = activeManeuver
        ? getManeuverInstruction(activeManeuver)
        : `Continue to ${destinationName}`;
    const distanceText =
        activeManeuver?.distanceToManeuver === null ||
        activeManeuver?.distanceToManeuver === undefined
            ? ''
            : formatDirectionsManeuverDistance(
                  activeManeuver.distanceToManeuver,
              );

    return {
        cardBackgroundColor: getManeuverCardBackgroundColor(),
        text: distanceText
            ? `${distanceText} - ${routeOption?.routeLabel || 'Route'}`
            : routeOption?.routeLabel || 'Route',
        title: instruction,
        type: 'message',
    };
}

function updateNavigationGuidance(userLocation) {
    if (!rootMapTemplate || !activeNavigationRoute) {
        return;
    }

    lastNavigationGuidanceLocation =
        userLocation ?? lastNavigationGuidanceLocation;

    const routeOption = getSelectedDirectionsRouteOption(activeNavigationRoute);
    const { distanceRemaining, durationRemaining } = getRemainingRouteValues(
        activeNavigationRoute,
        userLocation,
    );
    const destinationName =
        activeNavigationDestination?.label ||
        activeNavigationDestination?.inputValue ||
        'Destination';
    const destinationCoordinate =
        routeOption?.coordinates?.[routeOption.coordinates.length - 1];
    const destinationStep = getTripPointFromCoordinate(
        destinationCoordinate,
        destinationName,
        makeTravelEstimates(
            distanceRemaining,
            durationRemaining,
            destinationName,
        ),
    );
    const maneuver = makeNavigationMessage(activeNavigationRoute, userLocation);
    const routingManeuvers = makeAutoPlayRoutingManeuvers(
        activeNavigationRoute,
        userLocation,
    );

    try {
        if (destinationStep) {
            rootMapTemplate.updateTravelEstimates([destinationStep]);
        }

        rootMapTemplate.updateManeuvers(
            routingManeuvers.length ? routingManeuvers : maneuver,
        );
    } catch (error) {
        setAutoPlayState({
            errorText:
                error?.message || 'Navigation guidance could not be updated.',
            statusLabel: 'Navigation error',
        });
        return;
    }

    setAutoPlayState({
        detailText: destinationName,
        errorText: '',
        maneuverText: maneuver.title,
        routeDistanceText: formatDirectionsDistance(distanceRemaining),
        routeDurationText: formatDirectionsDuration(durationRemaining),
        routeName: routeOption?.routeLabel
            ? `${routeOption.routeLabel} route`
            : '',
        statusLabel: 'Navigating',
        title: 'Guidance active',
    });
}

async function stopNavigationLocationUpdates() {
    if (!navigationLocationSubscription) {
        return;
    }

    const subscription = navigationLocationSubscription;
    navigationLocationSubscription = null;
    await Promise.resolve(subscription.remove()).catch(() => {});
}

async function startExpoNavigationLocationUpdates() {
    navigationLocationSubscription = await Location.watchPositionAsync(
        {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: NAVIGATION_LOCATION_DISTANCE_METERS,
            timeInterval: NAVIGATION_LOCATION_INTERVAL_MS,
        },
        (position) => {
            const location = getLocationFromPosition(position);

            if (location) {
                updateNavigationGuidance(location);
            }
        },
    ).catch(() => null);

    return getLastKnownLocation();
}

async function startEnhancedNavigationLocationUpdates() {
    navigationLocationSubscription = addEnhancedLocationListener(
        (enhancedLocation) => {
            const location = getLocationFromPosition(
                getEnhancedLocationUpdate(enhancedLocation),
            );

            if (location) {
                updateNavigationGuidance(location);
            }
        },
    );

    const lastEnhancedLocation = await getLastEnhancedLocationAsync().catch(
        () => null,
    );

    return getLocationFromPosition(
        getEnhancedLocationUpdate(lastEnhancedLocation),
    );
}

async function startNavigationLocationUpdates(route) {
    await stopNavigationLocationUpdates();

    if (!(await getLocationPermissionIsGranted())) {
        return;
    }

    const lastKnownLocation = mapboxNavigationEnhancedLocationIsSupported()
        ? await startEnhancedNavigationLocationUpdates()
        : await startExpoNavigationLocationUpdates();

    if (lastKnownLocation) {
        updateNavigationGuidance(lastKnownLocation);
    } else {
        const routeOption = getSelectedDirectionsRouteOption(route);

        setAutoPlayState({
            maneuverText: `Continue to ${route.destination?.label || 'destination'}`,
            routeDistanceText: formatDirectionsDistance(routeOption?.distance),
            routeDurationText: formatDirectionsDuration(routeOption?.duration),
        });
    }
}

function updateRootTemplateHeaderActions() {
    if (!rootMapTemplate || !rootMapTemplateIsReady) {
        return;
    }
    scheduleTemplateUpdate({ headerActions: true });
}

function updateRootMapButtons() {
    if (!rootMapTemplate || !rootMapTemplateIsReady) {
        return;
    }
    scheduleTemplateUpdate({ mapButtons: true });
}

function getRootMapButtonAppearanceKey(appearance) {
    return [
        appearance.isDarkMapLayer ? 'dark' : 'light',
        appearance.trackingState,
    ].join(':');
}

function updateRootMapButtonAppearance(appearance) {
    const nextAppearance = {
        ...ROOT_MAP_BUTTON_APPEARANCE_DEFAULTS,
        ...appearance,
    };
    const nextAppearanceKey = getRootMapButtonAppearanceKey(nextAppearance);

    if (nextAppearanceKey === rootMapButtonAppearanceKey) {
        return;
    }

    const darkMapLayerChanged =
        nextAppearance.isDarkMapLayer !==
        rootMapButtonAppearance.isDarkMapLayer;
    rootMapButtonAppearance = nextAppearance;
    rootMapButtonAppearanceKey = nextAppearanceKey;

    if (!rootMapTemplate || !rootMapTemplateIsReady) {
        return;
    }

    updateRootMapButtons();

    if (darkMapLayerChanged && activeNavigationRoute) {
        // Maneuver card colors are baked in when updateManeuvers runs, so a
        // light preset flip mid-navigation needs a guidance refresh to repaint.
        updateNavigationGuidance(lastNavigationGuidanceLocation);
    }
}

function getAutoPlayDrivingModeIsActive() {
    return getAutoPlayState().drivingModeIsActive !== false;
}

function getRootMapPanButtonImage() {
    return {
        ...makeGlyphImage('arrows', {
            color: getRootMapButtonDefaultIconColor(),
        }),
        fontScale: 0.78,
    };
}

function getRootMapZoomInButtonImage() {
    return {
        ...makeGlyphImage('plus', {
            color: getRootMapButtonDefaultIconColor(),
        }),
        ...ROOT_MAP_CONTROL_BUTTON_IMAGE,
    };
}

function getRootMapZoomOutButtonImage() {
    return {
        ...makeGlyphImage('minus', {
            color: getRootMapButtonDefaultIconColor(),
        }),
        ...ROOT_MAP_CONTROL_BUTTON_IMAGE,
    };
}

function getRootMapTrackingButtonImage() {
    const trackingIsHighlighted =
        rootMapButtonAppearance.trackingState === 'active' ||
        rootMapButtonAppearance.trackingState === 'recenter';

    return {
        ...makeGlyphImage('crosshairs', {
            backgroundColor: trackingIsHighlighted
                ? ROOT_MAP_BUTTON_ACTIVE_BACKGROUND_COLOR
                : AUTO_PLAY_GLYPH_BACKGROUND_COLOR,
            color: trackingIsHighlighted
                ? ROOT_MAP_BUTTON_ACTIVE_ICON_COLOR
                : getRootMapButtonDefaultIconColor(),
        }),
        fontScale: 0.72,
    };
}

function getRootHeaderExitNavigationButtonImage() {
    return {
        ...makeGlyphImage('xmark', {
            backgroundColor: ROOT_MAP_BUTTON_EXIT_BACKGROUND_COLOR,
            color: ROOT_MAP_BUTTON_EXIT_ICON_COLOR,
        }),
        fontScale: 0.74,
    };
}

function getRootHeaderDrivingModeButtonImage() {
    const drivingModeIsActive = getAutoPlayDrivingModeIsActive();

    return {
        ...makeGlyphImage('car', {
            backgroundColor: 'transparent',
            color: drivingModeIsActive
                ? ROOT_MAP_BUTTON_ACTIVE_ICON_COLOR
                : AUTO_PLAY_GLYPH_COLOR,
        }),
        fontScale: 0.74,
    };
}

function setAutoPlayDrivingModeIsActive(drivingModeIsActive) {
    const nextDrivingModeIsActive = Boolean(drivingModeIsActive);

    if (getAutoPlayDrivingModeIsActive() === nextDrivingModeIsActive) {
        return;
    }

    setAutoPlayState({
        drivingModeIsActive: nextDrivingModeIsActive,
    });
    updateRootTemplateHeaderActions();
}

function toggleAutoPlayDrivingMode() {
    setAutoPlayDrivingModeIsActive(!getAutoPlayDrivingModeIsActive());
}

// Hoisted onPress closures so the Nitro bridge re-wraps the same JS function
// references every time we rebuild the button array. Each one fetches the
// latest handler at click time, so swapping controllers (e.g. after a tracking
// state change) doesn't need a new button array.
const handleRootZoomInPress = () => {
    getAutoPlayMapControlHandlers().handleZoomInPress();
};
const handleRootZoomOutPress = () => {
    getAutoPlayMapControlHandlers().handleZoomOutPress();
};
const handleRootTrackingPress = () => {
    getAutoPlayMapControlHandlers().handleLocationTrackingPress();
};

let cachedRootMapButtons = null;
let cachedRootMapButtonsKey = '';

function getRootMapButtons() {
    // The only thing that can change between calls is the appearance (dark/light
    // map layer + tracking state). Memoize by that key so identical button arrays
    // are reused — important because every fresh array forces the native side to
    // re-parse glyphs and rebuild the ActionStrip.
    if (
        cachedRootMapButtons &&
        cachedRootMapButtonsKey === rootMapButtonAppearanceKey
    ) {
        return cachedRootMapButtons;
    }

    cachedRootMapButtons = [
        {
            image: getRootMapPanButtonImage(),
            type: 'pan',
        },
        {
            image: getRootMapZoomInButtonImage(),
            onPress: handleRootZoomInPress,
            type: 'custom',
        },
        {
            image: getRootMapZoomOutButtonImage(),
            onPress: handleRootZoomOutPress,
            type: 'custom',
        },
        {
            image: getRootMapTrackingButtonImage(),
            onPress: handleRootTrackingPress,
            type: 'custom',
        },
    ];
    cachedRootMapButtonsKey = rootMapButtonAppearanceKey;
    return cachedRootMapButtons;
}

function syncAutoPlayNavigationFromSharedRoutingState(
    routingState = getSharedRoutingState(),
) {
    if (!rootMapTemplate) {
        return;
    }

    const nextRoute =
        routingState.drivingModeIsActive && routingState.directionsRoute
            ? routingState.directionsRoute
            : null;

    if (nextRoute) {
        if (
            getDirectionsRouteSyncKey(nextRoute) ===
            getDirectionsRouteSyncKey(activeNavigationRoute)
        ) {
            return;
        }

        startAutoPlayNavigation(nextRoute, { publishSharedState: false });
        return;
    }

    if (activeNavigationRoute) {
        stopAutoPlayNavigation({ publishSharedState: false });
    }
}

function startAutoDriveNavigationSimulation(route) {
    const routeOption = getSelectedDirectionsRouteOption(route);
    const simulationStarted = startAutoDriveSimulation({
        coordinates: routeOption?.coordinates,
        onArrive: () => {
            handleAutoDriveArrival(route);
        },
        onLocation: (position) => {
            const location = getLocationFromPosition(position);

            if (location) {
                updateNavigationGuidance(location);
            }
        },
    });

    if (!simulationStarted) {
        startNavigationLocationUpdates(route);
        return;
    }

    stopNavigationLocationUpdates();
}

async function handleAutoDriveArrival(route) {
    const destinationName =
        route.destination?.label ||
        route.destination?.inputValue ||
        'destination';

    await stopAutoPlayNavigation();
    setAutoPlayState({
        detailText: `Simulated drive arrived at ${destinationName}.`,
        statusLabel: 'Arrived',
    });
}

function handleAutoDriveEnabled() {
    autoDriveIsEnabled = true;
    setAutoPlayDrivingModeIsActive(true);
    setAutoPlayState({
        detailText: 'Simulated drive mode is active on the car screen.',
        statusLabel: 'Auto drive',
    });

    if (activeNavigationRoute) {
        startAutoDriveNavigationSimulation(activeNavigationRoute);
    }
}

async function stopAutoPlayNavigation({
    notifyTemplate = true,
    publishSharedState = true,
} = {}) {
    stopAutoDriveSimulation();
    await stopNavigationLocationUpdates();
    activeNavigationRoute = null;
    activeNavigationDestination = null;
    lastNavigationGuidanceLocation = null;

    if (notifyTemplate && rootMapTemplate) {
        try {
            rootMapTemplate.stopNavigation();
        } catch {
            // The head unit may already have stopped this navigation session.
        }
    }

    if (publishSharedState) {
        setSharedRoutingState({
            directionsRoute: null,
            drivingModeIsActive: false,
        });
    }

    setAutoPlayState({
        detailText: 'Search for a destination to start another private route.',
        directionsRoute: null,
        errorText: '',
        isNavigating: false,
        maneuverText: '',
        routeDistanceText: '',
        routeDurationText: '',
        routeName: '',
        statusLabel: 'Ready',
        title: 'Drivers Against Flock',
    });
    updateRootTemplateHeaderActions();
}

function startAutoPlayNavigation(route, { publishSharedState = true } = {}) {
    const { HybridAutoPlay } = loadAutoPlayModule();

    if (!rootMapTemplate || !rootMapTemplateIsReady) {
        showAutoPlayError(
            'Car screen unavailable',
            'Car screen is not connected.',
        );
        return;
    }

    const selectedRoute = getSelectedDirectionsRouteOption(route);

    if (!selectedRoute) {
        showAutoPlayError(
            'Route unavailable',
            'Directions did not include a route.',
        );
        return;
    }

    activeNavigationRoute = route;
    activeNavigationDestination = route.destination;

    try {
        rootMapTemplate.startNavigation(makeTripConfig(route));
        updateNavigationGuidance(null);

        if (autoDriveIsEnabled) {
            startAutoDriveNavigationSimulation(route);
        } else {
            startNavigationLocationUpdates(route);
        }

        HybridAutoPlay.popToRootTemplate(false).catch(() => {});

        setAutoPlayState({
            detailText: route.destination?.label || 'Destination',
            directionsRoute: route,
            drivingModeIsActive: true,
            errorText: '',
            isNavigating: true,
            routeDistanceText: formatDirectionsDistance(selectedRoute.distance),
            routeDurationText: formatDirectionsDuration(selectedRoute.duration),
            routeName: selectedRoute.routeLabel
                ? `${selectedRoute.routeLabel} route`
                : 'Route',
            statusLabel: 'Navigating',
            title: 'Guidance active',
        });
        updateRootTemplateHeaderActions();

        if (publishSharedState) {
            setSharedRoutingState({
                directionsRoute: route,
                drivingModeIsActive: true,
            });
        }
    } catch (error) {
        showAutoPlayError(
            'Navigation unavailable',
            error?.message || 'Navigation could not be started.',
        );
    }
}

const handleRootHeaderSearchPress = () => {
    openSearchTemplate();
};
const handleRootHeaderDrivingModePress = () => {
    toggleAutoPlayDrivingMode();
};
const handleRootHeaderExitNavigationPress = () => {
    stopAutoPlayNavigation();
};
const ROOT_HEADER_SEARCH_IMAGE = makeGlyphImage('search', {
    backgroundColor: 'transparent',
});

let cachedRootMapHeaderActions = null;
let cachedRootMapHeaderActionsKey = '';

function getRootMapHeaderActions() {
    const drivingModeKey = getAutoPlayDrivingModeIsActive() ? '1' : '0';
    const navigationExitButtonIsVisible =
        autoPlayPlatform?.usesHeaderExitNavigationButton &&
        Boolean(activeNavigationRoute);
    const rootMapHeaderActionsKey = `${drivingModeKey}:${navigationExitButtonIsVisible ? 'navigating' : 'ready'}`;

    if (
        cachedRootMapHeaderActions &&
        cachedRootMapHeaderActionsKey === rootMapHeaderActionsKey
    ) {
        return cachedRootMapHeaderActions;
    }

    const searchButton = {
        image: ROOT_HEADER_SEARCH_IMAGE,
        onPress: handleRootHeaderSearchPress,
        type: 'image',
    };
    const trailingNavigationButton = {
        image: navigationExitButtonIsVisible
            ? getRootHeaderExitNavigationButtonImage()
            : getRootHeaderDrivingModeButtonImage(),
        onPress: navigationExitButtonIsVisible
            ? handleRootHeaderExitNavigationPress
            : handleRootHeaderDrivingModePress,
        type: 'image',
    };

    cachedRootMapHeaderActions = {
        android: [searchButton, trailingNavigationButton],
        ios: {
            leadingNavigationBarButtons: [searchButton],
            trailingNavigationBarButtons: [trailingNavigationButton],
        },
    };
    cachedRootMapHeaderActionsKey = rootMapHeaderActionsKey;
    return cachedRootMapHeaderActions;
}

function showAutoPlayError(title, message) {
    const { InformationTemplate } = loadAutoPlayModule();
    const searchAction = {
        onPress: () => {
            openSearchTemplate();
        },
        title: 'Search',
        type: 'text',
    };
    const errorTemplate = new InformationTemplate({
        actions: {
            android: [searchAction],
            ios: [searchAction],
        },
        headerActions: getBackHeaderAction(),
        items: [
            {
                detailedText: makeAutoText(message),
                title: makeAutoText(title),
                type: 'text',
            },
        ],
        title: makeAutoText(title),
    });

    setAutoPlayState({
        detailText: '',
        errorText: message,
        statusLabel: 'Needs attention',
        title,
    });
    errorTemplate.push().catch(() => {});
}

async function handleVoiceNavigation(coordinates, query) {
    const searchQuery = String(query ?? '').trim();
    const startLocation = getAutoPlayLocation(coordinates);

    if (!searchQuery) {
        openSearchTemplate('', startLocation);
        return;
    }

    setAutoPlayState({
        detailText: `Searching for ${searchQuery}.`,
        errorText: '',
        statusLabel: 'Voice search',
        title: 'Destination',
    });

    try {
        const results = await searchTextPlaces({
            location: startLocation,
            textQuery: searchQuery,
        });

        if (!results.length) {
            throw new Error(`No places found for "${searchQuery}".`);
        }

        handleSearchResultSelected(results[0], startLocation);
    } catch (error) {
        showAutoPlayError(
            'Voice search unavailable',
            error?.message || 'Voice search failed.',
        );
    }
}

function handleAutoPlayConnect() {
    const { MapTemplate } = loadAutoPlayModule();

    rootMapTemplateIsReady = false;
    setAutoPlayState({
        ...DEFAULT_AUTO_PLAY_STATE,
        statusLabel: 'Connected',
    });

    rootMapTemplate = new MapTemplate({
        component: autoPlayPlatform.MapSurface,
        headerActions: getRootMapHeaderActions(),
        mapButtons: getRootMapButtons(),
        onAppearanceDidChange: (colorScheme) => {
            setAutoPlayMapColorScheme(colorScheme);
        },
        onDidPan: (translation) => {
            getAutoPlayMapControlHandlers().handlePan(translation);
        },
        onDidUpdateZoomGestureWithCenter: (center, scale) => {
            getAutoPlayMapControlHandlers().handleZoomGesture(center, scale);
        },
        onStopNavigation: () => {
            stopAutoPlayNavigation({ notifyTemplate: false });
        },
        ...autoPlayPlatform.getMapTemplatePlatformConfig({
            onAutoDriveEnabled: handleAutoDriveEnabled,
            onDoubleClickZoomIn: (center) => {
                getAutoPlayMapControlHandlers().handleZoomInPress(center);
            },
        }),
    });

    rootMapTemplate
        .setRootTemplate()
        .then(() => {
            rootMapTemplateIsReady = true;
            syncAutoPlayNavigationFromSharedRoutingState();
        })
        .catch((error) => {
            setAutoPlayState({
                errorText:
                    error?.message || 'The car screen could not be started.',
                statusLabel: 'Connection error',
            });
        });
}

function handleAutoPlayDisconnect() {
    rootMapTemplate = null;
    rootMapTemplateIsReady = false;
    activeNavigationRoute = null;
    activeNavigationDestination = null;
    lastNavigationGuidanceLocation = null;
    autoDriveIsEnabled = false;
    stopAutoDriveSimulation();
    abortSearchRequest();
    stopNavigationLocationUpdates();
    setAutoPlayState(DEFAULT_AUTO_PLAY_STATE);
}

export default function registerAutoPlay() {
    if (!autoPlayPlatform || autoPlayRegistered) {
        return;
    }

    autoPlayRegistered = true;

    let AutoPlayCluster;
    let HybridAutoPlay;

    try {
        ({ AutoPlayCluster, HybridAutoPlay } = loadAutoPlayModule());
    } catch (error) {
        // A dev client built before the car screen pods were linked can still run
        // this JS bundle; skip car integration instead of crashing the phone app.
        console.warn('Car screen support is unavailable in this build.', error);
        return;
    }

    setAutoPlayMapButtonAppearanceListener(updateRootMapButtonAppearance);
    sharedRoutingStateUnsubscribe?.();
    sharedRoutingStateUnsubscribe = addSharedRoutingStateListener(
        syncAutoPlayNavigationFromSharedRoutingState,
    );
    AutoPlayCluster.setComponent(autoPlayPlatform.MapSurface).catch(() => {});
    autoPlayPlatform.registerPlatformListeners({
        autoPlayModule: loadAutoPlayModule(),
        makeGlyphImage,
        onVoiceNavigation: handleVoiceNavigation,
    });
    HybridAutoPlay.addListener('didConnect', handleAutoPlayConnect);
    HybridAutoPlay.addListener('didDisconnect', handleAutoPlayDisconnect);

    if (HybridAutoPlay.isConnected()) {
        handleAutoPlayConnect();
    }
}
