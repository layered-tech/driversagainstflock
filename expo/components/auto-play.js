import * as Location from 'expo-location';
import { createPlaceSearchSessionToken } from '../lib/place-search-session';
import { createAutoPlayPlaceSearch } from './auto-play-place-search';
import { createAutoPlayArrivalDetector } from './auto-play-arrival-state';
import { createAutoPlayMapOptionsTemplate } from './auto-play-map-options';
import { getAutoPlayCompassNeedleImage } from './auto-play-compass-images';
import {
    startAutoDriveSimulation,
    stopAutoDriveSimulation,
} from './auto-play-drive-simulation';
import { getAutoPlayMapGestureCallbacks } from './auto-play-map-gesture-callbacks';
import {
    getAutoPlayMapControlHandlers,
    setAutoPlayMapButtonAppearanceListener,
    setAutoPlayMapColorScheme,
} from './auto-play-map-surface';
import {
    getAutoPlaySavedSearchPage,
    getAutoPlaySavedSearchResults,
} from './auto-play-saved-search-results';
import { getAutoPlayInitialRouteKey } from './auto-play-route-preference';
import { createAutoPlaySearchTemplateLifecycle } from './auto-play-search-template-lifecycle';
import {
    setAutoPlaySessionConnected,
    setAutoPlaySessionRenderState,
} from './auto-play-session-state';
import { getAutoPlaySharedNavigationAction } from './auto-play-shared-navigation';
import { publishAcceptedDeviceLocation } from './map/accepted-device-location';
// Metro resolves the platform adapter per platform: Android Auto specifics in
// auto-play-platform.android.js, CarPlay specifics in auto-play-platform.ios.js.
import { getAutoPlayManeuverConfig } from './auto-play-maneuver-config';
import { autoPlayPlatform } from './auto-play-platform';
import { getAutoPlayRoundaboutExitImage } from './auto-play-roundabout-exit-images';
import {
    DEFAULT_AUTO_PLAY_STATE,
    getAutoPlayState,
    setAutoPlayState,
} from './auto-play-state';
import {
    AUTO_PLAY_TRIP_PREVIEW_TEXT_CONFIGURATION,
    autoPlaySearchRequestIsCurrent,
    getAutoPlayHeaderButtonVisibility,
    getAutoPlayMapButtonAppearanceKey,
    getAutoPlayPotentiallyAvoidedNodeCount,
    getAutoPlayPrimaryLocationHeaderActionTypes,
    getAutoPlayRouteChoiceText,
    getAutoPlaySearchLoadingCopy,
    getAutoPlayTripEstimateValues,
    getAutoPlayVisibleSearchResults,
    makeAutoPlayTripSelectorTrips,
    makeAutoPlayTripSteps,
} from './auto-play-template-state';
import { resolveAutoPlayVoiceRequestType } from './auto-play-voice-request-type';
import {
    getDirections,
    getPlaceDetails,
    searchPlaces,
    searchTextPlaces,
} from './map/api';
import { e2eMapApiMocksCanBeEnabled } from './map/api-mocks';
import {
    MAP_LAYER_STYLES,
    MAP_LIGHT_PRESET_OPTIONS,
    PLACE_SEARCH_MIN_QUERY_LENGTH,
} from './map/constants';
import {
    createCurrentLocationDirectionsWaypoint,
    createDirectionsRouteProgressTracker,
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
    getDirectionsSteps,
    getDirectionsWaypointApiCoord,
    getNextDirectionsManeuver,
    getRemainingDirectionsRouteValues,
    getSelectedDirectionsRouteOption,
    selectDirectionsRoute,
} from './map/directions';
import {
    DRIVING_MAP_VIEW_PERSPECTIVE,
    DRIVING_MAP_VIEW_ROUTE_OVERVIEW,
} from './map/driving-map-view';
import { getCoordinateDistanceMeters } from './map/geo';
import {
    createEmptyPrimaryLocations,
    createPrimaryLocationDirectionsWaypoint,
    getPrimaryLocationLabel,
} from './map/primary-locations';
import {
    addRoadMatchedLocationListener,
    getLastRoadMatchedLocationAsync,
    retainRoadMatchingSessionAsync,
    roadMatchingLocationIsSupported,
} from './map/road-matching-session';
import {
    addPrimaryLocationsListener,
    addRecentLocation,
    addSearchSavedLocationsListener,
    createSavedLocationFromPlace,
    getSearchSavedLocationsSnapshot,
    loadPrimaryLocations,
    loadSearchSavedLocations,
} from './map/saved-locations';
import { updateSharedNavigationLocation } from './map/shared-navigation-controller';
import {
    addSharedMapSettingsStateListener,
    getSharedMapPreferencesState,
    setSharedMapPreferencesState,
} from './map/shared-map-preferences-sync';
import { formatSearchResultDistance } from './map/search-formatters';
import { weatherStore } from './map/weather-runtime';
import {
    addSharedRoutingStateListener,
    getDirectionsRouteGeometrySyncKey,
    getSharedRoutingState,
    hydrateSharedRoutingStateAsync,
    setSharedRoutingState,
} from './map/shared-routing-state';

const LOCATION_TIMEOUT_MS = 10000;
const AUTO_PLAY_SEARCH_LOCATION_TIMEOUT_MS = 1000;
const NAVIGATION_LOCATION_INTERVAL_MS = 4000;
const NAVIGATION_LOCATION_DISTANCE_METERS = 12;
const NAVIGATION_GUIDANCE_MIN_INTERVAL_MS = 1000;
const AUTO_PLAY_ICON_FONT_NAME = 'font_awesome';
const AUTO_PLAY_ICON_GLYPH_MAP = {
    'arrow-left': 0xf060,
    'arrow-right': 0xf061,
    'arrow-up': 0xf062,
    arrows: 0xf047,
    briefcase: 0xf0b1,
    clock: 0xf017,
    crosshairs: 0xf05b,
    'flag-checkered': 0xf11e,
    house: 0xf015,
    'level-up-alt': 0xf3bf,
    'list-ul': 0xf0ca,
    location: 0xf3c5,
    'location-arrow': 0xf124,
    map: 0xf279,
    minus: 0xf068,
    microphone: 0xf130,
    plus: 0xf067,
    rotate: 0xf021,
    search: 0xf002,
    sliders: 0xf1de,
    star: 0xf005,
    xmark: 0xf00d,
};
const AUTO_PLAY_GLYPH_COLOR = autoPlayPlatform?.buttonIconColor ?? {
    darkColor: 'white',
    lightColor: 'black',
};
const AUTO_PLAY_GLYPH_BACKGROUND_COLOR = {
    darkColor: 'rgba(23,23,23,0.72)',
    lightColor: 'rgba(255,255,255,0.68)',
};
const ROOT_MAP_BUTTON_APPEARANCE_DEFAULTS = {
    compassNorthDirection: 0,
    drivingMapViewMode: DRIVING_MAP_VIEW_PERSPECTIVE,
    isDarkMapLayer: false,
    mapLightPreset: null,
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
const ROOT_MAP_BUTTON_EXIT_BACKGROUND_COLOR = 'transparent';
const AUTO_PLAY_MANEUVER_CARD_BACKGROUND_COLOR = {
    darkColor: '#111827',
    lightColor: '#f9fafb',
};

function getRootMapButtonDefaultIconColor() {
    if (autoPlayPlatform?.buttonIconColor != null) {
        return autoPlayPlatform.buttonIconColor;
    }

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

function makeButtonGlyphImage(name, options = {}) {
    return makeGlyphImage(
        name,
        autoPlayPlatform?.usesHostButtonColors
            ? { ...options, color: 'default', backgroundColor: 'transparent' }
            : options,
    );
}

const ROOT_MAP_CONTROL_BUTTON_IMAGE = {
    fontScale: 0.78,
};

let autoPlayModule;
let autoPlayRegistered = false;
let autoPlayConnectionGeneration = 0;
let autoPlayConnectionRoadMatchingGeneration = 0;
let autoPlayConnectionRoadMatchingHandle = null;
let autoPlayConnectionRoadMatchingIsRequested = false;
let autoPlayConnectionRoadMatchingPromise = null;
let rootMapTemplate = null;
let rootMapTemplateIsReady = false;
let pendingVoiceNavigation = null;
let pendingDashboardAction = null;
let pendingVoiceSearchTemplatePush = null;
let voiceNavigationRequestGeneration = 0;
let rootMapButtonAppearance = ROOT_MAP_BUTTON_APPEARANCE_DEFAULTS;
let rootMapButtonAppearanceKey = '';
let rootMapPanningInterfaceIsVisible = false;
let rootMapButtonsRefreshIsDeferred = false;
let rootMapHeaderActionsRefreshIsDeferred = false;
let navigationLocationSubscription = null;
let navigationLocationUpdateGeneration = 0;
let navigationRouteGeneration = 0;
let searchAbortController = null;
let searchRequestSequence = 0;
let routeLoadAbortController = null;
let routeLoadingRequestSequence = 0;
let routePreviewIsVisible = false;
let routePreviewRequestSequence = 0;
let activeNavigationRoute = null;
let activeAutoPlayPlaceSearch = null;
let autoPlaySearchWorkflowIsActive = false;
const navigationProgressTracker = createDirectionsRouteProgressTracker();
let autoPlayHostNavigationIsActive = false;
let lastNavigationGuidanceLocation = null;
let latestNavigationGuidanceRecordedAt = null;
let lastNavigationGuidanceUpdatedAt = 0;
let pendingNavigationGuidanceLocation = null;
let pendingNavigationGuidanceTimer = null;
let navigationGuidanceIsDeferredDuringPanning = false;
let deferredNavigationGuidanceLocation = null;
// Latched when the car host invokes NavigationManagerCallback.onAutoDriveEnabled
// and held until the Android Auto session is destroyed, per the Play Store
// navigation quality requirements.
let autoDriveIsEnabled = false;
let autoPlayPrimaryLocations = createEmptyPrimaryLocations();
let primaryLocationsLoadSequence = 0;
let primaryLocationsUnsubscribe = null;
const autoPlayArrivalDetector = createAutoPlayArrivalDetector();

// Android Auto's host process throttles template refreshes (~5/30s outside
// navigation). Each setMapButtons / setHeaderActions call posts a separate
// Screen.invalidate() on the native side, so firing them back-to-back during
// the same React tick wastes the quota and makes button presses feel delayed.
// Coalesce them into a single trailing-edge flush per microtask.
let templateUpdateScheduled = false;
let templateUpdateNeedsMapButtons = false;
let templateUpdateNeedsHeaderActions = false;
let lastAppliedMapButtonsKey = null;
let lastAppliedHeaderActionsKey = null;

function getTemplateChromeKey(value) {
    return JSON.stringify(value, (_key, item) =>
        typeof item === 'function' ? '[function]' : item,
    );
}

function flushTemplateUpdates() {
    templateUpdateScheduled = false;
    const needsMapButtons = templateUpdateNeedsMapButtons;
    const needsHeaderActions = templateUpdateNeedsHeaderActions;
    templateUpdateNeedsMapButtons = false;
    templateUpdateNeedsHeaderActions = false;

    if (!rootMapTemplate || !rootMapTemplateIsReady) {
        return;
    }

    if (rootMapPanningInterfaceIsVisible) {
        rootMapButtonsRefreshIsDeferred ||= needsMapButtons;
        rootMapHeaderActionsRefreshIsDeferred ||= needsHeaderActions;
        return;
    }

    if (needsMapButtons) {
        try {
            const mapButtons = getRootMapButtons();
            const mapButtonsKey = getTemplateChromeKey(mapButtons);

            if (mapButtonsKey !== lastAppliedMapButtonsKey) {
                lastAppliedMapButtonsKey = mapButtonsKey;
                rootMapTemplate.setMapButtons(mapButtons).catch(() => {
                    if (lastAppliedMapButtonsKey === mapButtonsKey) {
                        lastAppliedMapButtonsKey = null;
                    }
                });
            }
        } catch {
            // Map buttons can be restored on the next surface state update.
        }
    }

    if (needsHeaderActions) {
        try {
            const headerActions = getRootMapHeaderActions();
            const headerActionsKey = getTemplateChromeKey(headerActions);

            if (headerActionsKey !== lastAppliedHeaderActionsKey) {
                lastAppliedHeaderActionsKey = headerActionsKey;
                rootMapTemplate.setHeaderActions(headerActions).catch(() => {
                    if (lastAppliedHeaderActionsKey === headerActionsKey) {
                        lastAppliedHeaderActionsKey = null;
                    }
                });
            }
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

function applyAutoPlayPrimaryLocations(primaryLocations) {
    autoPlayPrimaryLocations = {
        ...createEmptyPrimaryLocations(),
        ...primaryLocations,
    };
    updateRootTemplateHeaderActions();
    autoPlayPlatform?.updateDashboardButtons?.();
}

function refreshAutoPlayPrimaryLocations() {
    const loadSequence = ++primaryLocationsLoadSequence;

    loadPrimaryLocations()
        .then((primaryLocations) => {
            if (loadSequence !== primaryLocationsLoadSequence) {
                return;
            }

            applyAutoPlayPrimaryLocations(primaryLocations);
        })
        .catch(() => {});
}

function handlePrimaryLocationsChanged(primaryLocations) {
    primaryLocationsLoadSequence += 1;
    applyAutoPlayPrimaryLocations(primaryLocations);
}

function makeAutoText(value) {
    return { text: String(value ?? '') };
}

function logAutoPlayPlatformAction(action, payload = {}) {
    autoPlayPlatform?.logAction?.(action, payload);
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
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        return null;
    }

    return [longitude, latitude];
}

function getAutoPlayDestinationDistanceMeters(
    userLocation,
    destinationCoordinate,
) {
    const userCoordinate = normalizeCoordinatePair([
        userLocation?.longitude,
        userLocation?.latitude,
    ]);
    const destination = normalizeCoordinatePair(destinationCoordinate);

    if (!userCoordinate || !destination) {
        return null;
    }

    return getCoordinateDistanceMeters(userCoordinate, destination);
}

function getAutoPlayLocation(coordinates) {
    const latitude = getFiniteNumber(coordinates?.lat);
    const longitude = getFiniteNumber(coordinates?.lon);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
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
        recordedAt: position.timestamp,
        accuracy: getFiniteNumber(position?.coords?.accuracy),
        roadMatch: position.roadMatch,
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

async function getAutoPlaySearchLocation(preferredLocation) {
    if (preferredLocation) {
        return preferredLocation;
    }

    const roadMatchedLocation = getLocationFromPosition(
        await getLastRoadMatchedLocationAsync().catch(() => null),
    );

    if (roadMatchedLocation) {
        return roadMatchedLocation;
    }

    return withTimeout(
        getLastKnownLocation(),
        AUTO_PLAY_SEARCH_LOCATION_TIMEOUT_MS,
        'Search location lookup timed out.',
    ).catch(() => null);
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

function makeSearchRows(results, query, onPress, { numbered = false } = {}) {
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

    return results.map((result, index) => ({
        detailedText: makeAutoText(getSearchResultSubtitle(result)),
        onPress: () => {
            onPress(result);
        },
        title: makeAutoText(
            `${numbered ? `${index + 1}. ` : ''}${result.primaryText || result.label || 'Place'}`,
        ),
        type: 'default',
    }));
}

function makeInitialSavedSearchRows(savedLocations, onPress, onCategoryPress) {
    const suggestions = getAutoPlaySavedSearchResults(savedLocations);

    return suggestions.map(
        ({ category, count, icon, isCategory = false, result }) => ({
            detailedText: makeAutoText(
                isCategory
                    ? count > 0
                        ? `${count} saved ${count === 1 ? 'destination' : 'destinations'}`
                        : 'No saved destinations yet'
                    : [
                          result.primaryText !== category && result.primaryText,
                          result.secondaryText,
                      ]
                          .filter(Boolean)
                          .join(' - '),
            ),
            image: makeGlyphImage(icon, { backgroundColor: 'transparent' }),
            onPress: () => {
                if (isCategory) {
                    onCategoryPress(category);
                    return;
                }

                onPress(result);
            },
            title: makeAutoText(category),
            type: 'default',
        }),
    );
}

function makeSavedSearchCategoryRows(
    savedLocations,
    category,
    page,
    onPress,
    onPageChange,
) {
    const savedSearchResults = getAutoPlaySavedSearchResults(
        savedLocations,
        category,
    );
    const savedSearchPage = getAutoPlaySavedSearchPage(
        savedSearchResults,
        page,
    );
    const items = savedSearchPage.results.map(({ icon, result }) => ({
        detailedText: makeAutoText(getSearchResultSubtitle(result)),
        image: makeGlyphImage(icon, { backgroundColor: 'transparent' }),
        onPress: () => onPress(result),
        title: makeAutoText(result.primaryText || result.label || 'Place'),
        type: 'default',
    }));

    if (items.length === 0) {
        items.push(
            makeDisabledSearchRow(
                category === 'Favorites'
                    ? 'No favorite destinations'
                    : 'No recent destinations',
                category === 'Favorites'
                    ? 'Save a destination as a favorite to find it here.'
                    : 'Destinations you search for will appear here.',
            ),
        );
    }

    if (savedSearchPage.hasPreviousPage) {
        items.unshift({
            onPress: () => onPageChange(savedSearchPage.page - 1),
            title: makeAutoText('Previous destinations'),
            type: 'default',
        });
    }

    if (savedSearchPage.hasNextPage) {
        items.push({
            onPress: () => onPageChange(savedSearchPage.page + 1),
            title: makeAutoText('More destinations'),
            type: 'default',
        });
    }

    return items;
}

function updateSearchTemplateResults(template, results, query, startLocation) {
    return updateSearchTemplateSection(template, {
        items: makeSearchRows(results, query, (result) => {
            handleSearchResultSelected(result, {
                preferredStartLocation: startLocation,
                template,
            });
        }),
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
        const updateSearchResults = template?.updateSearchResults;
        const updateSections = template?.updateSections;
        let updatePromise;

        if (typeof updateSearchResults === 'function') {
            updatePromise = updateSearchResults.call(template, section);
        } else if (typeof updateSections === 'function') {
            updatePromise = updateSections.call(template, section);
        } else {
            return Promise.resolve(false);
        }

        if (updatePromise && typeof updatePromise.then === 'function') {
            return updatePromise.then(
                () => true,
                () => false,
            );
        }

        return Promise.resolve(true);
    } catch {
        // The native result template can be removed before a search response returns.
    }

    return Promise.resolve(false);
}

function abortSearchRequest() {
    activeAutoPlayPlaceSearch?.cancel();
    activeAutoPlayPlaceSearch = null;
    searchRequestSequence += 1;
    setAutoPlayState({ searchLoading: null });

    if (searchAbortController) {
        searchAbortController.abort();
        searchAbortController = null;
    }
}

function abortRouteLoadRequest() {
    if (!routeLoadAbortController) {
        return;
    }

    routeLoadAbortController.abort();
    routeLoadAbortController = null;
}

function startRouteLoadRequest() {
    abortRouteLoadRequest();
    routeLoadAbortController = new AbortController();

    return routeLoadAbortController;
}

function beginAutoPlayRouteLoading(destinationLabel) {
    const requestId = ++routeLoadingRequestSequence;

    setAutoPlayState({
        routeLoading: {
            destinationLabel: String(destinationLabel ?? '').trim(),
            requestId,
        },
    });

    return requestId;
}

function updateAutoPlayRouteLoading(requestId, destinationLabel) {
    const routeLoading = getAutoPlayState().routeLoading;

    if (routeLoading?.requestId !== requestId) {
        return;
    }

    setAutoPlayState({
        routeLoading: {
            ...routeLoading,
            destinationLabel: String(destinationLabel ?? '').trim(),
        },
    });
}

function finishAutoPlayRouteLoading(requestId) {
    if (getAutoPlayState().routeLoading?.requestId !== requestId) {
        return;
    }

    setAutoPlayState({ routeLoading: null });
}

function clearAutoPlayRouteLoading() {
    routeLoadingRequestSequence += 1;

    if (getAutoPlayState().routeLoading) {
        setAutoPlayState({ routeLoading: null });
    }
}

function setAutoPlaySearchWorkflowIsActive(isActive) {
    if (autoPlaySearchWorkflowIsActive === isActive) {
        return;
    }
    autoPlaySearchWorkflowIsActive = isActive;
    updateRootMapButtons();
}

function cancelAutoPlaySearchWork() {
    setAutoPlaySearchWorkflowIsActive(false);
    abortSearchRequest();
    abortRouteLoadRequest();
    clearAutoPlayRouteLoading();
}

function clearAutoPlaySubmittedSearchResults() {
    const { submittedSearchQuery, submittedSearchResults } = getAutoPlayState();

    if (!submittedSearchQuery && !(submittedSearchResults?.length > 0)) {
        return;
    }

    setAutoPlayState({
        submittedSearchQuery: '',
        submittedSearchResults: [],
    });
}

function setAutoPlaySubmittedSearchResults({ query, results }) {
    setAutoPlayState({
        submittedSearchQuery: query,
        submittedSearchResults: getAutoPlayVisibleSearchResults(results),
    });
}

function getSearchResultsHeaderActions(onBack, onMap) {
    const backHeaderActions = getBackHeaderAction(onBack);
    if (!onMap) {
        return backHeaderActions;
    }
    const mapButton = {
        image: makeButtonGlyphImage('map', { backgroundColor: 'transparent' }),
        onPress: onMap,
        type: 'image',
    };
    return {
        android: {
            ...backHeaderActions.android,
            endHeaderActions: [mapButton],
        },
        ios: {
            ...backHeaderActions.ios,
            trailingNavigationBarButtons: [mapButton],
        },
    };
}

function presentAutoPlaySearchResults({
    includesMap = false,
    query,
    requestIsCurrent = () => true,
    results,
    startLocation,
}) {
    const { ListTemplate } = loadAutoPlayModule();
    let resultsTemplate;
    let templateWasPushed = false;
    let mapResultsAreOpening = false;
    const dismissResults = () => {
        if (!requestIsCurrent() || mapResultsAreOpening) {
            return;
        }

        cancelAutoPlaySearchWork();
        clearAutoPlaySubmittedSearchResults();
    };

    try {
        resultsTemplate = new ListTemplate({
            headerActions: getSearchResultsHeaderActions(
                dismissResults,
                !includesMap && results.length
                    ? async () => {
                          if (!requestIsCurrent() || mapResultsAreOpening) {
                              return;
                          }
                          mapResultsAreOpening = true;
                          try {
                              await prepareAutoPlaySearchMap();
                              if (!requestIsCurrent()) {
                                  return;
                              }
                              const presentation = presentAutoPlaySearchResults(
                                  {
                                      includesMap: true,
                                      query,
                                      requestIsCurrent,
                                      results,
                                      startLocation,
                                  },
                              );
                              if (
                                  !presentation ||
                                  !(await presentation.pushPromise)
                              ) {
                                  mapResultsAreOpening = false;
                                  dismissResults();
                              }
                          } catch {
                              mapResultsAreOpening = false;
                              dismissResults();
                              showAutoPlayError(
                                  'Map unavailable',
                                  'Search results could not be shown on the map.',
                              );
                          }
                      }
                    : undefined,
            ),
            ...(includesMap
                ? {
                      mapConfig: {
                          mapButtons: getRootMapButtons(),
                      },
                  }
                : {}),
            onPopped: dismissResults,
            sections: {
                items: makeSearchRows(
                    includesMap
                        ? getAutoPlayVisibleSearchResults(results)
                        : results,
                    query,
                    (result) => {
                        if (!requestIsCurrent()) {
                            return;
                        }

                        handleSearchResultSelected(result, {
                            preferredStartLocation: startLocation,
                            template: resultsTemplate,
                        });
                    },
                    { numbered: includesMap },
                ),
                type: 'default',
            },
            title: makeAutoText('Search results'),
        });
        if (includesMap) {
            setAutoPlaySubmittedSearchResults({ query, results });
        } else {
            clearAutoPlaySubmittedSearchResults();
        }
        const pushPromise = resultsTemplate.push().then(
            () => {
                templateWasPushed = true;
                logAutoPlayPlatformAction(
                    includesMap
                        ? 'search-map-results-presented'
                        : 'search-results-presented',
                    {
                        query,
                        resultCount: includesMap
                            ? getAutoPlayVisibleSearchResults(results).length
                            : results.length,
                    },
                );
                return true;
            },
            (error) => {
                if (requestIsCurrent()) {
                    logAutoPlayPlatformAction('search-results-push-failed', {
                        message: error?.message || 'Unknown error',
                    });
                    clearAutoPlaySubmittedSearchResults();
                    setAutoPlaySearchWorkflowIsActive(false);
                    showAutoPlayError(
                        'Search unavailable',
                        'Search results could not be opened.',
                    );
                }

                return false;
            },
        );

        return {
            pushPromise,
            template: resultsTemplate,
            wasPushed: () => templateWasPushed,
        };
    } catch {
        if (requestIsCurrent()) {
            clearAutoPlaySubmittedSearchResults();
            setAutoPlaySearchWorkflowIsActive(false);
            showAutoPlayError(
                'Search unavailable',
                'Search results could not be opened.',
            );
        }
    }

    return null;
}

function prepareAutoPlaySearchMap() {
    const { HybridAutoPlay } = loadAutoPlayModule();
    const mapTemplate = rootMapTemplate;

    if (autoPlayPlatform?.prepareSearchMap && mapTemplate) {
        return autoPlayPlatform.prepareSearchMap({
            hybridAutoPlay: HybridAutoPlay,
            mapTemplate,
            isCurrent: () =>
                rootMapTemplate === mapTemplate && rootMapTemplateIsReady,
        });
    }

    return HybridAutoPlay.popToRootTemplate(false);
}

async function runPlaceTextSearch(
    template,
    searchText,
    startLocation,
    {
        onResultsTemplatePresented = () => {},
        requestIsCurrent: parentRequestIsCurrent = () => true,
        prepareMap = prepareAutoPlaySearchMap,
    } = {},
) {
    const textQuery = String(searchText ?? '').trim();

    abortSearchRequest();
    const requestSequence = searchRequestSequence;
    const requestIsCurrent = () =>
        parentRequestIsCurrent() && requestSequence === searchRequestSequence;

    if (textQuery.length < PLACE_SEARCH_MIN_QUERY_LENGTH) {
        if (requestIsCurrent()) {
            setAutoPlaySearchWorkflowIsActive(false);
            updateSearchTemplateResults(template, [], textQuery, startLocation);
        }
        return;
    }

    setAutoPlaySearchWorkflowIsActive(true);
    const abortController = new AbortController();
    searchAbortController = abortController;
    setAutoPlayState({ searchLoading: { query: textQuery }, errorText: '' });

    try {
        await prepareMap();
        if (
            !requestIsCurrent() ||
            !autoPlaySearchRequestIsCurrent(
                searchAbortController,
                abortController,
            )
        ) {
            return;
        }
        const location = await getAutoPlaySearchLocation(startLocation);

        if (
            !requestIsCurrent() ||
            !autoPlaySearchRequestIsCurrent(
                searchAbortController,
                abortController,
            )
        ) {
            return;
        }

        const results = await searchTextPlaces({
            location,
            signal: abortController.signal,
            textQuery,
        });

        if (
            !requestIsCurrent() ||
            !autoPlaySearchRequestIsCurrent(
                searchAbortController,
                abortController,
            )
        ) {
            return;
        }

        logAutoPlayPlatformAction('place-search-completed', {
            query: textQuery,
            resultCount: results.length,
        });

        const resultTemplatePresentation = presentAutoPlaySearchResults({
            query: textQuery,
            requestIsCurrent,
            results,
            startLocation,
        });
        onResultsTemplatePresented(resultTemplatePresentation);
        await resultTemplatePresentation?.pushPromise;
    } catch (error) {
        if (
            error?.name !== 'AbortError' &&
            requestIsCurrent() &&
            autoPlaySearchRequestIsCurrent(
                searchAbortController,
                abortController,
            )
        ) {
            setAutoPlaySearchWorkflowIsActive(false);
            showAutoPlayError(
                'Search unavailable',
                error?.message || 'Search failed.',
            );
            setAutoPlayState({
                errorText: error?.message || 'Search failed.',
                statusLabel: 'Search error',
            });
        }
    } finally {
        if (searchAbortController === abortController) {
            searchAbortController = null;
            setAutoPlayState({ searchLoading: null });
        }
    }
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

function openSavedSearchCategoryTemplate(category, onSelect) {
    const { ListTemplate } = loadAutoPlayModule();
    let template;
    let savedLocationsUnsubscribe = null;
    let latestSavedLocations = getSearchSavedLocationsSnapshot(category);
    let isActive = true;
    let templateWasPushed = false;
    let loadFailed = false;
    let currentPage = 0;
    let savedLocationWasSelected = false;
    const dismiss = () => {
        isActive = false;
        savedLocationsUnsubscribe?.();
        savedLocationsUnsubscribe = null;
    };
    const showPage = (savedLocations, page = currentPage) => {
        if (!isActive || savedLocationWasSelected) {
            return;
        }

        latestSavedLocations = savedLocations;
        currentPage = page;

        if (!templateWasPushed || !savedLocations) {
            return;
        }

        void updateSearchTemplateSection(template, makeSection());
    };
    const selectLocation = (result) => {
        if (!isActive || savedLocationWasSelected) {
            return;
        }

        savedLocationWasSelected = true;
        onSelect(result, template);
    };
    const makeSection = () => ({
        items: latestSavedLocations
            ? makeSavedSearchCategoryRows(
                  latestSavedLocations,
                  category,
                  currentPage,
                  selectLocation,
                  (nextPage) => showPage(latestSavedLocations, nextPage),
              )
            : [
                  makeDisabledSearchRow(
                      loadFailed
                          ? 'Saved places unavailable'
                          : `Loading ${category.toLowerCase()}`,
                      loadFailed
                          ? 'Use Voice search or Keyboard.'
                          : 'Saved destinations are being loaded.',
                  ),
              ],
        type: 'default',
    });
    const refresh = () => {
        if (isActive && templateWasPushed && !savedLocationWasSelected) {
            latestSavedLocations =
                getSearchSavedLocationsSnapshot(category) ??
                latestSavedLocations;
            void updateSearchTemplateSection(template, makeSection());
        }
    };

    template = new ListTemplate({
        headerActions: getBackHeaderAction(dismiss),
        onPopped: dismiss,
        onDidAppear: refresh,
        sections: makeSection(),
        title: makeAutoText(category),
    });

    savedLocationsUnsubscribe = addSearchSavedLocationsListener(() => {
        const savedLocations = getSearchSavedLocationsSnapshot(category);
        if (savedLocations) {
            showPage(savedLocations);
        }
    });
    loadSearchSavedLocations()
        .then((loadedLocations) => {
            showPage(latestSavedLocations ?? loadedLocations);
        })
        .catch(() => {
            loadFailed = true;
            refresh();
        });

    return template
        .push()
        .then(() => {
            templateWasPushed = true;
            refresh();
        })
        .catch((error) => {
            dismiss();
            logAutoPlayPlatformAction('saved-destinations-push-failed', {
                message: error?.message || 'Unknown error',
            });
            showAutoPlayError(
                'Search unavailable',
                error?.message || 'Saved destinations could not be opened.',
            );
        });
}

function openSavedDestinationsTemplate() {
    const { ListTemplate } = loadAutoPlayModule();
    let template;
    let savedLocationsUnsubscribe = null;
    let latestSavedLocations = getSearchSavedLocationsSnapshot();
    let isActive = true;
    let templateWasPushed = false;
    let loadFailed = false;
    let savedLocationWasSelected = false;
    const dismiss = () => {
        isActive = false;
        savedLocationsUnsubscribe?.();
        savedLocationsUnsubscribe = null;
    };
    const makeSection = () => ({
        items: makeInitialSavedSearchRows(
            latestSavedLocations,
            (result) => {
                if (!isActive) {
                    return;
                }

                savedLocationWasSelected = true;
                handleSearchResultSelected(result, { template });
            },
            (category) => {
                if (!isActive) {
                    return;
                }

                openSavedSearchCategoryTemplate(
                    category,
                    (result, categoryTemplate) => {
                        if (!isActive) {
                            return;
                        }

                        savedLocationWasSelected = true;
                        handleSearchResultSelected(result, {
                            template: categoryTemplate,
                        });
                    },
                );
            },
        ),
        type: 'default',
    });
    const showSavedLocations = (savedLocations) => {
        latestSavedLocations = savedLocations;
        if (
            !isActive ||
            !templateWasPushed ||
            savedLocationWasSelected ||
            !savedLocations
        ) {
            return;
        }

        void updateSearchTemplateSection(template, makeSection());
    };
    const refresh = () => {
        latestSavedLocations =
            getSearchSavedLocationsSnapshot() ?? latestSavedLocations;
        if (latestSavedLocations) {
            showSavedLocations(latestSavedLocations);
        } else if (isActive && templateWasPushed && loadFailed) {
            void updateSearchTemplateSection(template, {
                items: [
                    makeDisabledSearchRow(
                        'Saved places unavailable',
                        'Use Voice search or Keyboard.',
                    ),
                ],
                type: 'default',
            });
        }
    };
    const headerActions = getBackHeaderAction(dismiss);

    template = new ListTemplate({
        headerActions: {
            ...headerActions,
            ios: {
                ...headerActions.ios,
                leadingNavigationBarButtons: [
                    {
                        onPress: handleRootHeaderVoiceSearchPress,
                        title: 'Voice search',
                        type: 'text',
                    },
                    {
                        onPress: () => openSearchTemplate(),
                        title: 'Keyboard',
                        type: 'text',
                    },
                ],
            },
        },
        onPopped: dismiss,
        onDidAppear: refresh,
        sections: latestSavedLocations
            ? makeSection()
            : {
                  items: [
                      makeDisabledSearchRow(
                          'Loading saved places',
                          'Home, Work, favorites, and recents.',
                      ),
                  ],
                  type: 'default',
              },
        title: makeAutoText('Destinations'),
    });

    savedLocationsUnsubscribe = addSearchSavedLocationsListener(
        (savedLocations) => {
            latestSavedLocations = savedLocations;
            showSavedLocations(savedLocations);
        },
    );
    loadSearchSavedLocations()
        .then((loadedLocations) => {
            showSavedLocations(latestSavedLocations ?? loadedLocations);
        })
        .catch(() => {
            loadFailed = true;
            refresh();
        });

    return {
        pushPromise: template
            .push()
            .then(() => {
                templateWasPushed = true;
                refresh();
            })
            .catch((error) => {
                dismiss();
                logAutoPlayPlatformAction('saved-destinations-push-failed', {
                    message: error?.message || 'Unknown error',
                });
                showAutoPlayError(
                    'Search unavailable',
                    error?.message || 'Saved destinations could not be opened.',
                );
            }),
        template,
    };
}

function makeRouteStepsSection(steps, page, onPageChange) {
    // Four instructions leave room for both paging rows within the host's
    // guaranteed minimum of six list items.
    const pageSize = 4;
    const start = page * pageSize;
    const items = steps.slice(start, start + pageSize).map((step, index) => ({
        detailedText: makeAutoText(
            formatDirectionsManeuverDistance(step.displayDistance),
        ),
        title: makeAutoText(
            `${start + index + 1}. ${getManeuverInstruction(step)}`,
        ),
        type: 'text',
    }));

    if (!steps.length) {
        items.push(
            makeDisabledSearchRow(
                'No upcoming steps',
                'Return to the map for guidance.',
            ),
        );
    }
    if (page > 0) {
        items.unshift({
            onPress: () => onPageChange(page - 1),
            title: makeAutoText('Previous steps'),
            type: 'default',
        });
    }
    if (start + pageSize < steps.length) {
        items.push({
            onPress: () => onPageChange(page + 1),
            title: makeAutoText('More steps'),
            type: 'default',
        });
    }

    return { items, type: 'default' };
}

function openRouteStepsTemplate() {
    if (!activeNavigationRoute || !rootMapTemplate || !rootMapTemplateIsReady) {
        return;
    }

    const route = activeNavigationRoute;
    const rootTemplate = rootMapTemplate;
    const routeProgress = navigationProgressTracker.update(
        route,
        lastNavigationGuidanceLocation,
    );
    const activeManeuver = getActiveDirectionsManeuver(
        route,
        lastNavigationGuidanceLocation,
        routeProgress,
    );
    const routeSteps = getDirectionsSteps(route, activeManeuver);
    const currentStepIndex = routeSteps.findIndex((step) => step.isCurrent);
    const upcomingSteps = routeSteps.slice(Math.max(0, currentStepIndex));
    const { ListTemplate } = loadAutoPlayModule();
    let template;
    let isActive = true;
    const requestIsCurrent = () =>
        isActive &&
        activeNavigationRoute === route &&
        rootMapTemplate === rootTemplate;
    const dismiss = () => {
        isActive = false;
    };
    const showPage = (page) => {
        if (!requestIsCurrent()) {
            return;
        }
        return updateSearchTemplateSection(
            template,
            makeRouteStepsSection(upcomingSteps, page, showPage),
        );
    };

    try {
        template = new ListTemplate({
            headerActions: getBackHeaderAction(dismiss),
            onPopped: dismiss,
            sections: makeRouteStepsSection(upcomingSteps, 0, showPage),
            title: makeAutoText('Route steps'),
        });
        return template.push().catch(() => {
            if (requestIsCurrent()) {
                showAutoPlayError(
                    'Route steps unavailable',
                    'The route steps could not be opened.',
                );
            }
            dismiss();
        });
    } catch {
        dismiss();
        showAutoPlayError(
            'Route steps unavailable',
            'The route steps could not be opened.',
        );
    }
}

function openMapOptionsTemplate() {
    if (!rootMapTemplate || !rootMapTemplateIsReady) {
        return;
    }
    const rootTemplate = rootMapTemplate;
    const presentation = createAutoPlayMapOptionsTemplate({
        ListTemplate: loadAutoPlayModule().ListTemplate,
        getBackHeaderAction,
        getPreferences: getSharedMapPreferencesState,
        setPreferences: setSharedMapPreferencesState,
        subscribePreferences: addSharedMapSettingsStateListener,
        weatherStore,
        mapLayers: MAP_LAYER_STYLES,
        lightPresets: MAP_LIGHT_PRESET_OPTIONS,
        requestIsCurrent: () =>
            rootMapTemplate === rootTemplate && rootMapTemplateIsReady,
        onError: () =>
            showAutoPlayError(
                'Map settings unavailable',
                'Map settings could not be opened.',
            ),
    });
    return presentation.pushPromise;
}

function openSearchTemplate(
    initialSearchText = '',
    preferredStartLocation,
    { requestIsCurrent = () => true } = {},
) {
    const { SearchTemplate } = loadAutoPlayModule();
    let templateWasPushed = false;
    let template;
    let savedLocationsUnsubscribe = null;
    let savedLocations = getSearchSavedLocationsSnapshot();
    let searchIsActive = true;
    let searchWasSubmitted = false;
    let submittedResults = [];
    let mapResultsAreOpening = false;
    let savedLocationsAreLoaded = Boolean(savedLocations);
    let savedLocationsLoadFailed = false;
    let savedLocationWasSelected = false;
    let searchTextValue = String(initialSearchText ?? '');
    let initialVoiceSearchIsPending = Boolean(searchTextValue.trim());
    let placeSearch;
    const emptyResults = {
        items: [
            makeDisabledSearchRow(
                'Search',
                'Tap the search field, then use the keyboard or its microphone when available.',
            ),
        ],
        type: 'default',
    };
    const initialLoadingCopy = getAutoPlaySearchLoadingCopy(initialSearchText);
    const initialResults = String(initialSearchText ?? '').trim()
        ? {
              items: [
                  makeDisabledSearchRow(
                      initialLoadingCopy.title,
                      initialLoadingCopy.detailedText,
                  ),
              ],
              type: 'default',
          }
        : makeSavedResults();
    const refreshInitialResults = () => {
        if (
            !searchIsActive ||
            !templateWasPushed ||
            !requestIsCurrent() ||
            savedLocationWasSelected ||
            searchTextValue.trim()
        ) {
            return;
        }

        savedLocations = getSearchSavedLocationsSnapshot() ?? savedLocations;
        savedLocationsAreLoaded = Boolean(savedLocations);
        savedLocationsLoadFailed = savedLocationsLoadFailed && !savedLocations;
        void updateSearchTemplateSection(template, makeSavedResults());
    };
    function makeSavedResults() {
        return savedLocationsLoadFailed
            ? {
                  items: [
                      makeDisabledSearchRow(
                          'Saved places unavailable',
                          'Search for a destination.',
                      ),
                  ],
                  type: 'default',
              }
            : savedLocationsAreLoaded
              ? {
                    items: makeInitialSavedSearchRows(
                        savedLocations,
                        (result) => {
                            if (!searchIsActive || !requestIsCurrent()) {
                                return;
                            }

                            savedLocationWasSelected = true;
                            handleSearchResultSelected(result, {
                                preferredStartLocation,
                                template,
                            });
                        },
                        (category) => {
                            if (!searchIsActive || !requestIsCurrent()) {
                                return;
                            }

                            openSavedSearchCategoryTemplate(
                                category,
                                (result, categoryTemplate) => {
                                    if (
                                        !searchIsActive ||
                                        !requestIsCurrent()
                                    ) {
                                        return;
                                    }

                                    savedLocationWasSelected = true;
                                    handleSearchResultSelected(result, {
                                        preferredStartLocation,
                                        template: categoryTemplate,
                                    });
                                },
                            );
                        },
                    ),
                    type: 'default',
                }
              : emptyResults;
    }

    const runSubmittedSearch = (searchText) => {
        if (!searchIsActive || searchWasSubmitted || !requestIsCurrent()) {
            return Promise.resolve();
        }

        initialVoiceSearchIsPending = false;
        searchTextValue = String(searchText ?? '').trim();
        savedLocationWasSelected = false;
        if (searchTextValue.length < PLACE_SEARCH_MIN_QUERY_LENGTH) {
            placeSearch.cancel();
            if (!searchTextValue) {
                refreshInitialResults();
                return Promise.resolve();
            }
            return updateSearchTemplateResults(
                template,
                [],
                searchTextValue,
                preferredStartLocation,
            );
        }

        searchWasSubmitted = true;
        return placeSearch.submit(searchTextValue);
    };
    const openResultsMap = async () => {
        if (
            !searchIsActive ||
            !requestIsCurrent() ||
            !searchWasSubmitted ||
            !submittedResults.length ||
            mapResultsAreOpening
        ) {
            return;
        }

        mapResultsAreOpening = true;
        const query = searchTextValue;
        const results = submittedResults;
        try {
            // CarPlay panels require an uncovered root map. Only the explicit Map action
            // transitions away from Auto Play's native, full submitted-results screen.
            await prepareAutoPlaySearchMap();
            if (!searchIsActive || !requestIsCurrent()) {
                return;
            }
            const presentation = presentAutoPlaySearchResults({
                includesMap: true,
                query,
                results,
                startLocation: preferredStartLocation,
                requestIsCurrent: () => searchIsActive && requestIsCurrent(),
            });
            if (!presentation || !(await presentation.pushPromise)) {
                mapResultsAreOpening = false;
                dismissSearch();
            }
        } catch {
            mapResultsAreOpening = false;
            dismissSearch();
            showAutoPlayError(
                'Map unavailable',
                'Search results could not be shown on the map.',
            );
        }
    };
    const dismissSearch = () => {
        savedLocationsUnsubscribe?.();
        savedLocationsUnsubscribe = null;
        if (mapResultsAreOpening) {
            return;
        }
        searchIsActive = false;
        placeSearch.cancel();
        if (activeAutoPlayPlaceSearch === placeSearch) {
            activeAutoPlayPlaceSearch = null;
            setAutoPlaySearchWorkflowIsActive(false);
            setAutoPlayState({ searchLoading: null });
            clearAutoPlaySubmittedSearchResults();
        }
    };

    cancelAutoPlaySearchWork();
    clearAutoPlaySubmittedSearchResults();
    placeSearch = createAutoPlayPlaceSearch({
        createSessionToken: createPlaceSearchSessionToken,
        getLocation: () => getAutoPlaySearchLocation(preferredStartLocation),
        minQueryLength: PLACE_SEARCH_MIN_QUERY_LENGTH,
        searchPlaces,
        searchTextPlaces,
        onLoading: (query) => {
            setAutoPlayState({ searchLoading: { query } });
            submittedResults = [];
            clearAutoPlaySubmittedSearchResults();
            const copy = getAutoPlaySearchLoadingCopy(query);
            void updateSearchTemplateSection(template, {
                items: [makeDisabledSearchRow(copy.title, copy.detailedText)],
                type: 'default',
            });
        },
        onResults: async (results, query, submitted) => {
            if (
                !searchIsActive ||
                !requestIsCurrent() ||
                savedLocationWasSelected
            ) {
                return;
            }
            if (submitted) {
                setAutoPlayState({ searchLoading: null });
                submittedResults = results;
            }
            await updateSearchTemplateResults(
                template,
                results,
                query,
                preferredStartLocation,
            );
            logAutoPlayPlatformAction(
                submitted
                    ? 'search-results-presented'
                    : 'search-autocomplete-updated',
                {
                    query,
                    resultCount: results.length,
                },
            );
        },
        onError: (error) => {
            if (!searchIsActive || !requestIsCurrent()) {
                return;
            }
            setAutoPlayState({ searchLoading: null });
            void updateSearchTemplateSection(template, {
                items: [
                    makeDisabledSearchRow(
                        'Search unavailable',
                        error?.message || 'Search failed. Please try again.',
                    ),
                ],
                type: 'default',
            });
        },
    });
    activeAutoPlayPlaceSearch = placeSearch;
    setAutoPlaySearchWorkflowIsActive(true);

    template = new SearchTemplate({
        headerActions: getSearchResultsHeaderActions(() => {
            if (!searchWasSubmitted) {
                dismissSearch();
                return;
            }
            placeSearch.cancel();
            searchWasSubmitted = false;
            submittedResults = [];
            setAutoPlayState({ searchLoading: null });
            clearAutoPlaySubmittedSearchResults();
        }, openResultsMap),
        initialSearchText,
        onDidAppear: refreshInitialResults,
        onWillAppear: () => {
            searchWasSubmitted = false;
        },
        onSearchTextChanged: (searchText) => {
            if (
                !searchIsActive ||
                searchWasSubmitted ||
                savedLocationWasSelected
            ) {
                return;
            }

            if (initialVoiceSearchIsPending) {
                return;
            }

            searchTextValue = String(searchText ?? '').trim();
            if (searchTextValue.length < PLACE_SEARCH_MIN_QUERY_LENGTH) {
                placeSearch.cancel();
                if (!searchTextValue) {
                    refreshInitialResults();
                } else {
                    void updateSearchTemplateSection(template, emptyResults);
                }
                return;
            }

            void placeSearch.change(searchTextValue);
        },
        onSearchTextSubmitted: (searchText) => {
            return runSubmittedSearch(searchText);
        },
        onPopped: dismissSearch,
        results: initialResults,
        searchHint: 'Where to?',
        title: makeAutoText('Destination'),
    });

    setAutoPlayState({
        detailText: 'Choose a destination on the car screen.',
        errorText: '',
        statusLabel: 'Search',
    });

    savedLocationsUnsubscribe = addSearchSavedLocationsListener(
        (updatedLocations) => {
            savedLocations = updatedLocations;

            savedLocationsAreLoaded = true;
            savedLocationsLoadFailed = false;
            refreshInitialResults();
        },
    );
    loadSearchSavedLocations()
        .then((loadedLocations) => {
            savedLocations ??= loadedLocations;
            savedLocationsAreLoaded = true;
            refreshInitialResults();
        })
        .catch(() => {
            savedLocations =
                getSearchSavedLocationsSnapshot() ?? savedLocations;
            savedLocationsAreLoaded = true;
            savedLocationsLoadFailed = !savedLocations;
            refreshInitialResults();
        });

    const pushPromise = template
        .push()
        .then(() => {
            templateWasPushed = true;

            if (initialSearchText && requestIsCurrent()) {
                return runSubmittedSearch(initialSearchText);
            }

            refreshInitialResults();

            return undefined;
        })
        .catch((error) => {
            dismissSearch();

            if (!requestIsCurrent()) {
                return;
            }

            logAutoPlayPlatformAction('search-template-push-failed', {
                message: error?.message || 'Unknown error',
            });
            showAutoPlayError(
                'Search unavailable',
                error?.message || 'Search could not be opened.',
            );
        });

    return {
        pushPromise,
        template,
        wasPushed: () => templateWasPushed,
    };
}

function openVoiceSearchResultsTemplate(
    searchQuery,
    preferredStartLocation,
    { requestIsCurrent = () => true } = {},
) {
    const lifecycle = createAutoPlaySearchTemplateLifecycle();
    let presentation = null;
    cancelAutoPlaySearchWork();
    clearAutoPlaySubmittedSearchResults();
    const pushPromise = prepareAutoPlaySearchMap();
    void runPlaceTextSearch(null, searchQuery, preferredStartLocation, {
        requestIsCurrent,
        prepareMap: () => pushPromise,
        onResultsTemplatePresented: (result) => {
            presentation = lifecycle.trackResultTemplatePresentation(result);
        },
    });

    return {
        pushPromise,
        getTemplate: () => presentation?.template,
        waitForResultTemplatePushes: lifecycle.waitForResultTemplatePushes,
        wasPushed: () => presentation?.wasPushed() ?? false,
    };
}

function getRouteNumberDelta(value, baseline) {
    const numericValue = Number(value);
    const numericBaseline = Number(baseline);

    return Number.isFinite(numericValue) && Number.isFinite(numericBaseline)
        ? numericValue - numericBaseline
        : null;
}

function getPotentiallyAvoidedNodesText(nodeCount) {
    return nodeCount > 0
        ? `Potentially avoids ${nodeCount} monitored ${nodeCount === 1 ? 'node' : 'nodes'}`
        : '';
}

function getRouteOptionDetail(routeOption, baselineRouteOption, route) {
    const potentiallyAvoidedNodeCount = getAutoPlayPotentiallyAvoidedNodeCount(
        routeOption,
        baselineRouteOption,
        route,
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

    return [baselineDetail, deltaDetail, privateRouteDetail]
        .filter(Boolean)
        .join(' - ');
}

function setAutoPlayRoutePreviewState(route) {
    const selectedRoute = getSelectedDirectionsRouteOption(route);

    setAutoPlayState({
        detailText: 'Review the available route options.',
        directionsRoute: route,
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
}

function hideAutoPlayRoutePreview() {
    if (!routePreviewIsVisible) {
        return;
    }

    routePreviewIsVisible = false;

    try {
        rootMapTemplate?.hideTripSelector();
    } catch {
        // The native selector may already be closing or disconnected.
    }
}

function clearAutoPlayRoutePreviewState() {
    routePreviewRequestSequence += 1;
    routePreviewIsVisible = false;
    updateRootMapButtons();
    setAutoPlayState({
        detailText: 'Search for a destination to start a private route.',
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
}

async function showRoutePreview(route) {
    const { HybridAutoPlay } = loadAutoPlayModule();

    if (!rootMapTemplate || !rootMapTemplateIsReady) {
        showAutoPlayError(
            'Car screen unavailable',
            'Car screen is not connected.',
        );
        return;
    }

    const mapTemplate = rootMapTemplate;
    const previewRequestId = ++routePreviewRequestSequence;
    const routeOptions = getDirectionsRouteOptions(route);
    const baselineRouteOption =
        routeOptions.find(
            (routeOption) => routeOption.routeKey === DIRECTIONS_ROUTE_FASTEST,
        ) ?? routeOptions[0];
    const selectedRoute = getSelectedDirectionsRouteOption(route);
    const tripId = `daf-preview-${route.requestedAt || Date.now()}`;
    let previewRoute = route;
    let trips;

    try {
        trips = makeAutoPlayTripSelectorTrips({
            makeRouteChoice: (routeOption) =>
                makeAutoPlayRouteChoice(routeOption, route, {
                    includeOrigin: true,
                    selectionSummary: getRouteOptionDetail(
                        routeOption,
                        baselineRouteOption,
                        route,
                    ),
                }),
            routeOptions,
            selectedRouteKey: selectedRoute?.routeKey,
            tripId,
        });
    } catch (error) {
        showAutoPlayError(
            'Route unavailable',
            error?.message || 'Directions did not include a usable route.',
        );
        return;
    }

    const selectPreviewRoute = (routeId) => {
        previewRoute = selectDirectionsRoute(route, routeId);
        setAutoPlayRoutePreviewState(previewRoute);
    };

    try {
        // The trip selector belongs to the root map. Remove every search
        // template first so the route choices are visible immediately.
        clearAutoPlaySubmittedSearchResults();
        setAutoPlaySearchWorkflowIsActive(false);
        await HybridAutoPlay.popToRootTemplate(false);

        if (previewRequestId !== routePreviewRequestSequence) {
            return;
        }

        if (rootMapTemplate !== mapTemplate || !rootMapTemplateIsReady) {
            clearAutoPlayRoutePreviewState();
            return;
        }

        routePreviewIsVisible = true;
        mapTemplate.showTripSelector({
            mapButtons: getRootMapButtons(),
            onBackPressed: clearAutoPlayRoutePreviewState,
            onTripSelected: (_selectedTripId, routeId) => {
                selectPreviewRoute(routeId);
            },
            onTripStarted: (_selectedTripId, routeId) => {
                routePreviewIsVisible = false;
                startAutoPlayNavigation(selectDirectionsRoute(route, routeId), {
                    hostNavigationAlreadyStarted: true,
                });
            },
            selectedTripId: tripId,
            textConfig: AUTO_PLAY_TRIP_PREVIEW_TEXT_CONFIGURATION,
            trips,
        });
        setAutoPlayRoutePreviewState(previewRoute);
        logAutoPlayPlatformAction('route-choices-presented', {
            destinationLabel: route.destination?.label || 'Destination',
            routeChoiceCount: routeOptions.length,
        });
    } catch (error) {
        if (previewRequestId !== routePreviewRequestSequence) {
            return;
        }

        routePreviewIsVisible = false;
        clearAutoPlayRoutePreviewState();
        showAutoPlayError(
            'Route options unavailable',
            error?.message || 'Route options could not be opened.',
        );
    }
}

async function resolvePlaceForResult(result, signal) {
    if (result?.place?.location) {
        return result.place;
    }

    if (!result?.placeId) {
        throw new Error('Place details could not be loaded.');
    }

    return getPlaceDetails({
        placeId: result.placeId,
        sessionToken: result.sessionToken,
        signal,
    });
}

async function handleSearchResultSelected(
    result,
    {
        preferredStartLocation,
        routeLoadingRequestId,
        startNavigationImmediately = false,
        template,
    } = {},
) {
    abortSearchRequest();
    const routeLoadController = startRouteLoadRequest();

    const title = result?.primaryText || result?.label || 'Destination';
    logAutoPlayPlatformAction('search-result-selected', {
        destinationLabel: title,
        startNavigationImmediately,
    });
    const loadingRequestId =
        routeLoadingRequestId ?? beginAutoPlayRouteLoading(title);
    updateAutoPlayRouteLoading(loadingRequestId, title);
    updateSearchTemplateLoadingRoute(template, title);

    setAutoPlayState({
        detailText: 'Loading place details and route.',
        errorText: '',
        statusLabel: 'Loading route',
        title,
    });

    try {
        const place = await resolvePlaceForResult(
            result,
            routeLoadController.signal,
        );

        if (
            !autoPlaySearchRequestIsCurrent(
                routeLoadAbortController,
                routeLoadController,
            )
        ) {
            return;
        }

        const destinationWaypoint = createPlaceDirectionsWaypoint({
            address: result?.secondaryText,
            name: result?.primaryText,
            place,
            result,
        });

        if (!destinationWaypoint) {
            throw new Error('Destination location could not be loaded.');
        }

        const savedLocation = createSavedLocationFromPlace({ place, result });

        if (savedLocation) {
            void addRecentLocation(savedLocation).catch(() => {});
        }

        const startWaypoint = await getStartWaypoint(preferredStartLocation);

        if (
            !autoPlaySearchRequestIsCurrent(
                routeLoadAbortController,
                routeLoadController,
            )
        ) {
            return;
        }

        const routeStart = getDirectionsWaypointApiCoord(startWaypoint);
        const routeEnd = getDirectionsWaypointApiCoord(destinationWaypoint);

        if (!routeStart || !routeEnd) {
            throw new Error('Directions need both a start and destination.');
        }

        const { route } = await getDirections({
            end: routeEnd,
            signal: routeLoadController.signal,
            start: routeStart,
        });

        if (
            !autoPlaySearchRequestIsCurrent(
                routeLoadAbortController,
                routeLoadController,
            )
        ) {
            return;
        }

        routeLoadAbortController = null;

        const initialRouteKey = getAutoPlayInitialRouteKey(
            getDirectionsRouteOptions(route),
            getSharedMapPreferencesState().preferPrivateRoutes,
        );
        const initiallySelectedRoute = initialRouteKey
            ? selectDirectionsRoute(route, initialRouteKey)
            : route;
        const resolvedRoute = {
            ...initiallySelectedRoute,
            destination: destinationWaypoint,
            requestedAt: Date.now(),
            start: startWaypoint,
        };

        if (startNavigationImmediately) {
            startAutoPlayNavigation(resolvedRoute);
            return;
        }

        await showRoutePreview(resolvedRoute);
    } catch (error) {
        if (
            error?.name === 'AbortError' ||
            !autoPlaySearchRequestIsCurrent(
                routeLoadAbortController,
                routeLoadController,
            )
        ) {
            return;
        }

        routeLoadAbortController = null;
        showAutoPlayError(
            'Route unavailable',
            error?.message || 'Directions could not be loaded.',
        );
    } finally {
        finishAutoPlayRouteLoading(loadingRequestId);
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

function makeTripSteps(routeOption, route, { includeOrigin = false } = {}) {
    const maneuvers = routeOption?.maneuvers ?? [];
    const steps = [];
    const estimateValues = getAutoPlayTripEstimateValues(routeOption);

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
                estimateValues.maneuverEstimates[index]?.distanceMeters,
                estimateValues.maneuverEstimates[index]?.durationSeconds,
                instruction,
            ),
        );

        if (step) {
            steps.push(step);
        }
    });

    const destinationCoordinate =
        normalizeCoordinatePair(
            routeOption.coordinates?.[routeOption.coordinates.length - 1],
        ) ?? getWaypointLocationCoordinate(route?.destination);
    const destinationName =
        route?.destination?.label ||
        route?.destination?.inputValue ||
        'Destination';
    const destinationStep = getTripPointFromCoordinate(
        destinationCoordinate,
        destinationName,
        makeTravelEstimates(
            estimateValues.destination.distanceMeters,
            estimateValues.destination.durationSeconds,
            destinationName,
        ),
    );

    const startCoordinate =
        getWaypointLocationCoordinate(route?.start) ??
        normalizeCoordinatePair(routeOption?.coordinates?.[0]);
    const startStep = getTripPointFromCoordinate(
        startCoordinate,
        route?.start?.label || 'Start',
        makeTravelEstimates(
            estimateValues.origin.distanceMeters,
            estimateValues.origin.durationSeconds,
            'Start',
        ),
    );

    return makeAutoPlayTripSteps({
        destinationStep,
        includeOrigin,
        maneuverSteps: steps,
        originStep: startStep,
    });
}

function makeAutoPlayRouteChoice(
    routeOption,
    route,
    { includeOrigin = false, selectionSummary } = {},
) {
    const routeLabel = routeOption?.routeLabel || 'Route';
    const routeSummary =
        selectionSummary ||
        [
            formatDirectionsDuration(routeOption?.duration),
            formatDirectionsDistance(routeOption?.distance),
        ]
            .filter(Boolean)
            .join(' - ');
    const steps = makeTripSteps(routeOption, route, { includeOrigin });
    const routeChoiceText = getAutoPlayRouteChoiceText({
        routeLabel,
        selectionSummary: routeSummary,
    });

    if (steps.length < 2) {
        return null;
    }

    return {
        ...routeChoiceText,
        id: routeOption?.routeKey || 'route',
        steps,
    };
}

function makeTripConfig(route) {
    const routeOption = getSelectedDirectionsRouteOption(route);
    const routeChoice = makeAutoPlayRouteChoice(routeOption, route);

    if (!routeChoice) {
        throw new Error('Route did not include enough navigation steps.');
    }

    return {
        id: `daf-${routeOption?.routeKey || 'route'}-${Date.now()}`,
        routeChoice,
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

function makeAutoPlayRoutingManeuver(route, maneuver) {
    if (!maneuver) {
        return null;
    }

    const routeOption = getSelectedDirectionsRouteOption(route);
    const instruction = getManeuverInstruction(maneuver);
    const distanceRemaining = getManeuverDistanceRemaining(maneuver);
    const maneuverConfig = getAutoPlayManeuverConfig(maneuver);
    const roundaboutExitImage = getAutoPlayRoundaboutExitImage(
        maneuverConfig.exitNumber,
    );
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
        symbolImage: roundaboutExitImage
            ? {
                  color: getManeuverCardIconColor(),
                  image: roundaboutExitImage,
                  type: 'asset',
              }
            : makeGlyphImage(maneuverConfig.glyph, {
                  backgroundColor: 'transparent',
                  color: getManeuverCardIconColor(),
              }),
        trafficSide: 0,
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

function makeAutoPlayRoutingManeuvers(
    route,
    userLocation,
    routeProgress = getDirectionsRouteProgress(route, userLocation),
    currentManeuver = getActiveDirectionsManeuver(
        route,
        userLocation,
        routeProgress,
    ),
) {
    const currentRoutingManeuver = makeAutoPlayRoutingManeuver(
        route,
        currentManeuver,
    );

    if (!currentRoutingManeuver) {
        return [];
    }

    const nextRoutingManeuver = makeAutoPlayRoutingManeuver(
        route,
        getNextDirectionsManeuver(route, userLocation, routeProgress),
    );

    return [currentRoutingManeuver, nextRoutingManeuver].filter(Boolean);
}

function makeNavigationMessage(
    route,
    userLocation,
    routeProgress = getDirectionsRouteProgress(route, userLocation),
    activeManeuver = getActiveDirectionsManeuver(
        route,
        userLocation,
        routeProgress,
    ),
) {
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
    if (!activeNavigationRoute) {
        return;
    }

    const recordedAt = getFiniteNumber(
        userLocation?.recordedAt ?? userLocation?.timestamp,
    );

    if (
        recordedAt === null ||
        latestNavigationGuidanceRecordedAt === null ||
        recordedAt >= latestNavigationGuidanceRecordedAt
    ) {
        lastNavigationGuidanceLocation =
            userLocation ?? lastNavigationGuidanceLocation;
        latestNavigationGuidanceRecordedAt =
            recordedAt ?? latestNavigationGuidanceRecordedAt;
    }

    userLocation = lastNavigationGuidanceLocation;

    if (rootMapPanningInterfaceIsVisible) {
        navigationGuidanceIsDeferredDuringPanning = true;
        deferredNavigationGuidanceLocation = lastNavigationGuidanceLocation;
        return;
    }

    lastNavigationGuidanceUpdatedAt = Date.now();

    const routeGeneration = navigationRouteGeneration;
    const routeOption = getSelectedDirectionsRouteOption(activeNavigationRoute);
    const routeProgress = navigationProgressTracker.update(
        activeNavigationRoute,
        userLocation,
    );
    const activeManeuver = getActiveDirectionsManeuver(
        activeNavigationRoute,
        userLocation,
        routeProgress,
    );
    const { distanceRemaining, durationRemaining } =
        getRemainingDirectionsRouteValues(
            activeNavigationRoute,
            userLocation,
            routeProgress,
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
    const maneuver = makeNavigationMessage(
        activeNavigationRoute,
        userLocation,
        routeProgress,
        activeManeuver,
    );
    const routingManeuvers = makeAutoPlayRoutingManeuvers(
        activeNavigationRoute,
        userLocation,
        routeProgress,
        activeManeuver,
    );

    const nativeNavigationTemplate = rootMapTemplate;

    if (nativeNavigationTemplate) {
        try {
            if (destinationStep) {
                nativeNavigationTemplate.updateTravelEstimates([
                    destinationStep,
                ]);
            }

            nativeNavigationTemplate.updateManeuvers(
                routingManeuvers.length ? routingManeuvers : maneuver,
            );
        } catch (error) {
            setAutoPlayState({
                errorText:
                    error?.message ||
                    'Navigation guidance could not be updated.',
                statusLabel: 'Navigation error',
            });
            return;
        }
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

    const distanceToDestinationMeters = getAutoPlayDestinationDistanceMeters(
        userLocation,
        destinationCoordinate,
    );
    const arrivedAtDestination =
        !autoDriveIsEnabled &&
        autoPlayArrivalDetector.recordLocation({
            distanceToDestinationMeters,
            routeDistanceRemainingMeters: distanceRemaining,
            routeGeneration,
        });

    if (arrivedAtDestination) {
        void stopAutoPlayNavigation({
            completionState: {
                detailText: `Arrived at ${destinationName}.`,
                statusLabel: 'Arrived',
            },
            expectedRouteGeneration: routeGeneration,
        });
    }
}

function clearScheduledNavigationGuidance() {
    if (pendingNavigationGuidanceTimer !== null) {
        clearTimeout(pendingNavigationGuidanceTimer);
        pendingNavigationGuidanceTimer = null;
    }

    pendingNavigationGuidanceLocation = null;
    navigationGuidanceIsDeferredDuringPanning = false;
    deferredNavigationGuidanceLocation = null;
}

function scheduleNavigationGuidance(userLocation) {
    updateSharedNavigationLocation(userLocation);
    pendingNavigationGuidanceLocation = userLocation;

    const elapsedSinceLastUpdate = Date.now() - lastNavigationGuidanceUpdatedAt;

    if (elapsedSinceLastUpdate >= NAVIGATION_GUIDANCE_MIN_INTERVAL_MS) {
        const nextLocation = pendingNavigationGuidanceLocation;

        clearScheduledNavigationGuidance();
        updateNavigationGuidance(nextLocation);
        return;
    }

    if (pendingNavigationGuidanceTimer !== null) {
        return;
    }

    pendingNavigationGuidanceTimer = setTimeout(() => {
        const nextLocation = pendingNavigationGuidanceLocation;

        pendingNavigationGuidanceTimer = null;
        pendingNavigationGuidanceLocation = null;
        updateNavigationGuidance(nextLocation);
    }, NAVIGATION_GUIDANCE_MIN_INTERVAL_MS - elapsedSinceLastUpdate);
}

async function removeNavigationLocationSubscription(subscription) {
    if (!subscription) {
        return;
    }

    await Promise.resolve(subscription.remove()).catch(() => {});
}

async function stopNavigationLocationUpdates() {
    navigationLocationUpdateGeneration += 1;
    clearScheduledNavigationGuidance();

    const subscription = navigationLocationSubscription;

    navigationLocationSubscription = null;
    await removeNavigationLocationSubscription(subscription);
}

async function startExpoNavigationLocationUpdates(generation) {
    const subscription = await Location.watchPositionAsync(
        {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: NAVIGATION_LOCATION_DISTANCE_METERS,
            timeInterval: NAVIGATION_LOCATION_INTERVAL_MS,
        },
        (position) => {
            if (generation !== navigationLocationUpdateGeneration) {
                return;
            }

            const location = getLocationFromPosition(position);

            if (location) {
                scheduleNavigationGuidance(location);
            }
        },
    ).catch(() => null);

    return {
        lastKnownLocation: await getLastKnownLocation(),
        subscription,
    };
}

async function startRoadMatchedNavigationLocationUpdates(generation) {
    const locationSubscription = addRoadMatchedLocationListener((location) => {
        if (generation !== navigationLocationUpdateGeneration) {
            return;
        }

        const navigationLocation = getLocationFromPosition(location);

        if (navigationLocation) {
            scheduleNavigationGuidance(navigationLocation);
        }
    });
    const sessionHandle = await retainRoadMatchingSessionAsync({
        persistent: true,
    });
    const subscription = {
        remove() {
            locationSubscription.remove();
            sessionHandle.remove();
        },
    };

    const lastRoadMatchedLocation =
        await getLastRoadMatchedLocationAsync().catch(() => null);

    return {
        lastKnownLocation: getLocationFromPosition(lastRoadMatchedLocation),
        subscription,
    };
}

async function startNavigationLocationUpdates(route) {
    clearScheduledNavigationGuidance();

    const generation = navigationLocationUpdateGeneration + 1;
    const previousSubscription = navigationLocationSubscription;

    navigationLocationUpdateGeneration = generation;
    navigationLocationSubscription = null;
    await removeNavigationLocationSubscription(previousSubscription);

    if (generation !== navigationLocationUpdateGeneration) {
        return;
    }

    if (!(await getLocationPermissionIsGranted())) {
        return;
    }

    if (generation !== navigationLocationUpdateGeneration) {
        return;
    }

    const startedLocationUpdates = roadMatchingLocationIsSupported()
        ? await startRoadMatchedNavigationLocationUpdates(generation)
        : await startExpoNavigationLocationUpdates(generation);

    if (generation !== navigationLocationUpdateGeneration) {
        await removeNavigationLocationSubscription(
            startedLocationUpdates.subscription,
        );
        return;
    }

    navigationLocationSubscription = startedLocationUpdates.subscription;
    const { lastKnownLocation } = startedLocationUpdates;

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

    if (rootMapPanningInterfaceIsVisible) {
        rootMapHeaderActionsRefreshIsDeferred = true;
        return;
    }

    if (autoPlayPlatform?.autoHidesNavigationHeader === true) {
        rootMapTemplate
            .setHideControls(activeNavigationRoute ? 'header' : 'none')
            .catch(() => {});
    }

    scheduleTemplateUpdate({ headerActions: true });
}

function updateRootMapButtons() {
    if (!rootMapTemplate || !rootMapTemplateIsReady) {
        return;
    }

    if (rootMapPanningInterfaceIsVisible) {
        rootMapButtonsRefreshIsDeferred = true;
        return;
    }

    scheduleTemplateUpdate({ mapButtons: true });
}

function updateRootMapButtonAppearance(appearance) {
    const nextAppearance = {
        ...ROOT_MAP_BUTTON_APPEARANCE_DEFAULTS,
        ...appearance,
    };
    const nextAppearanceKey = getAutoPlayMapButtonAppearanceKey(nextAppearance);

    const darkMapLayerChanged =
        nextAppearance.isDarkMapLayer !==
        rootMapButtonAppearance.isDarkMapLayer;
    const mapLightPresetChanged =
        nextAppearance.mapLightPreset !==
        rootMapButtonAppearance.mapLightPreset;
    const drivingMapViewModeChanged =
        nextAppearance.drivingMapViewMode !==
        rootMapButtonAppearance.drivingMapViewMode;
    const compassNorthDirectionChanged =
        nextAppearance.compassNorthDirection !==
        rootMapButtonAppearance.compassNorthDirection;
    rootMapButtonAppearance = nextAppearance;

    if (mapLightPresetChanged && nextAppearance.mapLightPreset) {
        logAutoPlayPlatformAction(
            `map-preset-${nextAppearance.mapLightPreset}`,
        );
    }

    const mapButtonAppearanceChanged =
        nextAppearanceKey !== rootMapButtonAppearanceKey;

    const drivingMapViewButtonIsVisible = Boolean(
        autoPlayPlatform?.usesDrivingMapViewButtonForDebugging === true,
    );
    const perspectiveCompassButtonIsVisible = Boolean(
        drivingMapViewButtonIsVisible &&
        (!activeNavigationRoute ||
            nextAppearance.drivingMapViewMode === DRIVING_MAP_VIEW_PERSPECTIVE),
    );

    if (
        !mapButtonAppearanceChanged &&
        !drivingMapViewModeChanged &&
        !(compassNorthDirectionChanged && perspectiveCompassButtonIsVisible)
    ) {
        return;
    }

    if (mapButtonAppearanceChanged) {
        rootMapButtonAppearanceKey = nextAppearanceKey;
    }

    if (!rootMapTemplate || !rootMapTemplateIsReady) {
        return;
    }

    if (
        mapButtonAppearanceChanged ||
        drivingMapViewModeChanged ||
        (compassNorthDirectionChanged && perspectiveCompassButtonIsVisible)
    ) {
        updateRootMapButtons();
    }

    if (drivingMapViewModeChanged) {
        updateRootTemplateHeaderActions();
    }

    if (darkMapLayerChanged && activeNavigationRoute) {
        // Maneuver card colors are baked in when updateManeuvers runs, so a
        // light preset flip mid-navigation needs a guidance refresh to repaint.
        updateNavigationGuidance(lastNavigationGuidanceLocation);
    }
}

function handleRootMapPanningInterfaceChanged(isPanningInterfaceVisible) {
    rootMapPanningInterfaceIsVisible = Boolean(isPanningInterfaceVisible);

    if (autoPlayPlatform?.usesPanZoomControlsOnly === true) {
        if (rootMapPanningInterfaceIsVisible) {
            rootMapTemplate?.setMapButtons(getRootMapButtons()).catch(() => {});
        } else {
            lastAppliedMapButtonsKey = null;
            rootMapButtonsRefreshIsDeferred = true;
        }
    }

    if (rootMapPanningInterfaceIsVisible) {
        return;
    }

    const mapButtonsRefreshIsDeferred = rootMapButtonsRefreshIsDeferred;
    const headerActionsRefreshIsDeferred =
        rootMapHeaderActionsRefreshIsDeferred;
    const guidanceWasDeferred = navigationGuidanceIsDeferredDuringPanning;
    const guidanceLocation = deferredNavigationGuidanceLocation;
    rootMapButtonsRefreshIsDeferred = false;
    rootMapHeaderActionsRefreshIsDeferred = false;

    navigationGuidanceIsDeferredDuringPanning = false;
    deferredNavigationGuidanceLocation = null;

    if (guidanceWasDeferred) {
        updateNavigationGuidance(guidanceLocation);
    }

    if (!mapButtonsRefreshIsDeferred && !headerActionsRefreshIsDeferred) {
        return;
    }

    scheduleTemplateUpdate({
        headerActions: headerActionsRefreshIsDeferred,
        mapButtons: mapButtonsRefreshIsDeferred,
    });
}

function getAutoPlayDrivingModeIsActive() {
    return getAutoPlayState().drivingModeIsActive !== false;
}

function getRootMapPanButtonImage() {
    return {
        ...makeButtonGlyphImage('arrows', {
            color: getRootMapButtonDefaultIconColor(),
        }),
        fontScale: 0.78,
    };
}

function getRootMapZoomInButtonImage() {
    return {
        ...makeButtonGlyphImage('plus', {
            color: getRootMapButtonDefaultIconColor(),
        }),
        ...ROOT_MAP_CONTROL_BUTTON_IMAGE,
    };
}

function getRootMapZoomOutButtonImage() {
    return {
        ...makeButtonGlyphImage('minus', {
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
        ...makeButtonGlyphImage('crosshairs', {
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
        ...makeButtonGlyphImage('xmark', {
            backgroundColor: ROOT_MAP_BUTTON_EXIT_BACKGROUND_COLOR,
            color: ROOT_MAP_BUTTON_EXIT_ICON_COLOR,
        }),
        fontScale: 0.74,
    };
}

function getRootHeaderDrivingMapViewButtonImage() {
    const routeOverviewIsActive =
        Boolean(activeNavigationRoute) &&
        rootMapButtonAppearance.drivingMapViewMode ===
            DRIVING_MAP_VIEW_ROUTE_OVERVIEW;

    if (
        !routeOverviewIsActive &&
        autoPlayPlatform?.usesDrivingMapViewButtonForDebugging === true
    ) {
        return {
            color: autoPlayPlatform?.buttonIconColor,
            image: getAutoPlayCompassNeedleImage(
                rootMapButtonAppearance.compassNorthDirection,
                rootMapButtonAppearance.isDarkMapLayer,
            ),
            type: 'asset',
        };
    }

    return {
        ...makeButtonGlyphImage(
            routeOverviewIsActive ? 'map' : 'location-arrow',
            {
                backgroundColor: 'transparent',
                color: routeOverviewIsActive
                    ? ROOT_MAP_BUTTON_ACTIVE_ICON_COLOR
                    : AUTO_PLAY_GLYPH_COLOR,
            },
        ),
        fontScale: 0.7,
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
    const showsDrivingMapViewButton = Boolean(
        autoPlayPlatform?.usesDrivingMapViewButtonForDebugging === true,
    );
    const effectiveDrivingMapViewMode = activeNavigationRoute
        ? rootMapButtonAppearance.drivingMapViewMode
        : DRIVING_MAP_VIEW_PERSPECTIVE;
    const routeOverviewIsActive =
        effectiveDrivingMapViewMode === DRIVING_MAP_VIEW_ROUTE_OVERVIEW;
    const drivingMapViewModeKey = showsDrivingMapViewButton
        ? effectiveDrivingMapViewMode
        : 'hidden';
    const compassNorthDirectionKey =
        showsDrivingMapViewButton &&
        effectiveDrivingMapViewMode === DRIVING_MAP_VIEW_PERSPECTIVE
            ? rootMapButtonAppearance.compassNorthDirection
            : 'hidden';
    const usesPanZoomControlsOnly =
        autoPlayPlatform?.usesPanZoomControlsOnly === true;
    const panZoomIsVisible =
        usesPanZoomControlsOnly && rootMapPanningInterfaceIsVisible;
    const rootMapButtonsKey = `${rootMapButtonAppearanceKey}:${showsDrivingMapViewButton ? 'driving-map-view' : 'pan'}:${drivingMapViewModeKey}:${compassNorthDirectionKey}:${panZoomIsVisible}:${routeOverviewIsActive}:${autoPlaySearchWorkflowIsActive}:${routePreviewIsVisible}`;

    // Memoize the rendered appearance so identical arrays are reused. Every
    // fresh array forces the native side to re-parse images and rebuild the
    // ActionStrip.
    if (cachedRootMapButtons && cachedRootMapButtonsKey === rootMapButtonsKey) {
        return cachedRootMapButtons;
    }

    const { Flag } = loadAutoPlayModule();

    const mapViewButton = showsDrivingMapViewButton
        ? {
              flags: Flag.Persistent,
              image: getRootHeaderDrivingMapViewButtonImage(),
              onPress: handleRootHeaderDrivingMapViewPress,
              type: 'custom',
          }
        : {
              flags: Flag.Persistent,
              image: getRootMapPanButtonImage(),
              type: 'pan',
          };
    const zoomInButton = {
        image: getRootMapZoomInButtonImage(),
        onPress: handleRootZoomInPress,
        type: 'custom',
    };
    const zoomOutButton = {
        image: getRootMapZoomOutButtonImage(),
        onPress: handleRootZoomOutPress,
        type: 'custom',
    };
    const recenterButtons =
        !routeOverviewIsActive &&
        rootMapButtonAppearance.trackingState !== 'active'
            ? [
                  {
                      flags: Flag.Persistent,
                      image: getRootMapTrackingButtonImage(),
                      onPress: handleRootTrackingPress,
                      type: 'custom',
                  },
              ]
            : [];

    // CarPlay's pan interface has room for two buttons. Keep zoom there only.
    cachedRootMapButtons = usesPanZoomControlsOnly
        ? routeOverviewIsActive
            ? []
            : panZoomIsVisible
              ? [zoomInButton, zoomOutButton]
              : [mapViewButton, ...recenterButtons]
        : showsDrivingMapViewButton
          ? [zoomInButton, zoomOutButton, mapViewButton, ...recenterButtons]
          : [
                ...(routeOverviewIsActive ? [] : [mapViewButton]),
                zoomInButton,
                zoomOutButton,
                ...recenterButtons,
            ];
    if (autoPlaySearchWorkflowIsActive || routePreviewIsVisible) {
        cachedRootMapButtons = cachedRootMapButtons.filter(
            ({ type }) => type !== 'pan',
        );
    }
    cachedRootMapButtonsKey = rootMapButtonsKey;
    return cachedRootMapButtons;
}

let lastDeferredSharedNavigationStartKey = null;

function syncAutoPlayNavigationFromSharedRoutingState(
    routingState = getSharedRoutingState(),
) {
    if (!rootMapTemplate) {
        return;
    }

    const navigationAction = getAutoPlaySharedNavigationAction({
        activeNavigationRoute,
        getRouteSyncKey: getDirectionsRouteGeometrySyncKey,
        hostNavigationIsActive: autoPlayHostNavigationIsActive,
        rootMapTemplateIsReady,
        routingState,
    });

    if (
        !rootMapTemplateIsReady &&
        routingState?.drivingModeIsActive &&
        routingState?.directionsRoute
    ) {
        // The shared state wants navigation but the root template has not
        // finished settling, so the start is silently deferred. Record each
        // distinct deferred route once instead of on every publish.
        const deferredStartKey = getDirectionsRouteGeometrySyncKey(
            routingState.directionsRoute,
        );

        if (deferredStartKey !== lastDeferredSharedNavigationStartKey) {
            lastDeferredSharedNavigationStartKey = deferredStartKey;
            logAutoPlayPlatformAction('shared-navigation-start-deferred', {
                routeKey: deferredStartKey,
            });
        }

        return;
    }

    lastDeferredSharedNavigationStartKey = null;

    if (navigationAction.action === 'start') {
        startAutoPlayNavigation(navigationAction.route, {
            publishSharedState: false,
        });
        return;
    }

    if (navigationAction.action === 'stop') {
        stopAutoPlayNavigation({ publishSharedState: false });
    }
}

function startAutoDriveNavigationSimulation(
    route,
    routeGeneration = navigationRouteGeneration,
) {
    const routeOption = getSelectedDirectionsRouteOption(route);
    let simulatedLocationCount = 0;
    const simulationStarted = startAutoDriveSimulation({
        coordinates: routeOption?.coordinates,
        onArrive: () => {
            handleAutoDriveArrival(route, routeGeneration);
        },
        onLocation: (position) => {
            if (routeGeneration !== navigationRouteGeneration) {
                return;
            }

            simulatedLocationCount += 1;
            publishAcceptedDeviceLocation(position);
            const location = getLocationFromPosition(position);

            if (location) {
                scheduleNavigationGuidance(location);
            }

            if (simulatedLocationCount === 2) {
                logAutoPlayPlatformAction('auto-drive-progressed');
            }
        },
    });

    if (!simulationStarted) {
        return startNavigationLocationUpdates(route);
    }

    void stopNavigationLocationUpdates();

    return null;
}

async function handleAutoDriveArrival(route, routeGeneration) {
    const destinationName =
        route.destination?.label ||
        route.destination?.inputValue ||
        'destination';

    await stopAutoPlayNavigation({
        completionState: {
            detailText: `Simulated drive arrived at ${destinationName}.`,
            statusLabel: 'Arrived',
        },
        expectedRouteGeneration: routeGeneration,
    });
}

function handleAutoDriveEnabled() {
    logAutoPlayPlatformAction('auto-drive-enabled', {
        hasActiveNavigation: Boolean(activeNavigationRoute),
    });
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

function stopNativeAutoPlayNavigation(mapTemplate) {
    try {
        mapTemplate.stopNavigation();
    } catch {
        // Starting the native session may have failed before there was anything
        // for the host to stop, or the host may already have ended it.
    }
}

async function stopAutoPlayNavigation({
    completionState = null,
    expectedRouteGeneration = null,
    notifyTemplate = true,
    publishSharedState = true,
} = {}) {
    if (
        expectedRouteGeneration !== null &&
        expectedRouteGeneration !== navigationRouteGeneration
    ) {
        return false;
    }

    navigationRouteGeneration += 1;
    autoPlayArrivalDetector.reset();
    cancelAutoPlaySearchWork();
    stopAutoDriveSimulation();
    const locationUpdatesStopped = stopNavigationLocationUpdates();
    autoPlayHostNavigationIsActive = false;
    activeNavigationRoute = null;
    navigationProgressTracker.reset();
    activeNavigationDestination = null;
    routePreviewIsVisible = false;
    lastNavigationGuidanceLocation = null;
    latestNavigationGuidanceRecordedAt = null;

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
        ...completionState,
    });
    updateRootMapButtons();
    updateRootTemplateHeaderActions();
    await locationUpdatesStopped;

    return true;
}

function setActiveAutoPlayNavigationState(route, selectedRoute) {
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
    updateRootMapButtons();
    updateRootTemplateHeaderActions();
}

async function startAutoPlayNavigation(
    route,
    { hostNavigationAlreadyStarted = false, publishSharedState = true } = {},
) {
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

    logAutoPlayPlatformAction('navigation-start-requested', {
        destinationLabel: route.destination?.label || 'Destination',
        hostNavigationAlreadyStarted,
        routeKey: selectedRoute.routeKey,
    });

    cancelAutoPlaySearchWork();
    clearAutoPlaySubmittedSearchResults();
    const routeGeneration = ++navigationRouteGeneration;
    autoPlayArrivalDetector.beginRoute(routeGeneration);
    activeNavigationRoute = route;
    activeNavigationDestination = route.destination;
    let nativeNavigationMayBeActive = hostNavigationAlreadyStarted;

    const rollbackNavigationStart = (error, startupGeneration = null) => {
        if (
            activeNavigationRoute !== route ||
            routeGeneration !== navigationRouteGeneration ||
            (startupGeneration !== null &&
                startupGeneration !== navigationLocationUpdateGeneration)
        ) {
            return;
        }

        if (nativeNavigationMayBeActive) {
            stopNativeAutoPlayNavigation(rootMapTemplate);
        }

        void stopAutoPlayNavigation({
            notifyTemplate: false,
            publishSharedState,
        });
        showAutoPlayError(
            'Navigation unavailable',
            error?.message || 'Navigation could not be started.',
        );
    };

    try {
        if (!hostNavigationAlreadyStarted) {
            hideAutoPlayRoutePreview();
            const tripConfig = makeTripConfig(route);
            nativeNavigationMayBeActive = true;
            await rootMapTemplate.startNavigation(tripConfig);

            if (
                activeNavigationRoute !== route ||
                routeGeneration !== navigationRouteGeneration ||
                !rootMapTemplateIsReady
            ) {
                return;
            }
        } else {
            routePreviewIsVisible = false;
        }

        autoPlayHostNavigationIsActive = true;

        if (publishSharedState) {
            setSharedRoutingState({
                directionsRoute: route,
                drivingModeIsActive: true,
            });
        }

        updateNavigationGuidance(null);

        const navigationLocationStartup = autoDriveIsEnabled
            ? startAutoDriveNavigationSimulation(route)
            : startNavigationLocationUpdates(route);

        if (navigationLocationStartup) {
            const startupGeneration = navigationLocationUpdateGeneration;

            void navigationLocationStartup.catch((error) => {
                rollbackNavigationStart(error, startupGeneration);
            });
        }

        HybridAutoPlay.popToRootTemplate(false).catch(() => {});

        setActiveAutoPlayNavigationState(route, selectedRoute);
    } catch (error) {
        rollbackNavigationStart(error);
    }
}

function handleAutoPlayDashboardAction(action) {
    pendingDashboardAction = action;
    replayPendingDashboardAction();
}

async function popToAutoPlayRootTemplate() {
    try {
        await loadAutoPlayModule().HybridAutoPlay.popToRootTemplate(false);
    } catch (error) {
        if (
            !rootMapTemplateIsReady ||
            !String(error?.message ?? error).includes(
                'No templates were available to be popped.',
            )
        ) {
            throw error;
        }
    }
}

function replayPendingDashboardAction() {
    if (
        !rootMapTemplate ||
        !rootMapTemplateIsReady ||
        !pendingDashboardAction
    ) {
        return;
    }

    const action = pendingDashboardAction;
    pendingDashboardAction = null;
    const connectionGeneration = autoPlayConnectionGeneration;
    const mapTemplate = rootMapTemplate;

    popToAutoPlayRootTemplate()
        .then(() => {
            if (
                connectionGeneration !== autoPlayConnectionGeneration ||
                rootMapTemplate !== mapTemplate ||
                !rootMapTemplateIsReady
            ) {
                return;
            }

            if (action === 'search') {
                handleRootHeaderSearchPress();
            } else {
                handleRootHeaderPrimaryLocationPress(action);
            }
        })
        .catch((error) => {
            logAutoPlayPlatformAction('dashboard-action-failed', {
                action,
                message:
                    error?.message ||
                    'The dashboard action could not be opened.',
            });
        });
}

function handleRootHeaderPrimaryLocationPress(type) {
    if (!rootMapTemplate || !rootMapTemplateIsReady) {
        return;
    }

    const destinationWaypoint = createPrimaryLocationDirectionsWaypoint(
        type,
        autoPlayPrimaryLocations[type],
    );

    if (!destinationWaypoint) {
        return;
    }

    logAutoPlayPlatformAction('primary-location-selected', {
        destinationLabel: destinationWaypoint.label,
        type,
    });
    handleSearchResultSelected({
        ...destinationWaypoint.result,
        place: destinationWaypoint.place,
    });
}

const handleRootHeaderSearchPress = () => {
    if (autoPlayPlatform?.opensSavedDestinationsBeforeSearch === true) {
        openSavedDestinationsTemplate();
        return;
    }

    openSearchTemplate();
};
const handleRootHeaderVoiceSearchPress = () => {
    if (
        autoPlayPlatform?.startSearchVoiceInput?.({
            onCancelled: () => {
                showAutoPlayError(
                    'Voice search cancelled',
                    'Voice search ended without a destination. Tap the microphone to try again, or Search to use the keyboard.',
                );
            },
            onFallback: () => {
                handleRootHeaderSearchPress();
            },
            onNoMatch: () => {
                showAutoPlayError(
                    'Voice search',
                    'No destination was heard. Tap the microphone to try again, or Search to use the keyboard.',
                );
            },
            onUnavailable: () => {
                showAutoPlayError(
                    'Voice search unavailable',
                    'Voice search could not start. Check Microphone and Speech Recognition access on your iPhone, then tap the microphone to try again or Search to use the keyboard.',
                );
            },
        }) === true
    ) {
        return;
    }

    openSearchTemplate();
};
const handleRootHeaderDrivingMapViewPress = () => {
    getAutoPlayMapControlHandlers().handleDrivingMapViewPress();
};
const handleRootHeaderExitNavigationPress = () => {
    stopAutoPlayNavigation();
};
const ROOT_HEADER_SEARCH_IMAGE = makeButtonGlyphImage('search', {
    backgroundColor: 'transparent',
});
const ROOT_HEADER_ROUTE_STEPS_IMAGE = makeButtonGlyphImage('list-ul', {
    backgroundColor: 'transparent',
});
const ROOT_HEADER_MAP_OPTIONS_IMAGE = makeButtonGlyphImage('sliders', {
    backgroundColor: 'transparent',
});
const ROOT_HEADER_PRIMARY_LOCATION_IMAGES = {
    home: makeButtonGlyphImage('house', { backgroundColor: 'transparent' }),
    work: makeButtonGlyphImage('briefcase', { backgroundColor: 'transparent' }),
};

function makeRootHeaderPrimaryLocationButton(type, { iconOnly = false } = {}) {
    const onPress = () => {
        handleRootHeaderPrimaryLocationPress(type);
    };

    if (iconOnly) {
        return {
            image: ROOT_HEADER_PRIMARY_LOCATION_IMAGES[type],
            onPress,
            type: 'image',
        };
    }

    return {
        onPress,
        title: getPrimaryLocationLabel(type),
        type: 'text',
    };
}

let cachedRootMapHeaderActions = null;
let cachedRootMapHeaderActionsKey = '';

function getRootMapHeaderActions() {
    const hasActiveNavigation = Boolean(activeNavigationRoute);
    const drivingMapViewModeKey = hasActiveNavigation
        ? rootMapButtonAppearance.drivingMapViewMode
        : 'hidden';
    const { navigationExitButtonIsVisible, trailingNavigationButtonIsVisible } =
        getAutoPlayHeaderButtonVisibility({
            hasActiveNavigation,
            usesHeaderExitNavigationButton:
                autoPlayPlatform?.usesHeaderExitNavigationButton === true,
        });
    const primaryLocationHeaderActionTypes =
        getAutoPlayPrimaryLocationHeaderActionTypes({
            hasActiveNavigation,
            primaryLocations: autoPlayPrimaryLocations,
        });
    const primaryLocationTypes = primaryLocationHeaderActionTypes.android;
    const rootMapHeaderActionsKey = `${drivingMapViewModeKey}:${navigationExitButtonIsVisible ? 'navigating' : 'ready'}:${trailingNavigationButtonIsVisible ? 'trailing' : 'search-only'}:${primaryLocationTypes.join(':')}`;

    if (
        cachedRootMapHeaderActions &&
        cachedRootMapHeaderActionsKey === rootMapHeaderActionsKey
    ) {
        return cachedRootMapHeaderActions;
    }

    const { Flag } = loadAutoPlayModule();
    const searchButton = {
        image: ROOT_HEADER_SEARCH_IMAGE,
        onPress: handleRootHeaderSearchPress,
        type: 'image',
    };
    const routeStepsButton = hasActiveNavigation
        ? {
              image: ROOT_HEADER_ROUTE_STEPS_IMAGE,
              onPress: openRouteStepsTemplate,
              type: 'image',
          }
        : null;
    const mapOptionsButton = {
        image: ROOT_HEADER_MAP_OPTIONS_IMAGE,
        onPress: openMapOptionsTemplate,
        type: 'image',
    };
    const drivingMapViewButton = hasActiveNavigation
        ? {
              image: getRootHeaderDrivingMapViewButtonImage(),
              onPress: handleRootHeaderDrivingMapViewPress,
              type: 'image',
          }
        : null;
    const trailingNavigationButton = trailingNavigationButtonIsVisible
        ? {
              image: getRootHeaderExitNavigationButtonImage(),
              onPress: handleRootHeaderExitNavigationPress,
              type: 'image',
          }
        : null;
    const androidPrimaryLocationButtons =
        primaryLocationHeaderActionTypes.android.map((type) =>
            makeRootHeaderPrimaryLocationButton(type, { iconOnly: true }),
        );

    cachedRootMapHeaderActions = {
        android: [
            searchButton,
            ...androidPrimaryLocationButtons,
            ...(routeStepsButton ? [routeStepsButton] : []),
            mapOptionsButton,
        ].map((button) => ({
            ...button,
            flags: (button.flags ?? 0) | Flag.Persistent,
        })),
        ios: {
            // Auto Play's native parser reverses the leading group.
            leadingNavigationBarButtons: hasActiveNavigation
                ? [mapOptionsButton, trailingNavigationButton].filter(Boolean)
                : [mapOptionsButton, searchButton],
            trailingNavigationBarButtons: hasActiveNavigation
                ? [drivingMapViewButton, routeStepsButton]
                : androidPrimaryLocationButtons,
        },
    };
    cachedRootMapHeaderActionsKey = rootMapHeaderActionsKey;
    return cachedRootMapHeaderActions;
}

function showAutoPlayError(title, message) {
    const autoPlayModule = loadAutoPlayModule();
    const searchAction = {
        onPress: handleRootHeaderSearchPress,
        title: 'Search',
        type: 'text',
    };
    const errorTemplate = autoPlayPlatform.createErrorTemplate({
        alertMessage: makeAutoText(`${title}\n${message}`),
        autoPlayModule,
        headerActions: getBackHeaderAction(),
        message: makeAutoText(message),
        searchAction,
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

function autoPlayVoiceRequestIsCurrent(
    connectionGeneration,
    mapTemplate,
    requestGeneration,
) {
    return (
        connectionGeneration === autoPlayConnectionGeneration &&
        requestGeneration === voiceNavigationRequestGeneration &&
        rootMapTemplateIsReady &&
        rootMapTemplate === mapTemplate
    );
}

async function dismissSupersededVoiceSearchTemplate(requestGeneration) {
    const pendingSearch = pendingVoiceSearchTemplatePush;

    if (
        !pendingSearch ||
        pendingSearch.requestGeneration === requestGeneration
    ) {
        return;
    }

    if (!pendingSearch.cleanupPromise) {
        pendingSearch.cleanupPromise = (async () => {
            await pendingSearch.pushPromise.catch(() => {});
            await pendingSearch.waitForResultTemplatePushes?.();

            if (!pendingSearch.wasPushed()) {
                return;
            }

            const poppedToSearchTemplate = await (
                pendingSearch.getTemplate?.() ?? pendingSearch.template
            )
                .popTo()
                .then(
                    () => true,
                    () => false,
                );

            if (!poppedToSearchTemplate) {
                return;
            }

            const { HybridAutoPlay } = loadAutoPlayModule();
            await HybridAutoPlay.popTemplate(false).catch(() => {});
        })().finally(() => {
            if (pendingVoiceSearchTemplatePush === pendingSearch) {
                pendingVoiceSearchTemplatePush = null;
            }
        });
    }

    await pendingSearch.cleanupPromise;
}

async function handleVoiceNavigation(
    coordinates,
    query,
    requestType,
    connectionGeneration,
    mapTemplate,
    requestGeneration,
) {
    const requestIsCurrent = () =>
        autoPlayVoiceRequestIsCurrent(
            connectionGeneration,
            mapTemplate,
            requestGeneration,
        );

    await dismissSupersededVoiceSearchTemplate(requestGeneration);

    if (!requestIsCurrent()) {
        return;
    }

    const searchQuery = String(query ?? '').trim();
    const destinationLocation = getAutoPlayLocation(coordinates);
    const resolvedRequestType = resolveAutoPlayVoiceRequestType({
        hasDestinationCoordinates: Boolean(destinationLocation),
        requestType,
    });
    logAutoPlayPlatformAction('voice-request-classified', {
        hasDestinationCoordinates: Boolean(destinationLocation),
        requestType: requestType ?? null,
        query: searchQuery,
        resolvedRequestType,
    });

    if (resolvedRequestType === 'search') {
        const voiceSearchOptions = {
            requestIsCurrent,
        };
        pendingVoiceSearchTemplatePush = {
            ...openVoiceSearchResultsTemplate(
                searchQuery,
                destinationLocation,
                voiceSearchOptions,
            ),
            requestGeneration,
        };
        return;
    }

    if (!destinationLocation && !searchQuery) {
        handleRootHeaderSearchPress();
        return;
    }

    const routeLoadingRequestId = beginAutoPlayRouteLoading(
        searchQuery || 'Voice destination',
    );
    let voiceSearchController = null;

    try {
        if (destinationLocation) {
            const destinationLabel = searchQuery || 'Voice destination';
            const destinationId = `voice-${destinationLocation.latitude}-${destinationLocation.longitude}`;

            await handleSearchResultSelected(
                {
                    id: destinationId,
                    label: destinationLabel,
                    place: {
                        displayName: { text: destinationLabel },
                        id: destinationId,
                        location: destinationLocation,
                    },
                    primaryText: destinationLabel,
                    secondaryText: '',
                },
                {
                    routeLoadingRequestId,
                    startNavigationImmediately:
                        resolvedRequestType === 'navigation',
                },
            );
            return;
        }

        setAutoPlayState({
            detailText: `Searching for ${searchQuery}.`,
            errorText: '',
            statusLabel: 'Voice search',
            title: 'Destination',
        });

        voiceSearchController = new AbortController();
        searchAbortController = voiceSearchController;

        const startLocation = await getAutoPlaySearchLocation();

        if (
            !requestIsCurrent() ||
            !autoPlaySearchRequestIsCurrent(
                searchAbortController,
                voiceSearchController,
            )
        ) {
            return;
        }

        const results = await searchTextPlaces({
            location: startLocation,
            signal: voiceSearchController.signal,
            textQuery: searchQuery,
        });

        if (
            !requestIsCurrent() ||
            !autoPlaySearchRequestIsCurrent(
                searchAbortController,
                voiceSearchController,
            )
        ) {
            return;
        }

        logAutoPlayPlatformAction('voice-destination-search-completed', {
            query: searchQuery,
            resultCount: results.length,
        });

        if (!results.length) {
            throw new Error(`No places found for "${searchQuery}".`);
        }

        await handleSearchResultSelected(results[0], {
            preferredStartLocation: startLocation,
            routeLoadingRequestId,
            startNavigationImmediately: resolvedRequestType === 'navigation',
        });
    } catch (error) {
        if (
            error?.name === 'AbortError' ||
            !requestIsCurrent() ||
            !autoPlaySearchRequestIsCurrent(
                searchAbortController,
                voiceSearchController,
            )
        ) {
            return;
        }

        showAutoPlayError(
            'Voice search unavailable',
            error?.message || 'Voice search failed.',
        );
    } finally {
        if (searchAbortController === voiceSearchController) {
            searchAbortController = null;
        }
        finishAutoPlayRouteLoading(routeLoadingRequestId);
    }
}

function handleVoiceNavigationWhenReady(
    coordinates,
    query,
    requestType,
    { isReplay = false } = {},
) {
    logAutoPlayPlatformAction(
        isReplay ? 'voice-request-replayed' : 'voice-request-received',
        {
            coordinates: coordinates ?? null,
            query: query ?? null,
            requestType: requestType ?? null,
        },
    );
    voiceNavigationRequestGeneration += 1;
    const requestGeneration = voiceNavigationRequestGeneration;

    cancelAutoPlaySearchWork();

    routePreviewRequestSequence += 1;

    const routePreviewState = getAutoPlayState();

    if (
        routePreviewIsVisible ||
        (!routePreviewState.isNavigating && routePreviewState.directionsRoute)
    ) {
        hideAutoPlayRoutePreview();
        clearAutoPlayRoutePreviewState();
    }

    if (!rootMapTemplateIsReady) {
        pendingVoiceNavigation = {
            coordinates,
            query,
            requestType,
        };
        return;
    }

    const connectionGeneration = autoPlayConnectionGeneration;
    const mapTemplate = rootMapTemplate;

    handleVoiceNavigation(
        coordinates,
        query,
        requestType,
        connectionGeneration,
        mapTemplate,
        requestGeneration,
    ).catch((error) => {
        logAutoPlayPlatformAction('voice-request-failed', {
            message: error?.message || 'Unknown error',
            requestGeneration,
            requestType: requestType ?? null,
        });

        if (
            autoPlayVoiceRequestIsCurrent(
                connectionGeneration,
                mapTemplate,
                requestGeneration,
            )
        ) {
            showAutoPlayError(
                'Voice search unavailable',
                error?.message || 'Voice search failed.',
            );
        }
    });
}

export function dispatchAutoPlayE2ECommand({ query, requestType } = {}) {
    if (
        e2eMapApiMocksCanBeEnabled() &&
        ['carplay', 'android-auto'].includes(requestType)
    ) {
        return require('./map/carplay-e2e-fixture').runCarPlayE2ECommand(
            query,
            () => {
                const state = getAutoPlayState();
                const preferences = getSharedMapPreferencesState();
                return {
                    trackingState: rootMapButtonAppearance.trackingState,
                    submittedSearchPinCount:
                        state.submittedSearchResults?.length ?? 0,
                    panControlVisible: getRootMapButtons().some(
                        (button) => button.type === 'pan',
                    ),
                    recenterControlVisible: getRootMapButtons().some(
                        (button) => button.onPress === handleRootTrackingPress,
                    ),
                    mapLayer: MAP_LAYER_STYLES.find(
                        (layer) => layer.styleURL === preferences.mapStyleURL,
                    )?.key,
                    mapLightPresetPreference:
                        preferences.mapLightPresetPreference,
                    appliedMapLightPreset:
                        rootMapButtonAppearance.mapLightPreset,
                    drivingMapViewMode: state.drivingMapViewMode,
                    home: Boolean(autoPlayPrimaryLocations.home),
                    work: Boolean(autoPlayPrimaryLocations.work),
                    previewVisible: routePreviewIsVisible,
                    routeChoiceCount: getDirectionsRouteOptions(
                        state.directionsRoute,
                    ).length,
                    isNavigating: state.isNavigating,
                    statusLabel: state.statusLabel,
                    maneuverText: state.maneuverText,
                    routeDistanceText: state.routeDistanceText,
                    routeDurationText: state.routeDurationText,
                    title: state.title,
                    errorText: state.errorText,
                };
            },
            async () => {
                if (activeNavigationRoute) await stopAutoPlayNavigation();
                hideAutoPlayRoutePreview();
                clearAutoPlayRoutePreviewState();
                await popToAutoPlayRootTemplate();
            },
            requestType,
            (searchQuery) =>
                handleVoiceNavigationWhenReady(null, searchQuery, 'search'),
            () => getAutoPlayMapControlHandlers().getE2EMapSnapshot(),
        );
    }
    if (e2eMapApiMocksCanBeEnabled() && requestType === 'presence') {
        return require('./map/alpr-presence-e2e').startPresenceE2EScenario(
            query,
        );
    }
    if (e2eMapApiMocksCanBeEnabled() && requestType === 'map-view') {
        if (query !== 'toggle' || !activeNavigationRoute) {
            return false;
        }

        handleRootHeaderDrivingMapViewPress();
        return true;
    }
    const normalizedQuery = String(query ?? '').trim();

    if (
        !e2eMapApiMocksCanBeEnabled() ||
        !['directions', 'navigation', 'search'].includes(requestType) ||
        !normalizedQuery
    ) {
        return false;
    }

    handleVoiceNavigationWhenReady(null, normalizedQuery, requestType);
    return true;
}

function replayPendingVoiceNavigation() {
    const pendingNavigation = pendingVoiceNavigation;
    pendingVoiceNavigation = null;

    if (!pendingNavigation || !rootMapTemplateIsReady) {
        return;
    }

    handleVoiceNavigationWhenReady(
        pendingNavigation.coordinates,
        pendingNavigation.query,
        pendingNavigation.requestType,
        { isReplay: true },
    );
}

function retainAutoPlayConnectionRoadMatchingSession(connectionGeneration) {
    autoPlayConnectionRoadMatchingIsRequested = true;
    autoPlayConnectionRoadMatchingGeneration = connectionGeneration;

    if (
        autoPlayConnectionRoadMatchingHandle ||
        autoPlayConnectionRoadMatchingPromise
    ) {
        return;
    }

    const retainPromise = retainRoadMatchingSessionAsync({
        persistent: true,
    });

    autoPlayConnectionRoadMatchingPromise = retainPromise;

    void retainPromise
        .then((sessionHandle) => {
            if (autoPlayConnectionRoadMatchingPromise === retainPromise) {
                autoPlayConnectionRoadMatchingPromise = null;
            }

            if (
                !autoPlayConnectionRoadMatchingIsRequested ||
                connectionGeneration !==
                    autoPlayConnectionRoadMatchingGeneration ||
                connectionGeneration !== autoPlayConnectionGeneration
            ) {
                sessionHandle.remove();

                if (
                    autoPlayConnectionRoadMatchingIsRequested &&
                    !autoPlayConnectionRoadMatchingHandle &&
                    !autoPlayConnectionRoadMatchingPromise
                ) {
                    retainAutoPlayConnectionRoadMatchingSession(
                        autoPlayConnectionRoadMatchingGeneration,
                    );
                }

                return;
            }

            autoPlayConnectionRoadMatchingHandle = sessionHandle;
        })
        .catch(() => {
            if (autoPlayConnectionRoadMatchingPromise === retainPromise) {
                autoPlayConnectionRoadMatchingPromise = null;
            }
        });
}

function releaseAutoPlayConnectionRoadMatchingSession() {
    autoPlayConnectionRoadMatchingIsRequested = false;
    autoPlayConnectionRoadMatchingGeneration = autoPlayConnectionGeneration;

    const sessionHandle = autoPlayConnectionRoadMatchingHandle;

    autoPlayConnectionRoadMatchingHandle = null;
    sessionHandle?.remove();
}

const ROOT_TEMPLATE_SETUP_TIMEOUT_MS = 10000;
const ROOT_TEMPLATE_SETUP_RETRY_DELAYS_MS = [1000, 2000, 4000];

async function handleAutoPlayConnect() {
    const connectionGeneration = ++autoPlayConnectionGeneration;
    const routingStateHydration = hydrateSharedRoutingStateAsync();
    const { MapTemplate } = loadAutoPlayModule();
    setAutoPlaySessionConnected(true);
    retainAutoPlayConnectionRoadMatchingSession(connectionGeneration);

    rootMapTemplateIsReady = false;
    lastAppliedMapButtonsKey = null;
    lastAppliedHeaderActionsKey = null;
    lastDeferredSharedNavigationStartKey = null;
    rootMapPanningInterfaceIsVisible = false;
    rootMapButtonsRefreshIsDeferred = false;
    rootMapHeaderActionsRefreshIsDeferred = false;
    navigationGuidanceIsDeferredDuringPanning = false;
    deferredNavigationGuidanceLocation = null;
    setAutoPlayState({
        ...DEFAULT_AUTO_PLAY_STATE,
        statusLabel: 'Connected',
    });
    const initialRootMapHeaderActions = getRootMapHeaderActions();
    const initialRootMapButtons = getRootMapButtons();
    lastAppliedHeaderActionsKey = getTemplateChromeKey(
        initialRootMapHeaderActions,
    );
    lastAppliedMapButtonsKey = getTemplateChromeKey(initialRootMapButtons);

    const mapTemplate = new MapTemplate({
        component: autoPlayPlatform.MapSurface,
        headerActions: initialRootMapHeaderActions,
        mapButtons: initialRootMapButtons,
        onAppearanceDidChange: (colorScheme) => {
            logAutoPlayPlatformAction(
                colorScheme === 'dark' ? 'appearance-dark' : 'appearance-light',
            );
            setAutoPlayMapColorScheme(colorScheme);
        },
        ...getAutoPlayMapGestureCallbacks({
            // Android Auto only registers its required PanModeListener when
            // this callback is supplied. Touchscreen hosts hide the native
            // pan button, but still need that listener before forwarding
            // drag gestures to the map surface.
            onPanningInterfaceChanged: (isPanningInterfaceVisible) => {
                handleRootMapPanningInterfaceChanged(isPanningInterfaceVisible);
                getAutoPlayMapControlHandlers().handlePanningInterfaceChanged(
                    isPanningInterfaceVisible,
                );
            },
            onPan: (translation) => {
                getAutoPlayMapControlHandlers().handlePan(translation);
            },
            onZoomGesture: (center, scale) => {
                getAutoPlayMapControlHandlers().handleZoomGesture(
                    center,
                    scale,
                );
            },
        }),
        onStopNavigation: () => {
            if (
                connectionGeneration !== autoPlayConnectionGeneration ||
                rootMapTemplate !== mapTemplate
            ) {
                return;
            }

            logAutoPlayPlatformAction('host-navigation-stopped');
            stopAutoPlayNavigation({ notifyTemplate: false });
        },
        ...autoPlayPlatform.getMapTemplatePlatformConfig({
            onAutoDriveEnabled: handleAutoDriveEnabled,
            onDoubleClickZoomIn: (center) => {
                getAutoPlayMapControlHandlers().handleZoomInPress(center);
            },
        }),
    });
    rootMapTemplate = mapTemplate;

    // ReactHost restarts retained Fabric surfaces as soon as a reloaded bundle
    // finishes evaluating. MapTemplate registers AutoPlayRoot with AppRegistry,
    // so it must be constructed before the first await or the restarted surface
    // can run before its component has been registered.
    if (
        connectionGeneration !== autoPlayConnectionGeneration ||
        rootMapTemplate !== mapTemplate
    ) {
        return;
    }

    // If setRootTemplate rejects or never settles, rootMapTemplateIsReady
    // stays false and every phone-initiated start is dropped for the rest of
    // the session, so treat a stalled push as a failure and retry with
    // backoff. Each attempt is token-gated so a timed-out attempt settling
    // late cannot race a newer one.
    let currentRootTemplateSetupAttempt = 0;
    const rootTemplateSetupIsCurrent = (attemptNumber) =>
        connectionGeneration === autoPlayConnectionGeneration &&
        rootMapTemplate === mapTemplate &&
        attemptNumber === currentRootTemplateSetupAttempt;
    const setupRootTemplate = (attemptNumber) => {
        currentRootTemplateSetupAttempt = attemptNumber;

        withTimeout(
            Promise.resolve().then(() => mapTemplate.setRootTemplate()),
            ROOT_TEMPLATE_SETUP_TIMEOUT_MS,
            'The car screen root template did not respond in time.',
        )
            .then(async () => {
                await routingStateHydration;

                if (!rootTemplateSetupIsCurrent(attemptNumber)) {
                    return;
                }

                rootMapTemplateIsReady = true;
                updateRootTemplateHeaderActions();
                syncAutoPlayNavigationFromSharedRoutingState();
                replayPendingVoiceNavigation();
                replayPendingDashboardAction();
            })
            .catch((error) => {
                if (!rootTemplateSetupIsCurrent(attemptNumber)) {
                    return;
                }

                logAutoPlayPlatformAction('root-template-setup-failed', {
                    attempt: attemptNumber,
                    message: error?.message || 'Unknown error',
                });

                if (
                    attemptNumber <= ROOT_TEMPLATE_SETUP_RETRY_DELAYS_MS.length
                ) {
                    setTimeout(
                        () => {
                            if (!rootTemplateSetupIsCurrent(attemptNumber)) {
                                return;
                            }

                            setupRootTemplate(attemptNumber + 1);
                        },
                        ROOT_TEMPLATE_SETUP_RETRY_DELAYS_MS[attemptNumber - 1],
                    );
                    return;
                }

                showAutoPlayError(
                    'Car screen unavailable',
                    error?.message || 'The car screen could not be started.',
                );
            });
    };

    setupRootTemplate(1);
}

function clearAutoPlayNavigationRuntime() {
    navigationRouteGeneration += 1;
    autoPlayArrivalDetector.reset();
    autoDriveIsEnabled = false;
    stopAutoDriveSimulation();
    void stopNavigationLocationUpdates();
    autoPlayHostNavigationIsActive = false;
    activeNavigationRoute = null;
    navigationProgressTracker.reset();
    activeNavigationDestination = null;
    lastNavigationGuidanceLocation = null;
    latestNavigationGuidanceRecordedAt = null;
    routePreviewIsVisible = false;
    setAutoPlayState(DEFAULT_AUTO_PLAY_STATE);
}

function handleAutoPlayDisconnect() {
    autoPlayConnectionGeneration += 1;
    releaseAutoPlayConnectionRoadMatchingSession();
    setAutoPlaySessionConnected(false);
    voiceNavigationRequestGeneration += 1;
    autoPlayPlatform?.cancelSearchVoiceInput?.();
    rootMapTemplate = null;
    rootMapTemplateIsReady = false;
    lastAppliedMapButtonsKey = null;
    lastAppliedHeaderActionsKey = null;
    lastDeferredSharedNavigationStartKey = null;
    rootMapPanningInterfaceIsVisible = false;
    rootMapButtonsRefreshIsDeferred = false;
    rootMapHeaderActionsRefreshIsDeferred = false;
    navigationGuidanceIsDeferredDuringPanning = false;
    deferredNavigationGuidanceLocation = null;
    pendingVoiceNavigation = null;
    pendingDashboardAction = null;
    pendingVoiceSearchTemplatePush = null;
    cancelAutoPlaySearchWork();
    clearAutoPlaySubmittedSearchResults();
    routePreviewIsVisible = false;

    clearAutoPlayNavigationRuntime();
}

function handleAutoPlaySessionRenderState(renderState) {
    setAutoPlaySessionRenderState(renderState);
}

export default function registerAutoPlay() {
    if (!autoPlayPlatform || autoPlayRegistered) {
        return;
    }

    autoPlayRegistered = true;

    let HybridAutoPlay;

    try {
        ({ HybridAutoPlay } = loadAutoPlayModule());
    } catch (error) {
        // A dev client built before the car screen pods were linked can still run
        // this JS bundle; skip car integration instead of crashing the phone app.
        console.warn('Car screen support is unavailable in this build.', error);
        return;
    }

    setAutoPlayMapButtonAppearanceListener(updateRootMapButtonAppearance);
    primaryLocationsUnsubscribe?.();
    primaryLocationsUnsubscribe = addPrimaryLocationsListener(
        handlePrimaryLocationsChanged,
    );
    refreshAutoPlayPrimaryLocations();
    sharedRoutingStateUnsubscribe?.();
    sharedRoutingStateUnsubscribe = addSharedRoutingStateListener(
        syncAutoPlayNavigationFromSharedRoutingState,
    );
    autoPlayPlatform.registerPlatformListeners({
        autoPlayModule: loadAutoPlayModule(),
        getPrimaryLocations: () => autoPlayPrimaryLocations,
        makeGlyphImage: makeButtonGlyphImage,
        onDashboardAction: handleAutoPlayDashboardAction,
        onSessionRenderState: handleAutoPlaySessionRenderState,
        onVoiceNavigation: handleVoiceNavigationWhenReady,
    });

    // Android invokes this listener immediately when registration happens
    // during an already-connected Metro reload. Let the explicit state check
    // below own that bootstrap so the same session is not initialized twice.
    let didConnectListenerIsRegistering = true;
    HybridAutoPlay.addListener('didConnect', () => {
        if (didConnectListenerIsRegistering) {
            return;
        }

        handleAutoPlayConnect().catch(() => {});
    });
    didConnectListenerIsRegistering = false;
    HybridAutoPlay.addListener('didDisconnect', handleAutoPlayDisconnect);

    if (HybridAutoPlay.isConnected()) {
        handleAutoPlayConnect().catch(() => {});
    }
}
