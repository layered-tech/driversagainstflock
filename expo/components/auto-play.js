import {
    activateAndroidAutoLifecycleAsync,
    addEnhancedLocationListener,
    deactivateAndroidAutoLifecycleAsync,
    getLastEnhancedLocationAsync,
    updateAndroidAutoLifecycleStateAsync,
} from '@rnmapbox/navigation';
import * as Location from 'expo-location';
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
import { createAutoPlaySearchTemplateLifecycle } from './auto-play-search-template-lifecycle';
import {
    AUTO_PLAY_SINGLE_RESULT_COUNTDOWN_SECONDS,
    createAutoPlaySingleResultCountdown,
} from './auto-play-single-result-countdown';
// Metro resolves the platform adapter per platform: Android Auto specifics in
// auto-play-platform.android.js, CarPlay specifics in auto-play-platform.ios.js.
import { autoPlayPlatform } from './auto-play-platform';
import {
    DEFAULT_AUTO_PLAY_STATE,
    getAutoPlayState,
    setAutoPlayState,
} from './auto-play-state';
import {
    AUTO_PLAY_TRIP_PREVIEW_TEXT_CONFIGURATION,
    autoPlaySearchRequestIsCurrent,
    createAutoPlaySearchCallbackState,
    getAutoPlayHeaderButtonVisibility,
    getAutoPlayRouteChoiceText,
    getAutoPlaySearchLoadingCopy,
    getAutoPlayTripEstimateValues,
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
// Android Auto may deliver bursts of text-change callbacks. Wait for a stable
// query so autocomplete does not flood the API and native search template.
const SEARCH_DEBOUNCE_MS = 2000;
const NAVIGATION_LOCATION_INTERVAL_MS = 4000;
const NAVIGATION_LOCATION_DISTANCE_METERS = 12;
const NAVIGATION_GUIDANCE_MIN_INTERVAL_MS = 1000;
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
const ROOT_MAP_BUTTON_EXIT_BACKGROUND_COLOR = 'transparent';
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
let autoPlayConnectionGeneration = 0;
let autoPlaySessionRenderState = null;
let rootMapTemplate = null;
let rootMapTemplateIsReady = false;
let pendingVoiceNavigation = null;
let pendingVoiceSearchTemplatePush = null;
let voiceNavigationRequestGeneration = 0;
let rootMapButtonAppearance = ROOT_MAP_BUTTON_APPEARANCE_DEFAULTS;
let rootMapButtonAppearanceKey = '';
let navigationLocationSubscription = null;
let navigationLocationUpdateGeneration = 0;
let searchAbortController = null;
let searchDebounceTimer = null;
let routeLoadAbortController = null;
let routeLoadingRequestSequence = 0;
let singleResultCountdown = null;
let singleResultCountdownRequestSequence = 0;
let routePreviewIsVisible = false;
let routePreviewRequestSequence = 0;
let activeNavigationRoute = null;
let lastNavigationGuidanceLocation = null;
let lastNavigationGuidanceUpdatedAt = 0;
let pendingNavigationGuidanceLocation = null;
let pendingNavigationGuidanceTimer = null;
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

function makeSearchRows(results, query, onPress) {
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
            onPress(result);
        },
        title: makeAutoText(result.primaryText || result.label || 'Place'),
        type: 'default',
    }));
}

function updateSearchTemplateResults(template, results, query, startLocation) {
    if (autoPlayPlatform?.publishesSearchTemplateResultsToMap === true) {
        setAutoPlaySubmittedSearchResults({ query, results });
    }

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

function updateSearchTemplateLoadingResults(template, query) {
    const loadingCopy = getAutoPlaySearchLoadingCopy(query);

    updateSearchTemplateSection(template, {
        items: [
            makeDisabledSearchRow(loadingCopy.title, loadingCopy.detailedText),
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
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
    }

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

function clearAutoPlaySingleResultCountdown() {
    const countdown = singleResultCountdown;
    singleResultCountdown = null;
    countdown?.controller?.cancel();

    if (getAutoPlayState().singleResultCountdown) {
        setAutoPlayState({ singleResultCountdown: null });
    }
}

function scheduleAutoPlaySingleResultAutoAdvance({
    preferredStartLocation,
    requestIsCurrent,
    result,
    resultTemplate,
}) {
    clearAutoPlaySingleResultCountdown();

    const destinationLabel =
        result?.primaryText || result?.label || 'Destination';
    const requestId = ++singleResultCountdownRequestSequence;
    const countdown = { controller: null, requestId };
    singleResultCountdown = countdown;

    setAutoPlayState({
        singleResultCountdown: {
            destinationLabel,
            remainingSeconds: AUTO_PLAY_SINGLE_RESULT_COUNTDOWN_SECONDS,
            requestId,
        },
    });
    logAutoPlayPlatformAction('single-result-countdown-started', {
        destinationLabel,
        remainingSeconds: AUTO_PLAY_SINGLE_RESULT_COUNTDOWN_SECONDS,
    });

    countdown.controller = createAutoPlaySingleResultCountdown({
        onCancel: () => {
            if (singleResultCountdown === countdown) {
                singleResultCountdown = null;
            }

            if (
                getAutoPlayState().singleResultCountdown?.requestId ===
                requestId
            ) {
                setAutoPlayState({ singleResultCountdown: null });
            }

            logAutoPlayPlatformAction('single-result-countdown-cancelled', {
                destinationLabel,
            });
        },
        onComplete: () => {
            if (singleResultCountdown !== countdown || !requestIsCurrent()) {
                return;
            }

            singleResultCountdown = null;

            if (
                getAutoPlayState().singleResultCountdown?.requestId ===
                requestId
            ) {
                setAutoPlayState({ singleResultCountdown: null });
            }

            logAutoPlayPlatformAction('single-result-auto-advanced', {
                destinationLabel,
            });

            handleSearchResultSelected(result, {
                preferredStartLocation,
                template: resultTemplate,
            });
        },
        onTick: (remainingSeconds) => {
            const activeCountdown = getAutoPlayState().singleResultCountdown;

            if (
                singleResultCountdown !== countdown ||
                activeCountdown?.requestId !== requestId
            ) {
                return;
            }

            setAutoPlayState({
                singleResultCountdown: {
                    ...activeCountdown,
                    remainingSeconds,
                },
            });
        },
        requestIsCurrent: () =>
            singleResultCountdown === countdown && requestIsCurrent(),
    });
}

function cancelAutoPlaySearchWork() {
    abortSearchRequest();
    abortRouteLoadRequest();
    clearAutoPlayRouteLoading();
    clearAutoPlaySingleResultCountdown();
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
        submittedSearchResults: results,
    });
}

function presentAutoPlaySearchResults({
    includesMap = false,
    query,
    requestIsCurrent = () => true,
    results,
    sourceTemplate,
    startLocation,
}) {
    const { ListTemplate } = loadAutoPlayModule();
    let resultsTemplate;
    let templateWasPushed = false;
    const dismissResults = () => {
        if (!requestIsCurrent()) {
            return;
        }

        cancelAutoPlaySearchWork();
        clearAutoPlaySubmittedSearchResults();
    };

    try {
        resultsTemplate = new ListTemplate({
            headerActions: getBackHeaderAction(dismissResults),
            ...(includesMap
                ? {
                      mapConfig: {
                          mapButtons: getRootMapButtons(),
                      },
                  }
                : {}),
            onPopped: dismissResults,
            sections: {
                items: makeSearchRows(results, query, (result) => {
                    if (!requestIsCurrent()) {
                        return;
                    }

                    handleSearchResultSelected(result, {
                        preferredStartLocation: startLocation,
                        template: resultsTemplate,
                    });
                }),
                type: 'default',
            },
            title: makeAutoText('Search results'),
        });
        setAutoPlaySubmittedSearchResults({ query, results });
        const pushPromise = resultsTemplate.push().then(
            () => {
                templateWasPushed = true;
                return true;
            },
            () => {
                if (requestIsCurrent()) {
                    clearAutoPlaySubmittedSearchResults();
                    updateSearchTemplateResults(
                        sourceTemplate,
                        results,
                        query,
                        startLocation,
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
            updateSearchTemplateResults(
                sourceTemplate,
                results,
                query,
                startLocation,
            );
        }
    }

    return null;
}

async function runPlaceAutocomplete(template, searchText, startLocation) {
    const input = String(searchText ?? '').trim();

    abortSearchRequest();

    if (input.length < PLACE_SEARCH_MIN_QUERY_LENGTH) {
        updateSearchTemplateResults(template, [], input, startLocation);
        return;
    }

    const abortController = new AbortController();
    searchAbortController = abortController;
    updateSearchTemplateLoadingResults(template, input);

    try {
        const location = startLocation ?? (await getLastKnownLocation());

        if (
            !autoPlaySearchRequestIsCurrent(
                searchAbortController,
                abortController,
            )
        ) {
            return;
        }

        const results = await searchPlaces({
            input,
            location,
            signal: abortController.signal,
        });

        if (
            !autoPlaySearchRequestIsCurrent(
                searchAbortController,
                abortController,
            )
        ) {
            return;
        }

        updateSearchTemplateResults(template, results, input, startLocation);
    } catch (error) {
        if (
            error?.name !== 'AbortError' &&
            autoPlaySearchRequestIsCurrent(
                searchAbortController,
                abortController,
            )
        ) {
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

async function runPlaceTextSearch(
    template,
    searchText,
    startLocation,
    {
        autoAdvanceSingleResult = false,
        onResultsTemplatePresented = () => {},
        requestIsCurrent = () => true,
    } = {},
) {
    const textQuery = String(searchText ?? '').trim();

    clearAutoPlaySingleResultCountdown();
    abortSearchRequest();

    if (textQuery.length < PLACE_SEARCH_MIN_QUERY_LENGTH) {
        if (requestIsCurrent()) {
            updateSearchTemplateResults(template, [], textQuery, startLocation);
        }
        return;
    }

    const abortController = new AbortController();
    searchAbortController = abortController;
    updateSearchTemplateLoadingResults(template, textQuery);

    try {
        const location = startLocation ?? (await getLastKnownLocation());

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

        // Android Auto's voice host reads the active SearchTemplate's result
        // list. Publish there before adding the map-backed result list.
        const searchTemplateWasUpdated = await updateSearchTemplateResults(
            template,
            results,
            textQuery,
            startLocation,
        );

        if (
            !requestIsCurrent() ||
            !autoPlaySearchRequestIsCurrent(
                searchAbortController,
                abortController,
            )
        ) {
            return;
        }

        const showsSearchResultsOnMap =
            autoPlayPlatform?.showsSearchResultsOnMap === true;
        const presentsVoiceSearchResultsInList =
            autoAdvanceSingleResult &&
            autoPlayPlatform?.presentsVoiceSearchResultsInList === true;

        if (
            searchTemplateWasUpdated &&
            (showsSearchResultsOnMap || presentsVoiceSearchResultsInList)
        ) {
            const resultTemplatePresentation = presentAutoPlaySearchResults({
                includesMap: showsSearchResultsOnMap,
                query: textQuery,
                requestIsCurrent,
                results,
                sourceTemplate: template,
                startLocation,
            });
            onResultsTemplatePresented(resultTemplatePresentation);

            if (
                autoAdvanceSingleResult &&
                results.length === 1 &&
                resultTemplatePresentation?.pushPromise
            ) {
                const resultTemplateWasPresented =
                    await resultTemplatePresentation.pushPromise;

                if (
                    resultTemplateWasPresented &&
                    requestIsCurrent() &&
                    autoPlaySearchRequestIsCurrent(
                        searchAbortController,
                        abortController,
                    )
                ) {
                    scheduleAutoPlaySingleResultAutoAdvance({
                        preferredStartLocation: startLocation,
                        requestIsCurrent,
                        result: results[0],
                        resultTemplate: resultTemplatePresentation.template,
                    });
                }
            }
        }
    } catch (error) {
        if (
            error?.name !== 'AbortError' &&
            requestIsCurrent() &&
            autoPlaySearchRequestIsCurrent(
                searchAbortController,
                abortController,
            )
        ) {
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
    const input = String(searchText ?? '').trim();

    clearAutoPlaySingleResultCountdown();
    abortSearchRequest();

    if (input.length < PLACE_SEARCH_MIN_QUERY_LENGTH) {
        updateSearchTemplateResults(template, [], input, startLocation);
        return;
    }

    searchDebounceTimer = setTimeout(() => {
        runPlaceAutocomplete(template, input, startLocation);
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

function openSearchTemplate(
    initialSearchText = '',
    preferredStartLocation,
    { autoAdvanceSingleResult = false, requestIsCurrent = () => true } = {},
) {
    const { SearchTemplate } = loadAutoPlayModule();
    const searchCallbackState = createAutoPlaySearchCallbackState();
    const templateLifecycle = createAutoPlaySearchTemplateLifecycle();
    let templateWasPushed = false;
    let template;
    const runSubmittedSearch = (
        searchText,
        { shouldAutoAdvanceSingleResult = false } = {},
    ) => {
        if (!requestIsCurrent()) {
            return Promise.resolve();
        }

        const submission =
            searchCallbackState.handleSearchTextSubmitted(searchText);

        return runPlaceTextSearch(
            template,
            submission.searchText,
            preferredStartLocation,
            {
                autoAdvanceSingleResult: shouldAutoAdvanceSingleResult,
                onResultsTemplatePresented: (presentation) => {
                    templateLifecycle.trackResultTemplatePresentation(
                        presentation,
                    );
                },
                requestIsCurrent,
            },
        ).finally(() => {
            searchCallbackState.handleSearchTextSubmissionCompleted(
                submission.submissionToken,
            );
        });
    };
    const dismissSearch = () => {
        if (!requestIsCurrent()) {
            return;
        }

        cancelAutoPlaySearchWork();
        clearAutoPlaySubmittedSearchResults();
    };

    cancelAutoPlaySearchWork();
    clearAutoPlaySubmittedSearchResults();
    template = new SearchTemplate({
        headerActions: getBackHeaderAction(dismissSearch),
        initialSearchText,
        onSearchTextChanged: (searchText) => {
            if (!requestIsCurrent()) {
                return;
            }

            const searchTextChange =
                searchCallbackState.handleSearchTextChanged(searchText);

            if (searchTextChange.ignored) {
                return;
            }

            if (autoPlayPlatform?.supportsSearchAutocomplete === false) {
                return;
            }

            schedulePlaceAutocomplete(
                template,
                searchTextChange.searchText,
                preferredStartLocation,
            );
        },
        onSearchTextSubmitted: (searchText) => {
            return runSubmittedSearch(searchText);
        },
        onPopped: dismissSearch,
        results: {
            items: [
                makeDisabledSearchRow(
                    'Search',
                    autoPlayPlatform?.supportsSearchAutocomplete === false
                        ? 'Tap the search field, then use the keyboard or its microphone when available.'
                        : 'Enter a destination or use voice.',
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

    const pushPromise = template
        .push()
        .then(() => {
            templateWasPushed = true;

            if (initialSearchText && requestIsCurrent()) {
                return runSubmittedSearch(initialSearchText, {
                    shouldAutoAdvanceSingleResult: autoAdvanceSingleResult,
                });
            }

            return undefined;
        })
        .catch((error) => {
            if (!requestIsCurrent()) {
                return;
            }

            dismissSearch();
            setAutoPlayState({
                errorText: error?.message || 'Search could not be opened.',
                statusLabel: 'Search error',
            });
        });

    return {
        pushPromise,
        template,
        waitForResultTemplatePushes:
            templateLifecycle.waitForResultTemplatePushes,
        wasPushed: () => templateWasPushed,
    };
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

    setAutoPlayRoutePreviewState(previewRoute);

    try {
        // The trip selector belongs to the root map. Remove every search
        // template first so the route choices are visible immediately.
        clearAutoPlaySubmittedSearchResults();
        await HybridAutoPlay.popToRootTemplate(false);

        if (previewRequestId !== routePreviewRequestSequence) {
            return;
        }

        if (rootMapTemplate !== mapTemplate || !rootMapTemplateIsReady) {
            clearAutoPlayRoutePreviewState();
            return;
        }

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
        routePreviewIsVisible = true;
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

    return getPlaceDetails({ placeId: result.placeId, signal });
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
    clearAutoPlaySingleResultCountdown();
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

        const resolvedRoute = {
            ...route,
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
        getNextDirectionsManeuver(route, currentManeuver),
    );

    return [currentRoutingManeuver, nextRoutingManeuver].filter(Boolean);
}

function getRemainingRouteValues(
    route,
    userLocation,
    progress = getDirectionsRouteProgress(route, userLocation),
) {
    const routeOption = getSelectedDirectionsRouteOption(route);
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
    if (!rootMapTemplate || !activeNavigationRoute) {
        return;
    }

    lastNavigationGuidanceUpdatedAt = Date.now();
    lastNavigationGuidanceLocation =
        userLocation ?? lastNavigationGuidanceLocation;

    const routeOption = getSelectedDirectionsRouteOption(activeNavigationRoute);
    const routeProgress = getDirectionsRouteProgress(
        activeNavigationRoute,
        userLocation,
    );
    const activeManeuver = getActiveDirectionsManeuver(
        activeNavigationRoute,
        userLocation,
        routeProgress,
    );
    const { distanceRemaining, durationRemaining } = getRemainingRouteValues(
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

function clearScheduledNavigationGuidance() {
    if (pendingNavigationGuidanceTimer !== null) {
        clearTimeout(pendingNavigationGuidanceTimer);
        pendingNavigationGuidanceTimer = null;
    }

    pendingNavigationGuidanceLocation = null;
}

function scheduleNavigationGuidance(userLocation) {
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

async function startEnhancedNavigationLocationUpdates(generation) {
    const subscription = addEnhancedLocationListener((enhancedLocation) => {
        if (generation !== navigationLocationUpdateGeneration) {
            return;
        }

        const location = getLocationFromPosition(
            getEnhancedLocationUpdate(enhancedLocation),
        );

        if (location) {
            scheduleNavigationGuidance(location);
        }
    });

    const lastEnhancedLocation = await getLastEnhancedLocationAsync().catch(
        () => null,
    );

    return {
        lastKnownLocation: getLocationFromPosition(
            getEnhancedLocationUpdate(lastEnhancedLocation),
        ),
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

    const startedLocationUpdates = mapboxNavigationEnhancedLocationIsSupported()
        ? await startEnhancedNavigationLocationUpdates(generation)
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
                scheduleNavigationGuidance(location);
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
    cancelAutoPlaySearchWork();
    stopAutoDriveSimulation();
    await stopNavigationLocationUpdates();
    activeNavigationRoute = null;
    activeNavigationDestination = null;
    routePreviewIsVisible = false;
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

function startAutoPlayNavigation(
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
    activeNavigationRoute = route;
    activeNavigationDestination = route.destination;

    try {
        if (!hostNavigationAlreadyStarted) {
            hideAutoPlayRoutePreview();
            rootMapTemplate.startNavigation(makeTripConfig(route));
        } else {
            routePreviewIsVisible = false;
        }

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
    if (
        autoPlayPlatform?.startSearchVoiceInput?.({
            onFallback: () => {
                openSearchTemplate();
            },
            onNoMatch: () => {
                showAutoPlayError(
                    'Voice search',
                    'No destination was heard. Tap Search to try again.',
                );
            },
            onUnavailable: () => {
                showAutoPlayError(
                    'Voice search unavailable',
                    'Voice search could not start. Check Microphone and Speech Recognition access on your iPhone, then tap Search again.',
                );
            },
        }) === true
    ) {
        return;
    }

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
    const { navigationExitButtonIsVisible, trailingNavigationButtonIsVisible } =
        getAutoPlayHeaderButtonVisibility({
            hasActiveNavigation: Boolean(activeNavigationRoute),
            usesHeaderDrivingModeButton:
                autoPlayPlatform?.usesHeaderDrivingModeButton !== false,
            usesHeaderExitNavigationButton:
                autoPlayPlatform?.usesHeaderExitNavigationButton === true,
        });
    const rootMapHeaderActionsKey = `${drivingModeKey}:${navigationExitButtonIsVisible ? 'navigating' : 'ready'}:${trailingNavigationButtonIsVisible ? 'trailing' : 'search-only'}`;

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
    const trailingNavigationButton = trailingNavigationButtonIsVisible
        ? {
              image: navigationExitButtonIsVisible
                  ? getRootHeaderExitNavigationButtonImage()
                  : getRootHeaderDrivingModeButtonImage(),
              onPress: navigationExitButtonIsVisible
                  ? handleRootHeaderExitNavigationPress
                  : handleRootHeaderDrivingModePress,
              type: 'image',
          }
        : null;

    cachedRootMapHeaderActions = {
        android: trailingNavigationButton
            ? [searchButton, trailingNavigationButton]
            : [searchButton],
        ios: {
            leadingNavigationBarButtons: [searchButton],
            trailingNavigationBarButtons: trailingNavigationButton
                ? [trailingNavigationButton]
                : [],
        },
    };
    cachedRootMapHeaderActionsKey = rootMapHeaderActionsKey;
    return cachedRootMapHeaderActions;
}

function showAutoPlayError(title, message) {
    const { InformationTemplate } = loadAutoPlayModule();
    const searchAction = {
        onPress: handleRootHeaderSearchPress,
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

            const poppedToSearchTemplate = await pendingSearch.template
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
    // Current native builds preserve the host request type. Older patched
    // builds emitted a boolean instead, and treated ambiguous text-only geo
    // queries as navigation. Only explicit navigation, including a
    // coordinate-backed legacy navigation callback, may bypass confirmation;
    // ambiguous text stays in search results.
    const resolvedRequestType = resolveAutoPlayVoiceRequestType({
        hasDestinationCoordinates: Boolean(destinationLocation),
        requestType,
    });
    logAutoPlayPlatformAction('voice-request-classified', {
        hasDestinationCoordinates: Boolean(destinationLocation),
        nativeRequestType: requestType ?? null,
        query: searchQuery,
        resolvedRequestType,
    });

    if (resolvedRequestType === 'search') {
        pendingVoiceSearchTemplatePush = {
            ...openSearchTemplate(searchQuery, destinationLocation, {
                autoAdvanceSingleResult: true,
                requestIsCurrent,
            }),
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

        const startLocation = await getLastKnownLocation();

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

    handleVoiceNavigation(
        coordinates,
        query,
        requestType,
        autoPlayConnectionGeneration,
        rootMapTemplate,
        requestGeneration,
    ).catch((error) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.warn('Android Auto voice request failed.', {
                message: error?.message || 'Unknown error',
                requestGeneration,
                requestType,
            });
        }
    });
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

async function handleAutoPlayConnect() {
    const connectionGeneration = ++autoPlayConnectionGeneration;
    const { MapTemplate } = loadAutoPlayModule();

    rootMapTemplateIsReady = false;
    setAutoPlayState({
        ...DEFAULT_AUTO_PLAY_STATE,
        statusLabel: 'Connected',
    });

    const mapTemplate = new MapTemplate({
        component: autoPlayPlatform.MapSurface,
        headerActions: getRootMapHeaderActions(),
        mapButtons: getRootMapButtons(),
        onAppearanceDidChange: (colorScheme) => {
            setAutoPlayMapColorScheme(colorScheme);
        },
        ...getAutoPlayMapGestureCallbacks({
            // Android Auto only registers its required PanModeListener when
            // this callback is supplied. Touchscreen hosts hide the native
            // pan button, but still need that listener before forwarding
            // drag gestures to the map surface.
            onPanningInterfaceChanged: () => {},
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
    await activateAndroidAutoLifecycleAsync().catch(() => false);

    if (autoPlaySessionRenderState) {
        await updateAndroidAutoLifecycleStateAsync(
            autoPlaySessionRenderState,
        ).catch(() => false);
    }

    if (
        connectionGeneration !== autoPlayConnectionGeneration ||
        rootMapTemplate !== mapTemplate
    ) {
        return;
    }

    mapTemplate
        .setRootTemplate()
        .then(() => {
            if (
                connectionGeneration !== autoPlayConnectionGeneration ||
                rootMapTemplate !== mapTemplate
            ) {
                return;
            }

            rootMapTemplateIsReady = true;
            syncAutoPlayNavigationFromSharedRoutingState();
            replayPendingVoiceNavigation();
        })
        .catch((error) => {
            if (
                connectionGeneration !== autoPlayConnectionGeneration ||
                rootMapTemplate !== mapTemplate
            ) {
                return;
            }

            setAutoPlayState({
                errorText:
                    error?.message || 'The car screen could not be started.',
                statusLabel: 'Connection error',
            });
        });
}

function handleAutoPlayDisconnect() {
    autoPlayConnectionGeneration += 1;
    voiceNavigationRequestGeneration += 1;
    autoPlayPlatform?.cancelSearchVoiceInput?.();
    autoPlaySessionRenderState = null;
    deactivateAndroidAutoLifecycleAsync().catch(() => {});
    rootMapTemplate = null;
    rootMapTemplateIsReady = false;
    pendingVoiceNavigation = null;
    pendingVoiceSearchTemplatePush = null;
    activeNavigationRoute = null;
    activeNavigationDestination = null;
    routePreviewIsVisible = false;
    lastNavigationGuidanceLocation = null;
    autoDriveIsEnabled = false;
    stopAutoDriveSimulation();
    cancelAutoPlaySearchWork();
    stopNavigationLocationUpdates();
    setAutoPlayState(DEFAULT_AUTO_PLAY_STATE);
}

function handleAutoPlaySessionRenderState(state) {
    autoPlaySessionRenderState = state;
    updateAndroidAutoLifecycleStateAsync(state).catch(() => {});
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
