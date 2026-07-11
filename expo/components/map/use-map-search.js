import { useIsFocused } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Linking } from 'react-native';
import {
    logMapDirectionsRouteSelected,
    logMapPlaceSelected,
    logMapSelectedPlaceWebsiteOpened,
} from './analytics';
import { getLocalityBoundary, getPlaceDetails } from './api';
import {
    createCurrentLocationDirectionsWaypoint,
    createPlaceDirectionsWaypoint,
    CURRENT_LOCATION_DIRECTIONS_WAYPOINT_ID,
    DIRECTIONS_FIELD_DESTINATION,
    DIRECTIONS_FIELD_START,
    DIRECTIONS_FIELD_STOP,
    DIRECTIONS_MODE_DIRECTIONS,
    DIRECTIONS_MODE_SEARCH,
    getDirectionsRouteBounds,
    getDirectionsWaypointApiCoord,
    selectDirectionsRoute,
} from './directions';
import { currentLocationWaypointNeedsRefresh } from './directions-current-location-sync';
import { makeDirectionsWaypointMarkers } from './directions-waypoint-markers';
import { toggleNearestDrawer } from './navigation';
import {
    getPlaceAddress,
    getPlaceDisplayName,
    getPlaceTypeLabel,
} from './place-formatters';
import {
    createSavedLocationFromPlace,
    createSearchResultFromSavedLocation,
} from './saved-locations';
import { useDirectionsRouteRequest } from './use-directions-route-request';
import { useMapSearchSavedLocations } from './use-map-search-saved-locations';
import { useMapSearchSheetPresentation } from './use-map-search-sheet-presentation';
import { usePlaceAutocomplete } from './use-place-autocomplete';
import { useSelectedPlaceDetails } from './use-selected-place-details';
import { useSelectedPlaceRequest } from './use-selected-place-request';
import { useSubmittedSearch } from './use-submitted-search';
import { useVoiceSearch } from './use-voice-search';

export function useMapSearch({
    directionsDebugGeometryIsEnabled = false,
    directionsRouteCameraPadding,
    directionsRoute,
    directionsRouteSheetProgrammaticDismissRef,
    fitCameraToBounds,
    initialSearchMode = DIRECTIONS_MODE_SEARCH,
    isMountedRef,
    moveCameraToPlace,
    pendingDirectionsRequest,
    pendingSearchResultRestore,
    placeSheetProgrammaticDismissRef,
    searchResultRestoreEnabled = true,
    searchResultsCameraPadding,
    searchSource = 'map',
    setDirectionsRoute,
    setLocalityBoundary,
    setPendingDirectionsRequest,
    setPendingSearchResultRestore,
    userLocation,
}) {
    const navigation = useNavigation();
    const screenIsFocused = useIsFocused();
    const directionsDestinationInputRef = useRef(null);
    const directionsPlaceAbortControllerRef = useRef(null);
    const directionsPlaceRequestIdRef = useRef(0);
    const directionsRouteSheetRef = useRef(null);
    const directionsStartInputRef = useRef(null);
    const directionsStopInputRef = useRef(null);
    const handledPendingDirectionsRequestIdRef = useRef(null);
    const localitySearchAbortControllerRef = useRef(null);
    const searchInputRef = useRef(null);
    const [searchIsFocused, setSearchIsFocused] = useState(false);
    const [searchPageIsVisible, setSearchPageIsVisible] = useState(false);
    const [directionsSearchPageIsVisible, setDirectionsSearchPageIsVisible] =
        useState(false);
    const defaultSearchMode =
        initialSearchMode === DIRECTIONS_MODE_DIRECTIONS
            ? DIRECTIONS_MODE_DIRECTIONS
            : DIRECTIONS_MODE_SEARCH;
    const [searchMode, setSearchMode] = useState(defaultSearchMode);
    const [searchValue, setSearchValue] = useState('');
    const [directionsActiveField, setDirectionsActiveField] = useState(
        DIRECTIONS_FIELD_DESTINATION,
    );
    const [directionsDestinationValue, setDirectionsDestinationValue] =
        useState('');
    const [directionsDestinationWaypoint, setDirectionsDestinationWaypoint] =
        useState(null);
    const [directionsPlaceError, setDirectionsPlaceError] = useState('');
    const [directionsPlaceIsLoading, setDirectionsPlaceIsLoading] =
        useState(false);
    const [directionsRouteError, setDirectionsRouteError] = useState('');
    const [directionsRouteIsLoading, setDirectionsRouteIsLoading] =
        useState(false);
    const [directionsSearchIsFocused, setDirectionsSearchIsFocused] =
        useState(false);
    const [directionsStartValue, setDirectionsStartValue] = useState('');
    const [directionsStartWaypoint, setDirectionsStartWaypoint] =
        useState(null);
    const [directionsStopIsVisible, setDirectionsStopIsVisible] =
        useState(false);
    const [directionsStopValue, setDirectionsStopValue] = useState('');
    const [directionsStopWaypoint, setDirectionsStopWaypoint] = useState(null);
    const [localitySearchError, setLocalitySearchError] = useState('');
    const [localitySearchIsLoading, setLocalitySearchIsLoading] =
        useState(false);
    const [locationAccessSearchValue, setLocationAccessSearchValue] =
        useState('');
    const [selectedSearchResult, setSelectedSearchResult] = useState(null);
    const [selectedPlaceDetails, setSelectedPlaceDetails] = useState(null);
    const [selectedPlaceError, setSelectedPlaceError] = useState('');
    const [selectedPlaceIsLoading, setSelectedPlaceIsLoading] = useState(false);
    const trimmedSearchValue = searchValue.trim();
    const {
        searchError,
        searchIsLoading,
        searchResults,
        setSearchError,
        setSearchIsLoading,
        setSearchResults,
    } = usePlaceAutocomplete({
        isMountedRef,
        searchIsFocused:
            searchMode === DIRECTIONS_MODE_SEARCH && searchIsFocused,
        searchValue,
        userLocation,
    });
    const activeDirectionsValue =
        directionsActiveField === DIRECTIONS_FIELD_START
            ? directionsStartValue
            : directionsActiveField === DIRECTIONS_FIELD_STOP
              ? directionsStopValue
              : directionsDestinationValue;
    const activeDirectionsWaypoint =
        directionsActiveField === DIRECTIONS_FIELD_START
            ? directionsStartWaypoint
            : directionsActiveField === DIRECTIONS_FIELD_STOP
              ? directionsStopWaypoint
              : directionsDestinationWaypoint;
    const directionsCurrentLocationWaypoint = useMemo(
        () => createCurrentLocationDirectionsWaypoint(userLocation),
        [userLocation],
    );
    const directionsAutocompleteValue =
        activeDirectionsWaypoint?.inputValue === activeDirectionsValue
            ? ''
            : activeDirectionsValue;
    const {
        searchError: directionsSearchError,
        searchIsLoading: directionsSearchIsLoading,
        searchResults: directionsSearchResults,
        setSearchError: setDirectionsSearchError,
        setSearchIsLoading: setDirectionsSearchIsLoading,
        setSearchResults: setDirectionsSearchResults,
    } = usePlaceAutocomplete({
        isMountedRef,
        searchIsFocused:
            searchMode === DIRECTIONS_MODE_DIRECTIONS &&
            directionsSearchIsFocused,
        searchValue: directionsAutocompleteValue,
        userLocation,
    });
    const directionsTrimmedSearchValue = directionsAutocompleteValue.trim();
    const {
        handlePlaceSheetDismiss,
        handleSubmittedSearchResultsSheetDismiss,
        placeSheetIsOpenRef,
        placeSheetRef,
        presentPlaceSheet,
        submittedSearchResultsSheetRef,
    } = useMapSearchSheetPresentation({
        selectedPlaceDetails,
        selectedPlaceIsLoading,
        selectedSearchResult,
    });
    // Every programmatic dismiss flags itself so the sheet's `onDismiss` can tell a
    // user drag-to-close (which should tear down navigation state) apart from an
    // internal dismiss during a flow transition (which must preserve it).
    const dismissPlaceSheet = useCallback(() => {
        placeSheetProgrammaticDismissRef.current = true;
        placeSheetRef.current?.dismiss();
    }, [placeSheetProgrammaticDismissRef, placeSheetRef]);
    const dismissDirectionsRouteSheet = useCallback(() => {
        directionsRouteSheetProgrammaticDismissRef.current = true;
        directionsRouteSheetRef.current?.dismiss();
    }, [directionsRouteSheetProgrammaticDismissRef, directionsRouteSheetRef]);
    const {
        applyFavoriteLocations,
        favoriteLocations,
        recentLocations,
        recordRecentLocation,
        toggleSavedLocationFavorite,
    } = useMapSearchSavedLocations({ isMountedRef });
    const { clearSelectedPlaceRequest, requestSelectedPlaceDetails } =
        useSelectedPlaceRequest({
            applyFavoriteLocations,
            isMountedRef,
            moveCameraToPlace,
            recordRecentLocation,
            setSelectedPlaceDetails,
            setSelectedPlaceError,
            setSelectedPlaceIsLoading,
        });
    const {
        resetSubmittedSearch,
        submitSubmittedSearchQuery,
        submittedSearchError,
        submittedSearchIsLoading,
        submittedSearchQuery,
        submittedSearchResults,
    } = useSubmittedSearch({
        clearSelectedPlaceRequest,
        dismissPlaceSheet,
        fitCameraToBounds,
        isMountedRef,
        searchInputRef,
        searchResultsCameraPadding,
        searchSource,
        setSearchIsFocused,
        setSearchValue,
        setSelectedPlaceDetails,
        setSelectedPlaceError,
        setSelectedPlaceIsLoading,
        setSelectedSearchResult,
        userLocation,
    });
    const {
        selectedPlaceAddress,
        selectedPlaceCanReturnToSearchResults,
        selectedPlaceCoordinate,
        selectedPlaceHasDetailBox,
        selectedPlaceHasHoursBox,
        selectedPlaceHeaderSubtitle,
        selectedPlaceCurrentHoursSummary,
        selectedPlaceIsFavorite,
        selectedPlaceName,
        selectedPlaceOpenNowLabel,
        selectedPlacePhoneNumber,
        selectedPlaceRatingLabel,
        selectedPlaceRatingStars,
        selectedPlaceWeekdayDescriptions,
        selectedSavedLocation,
    } = useSelectedPlaceDetails({
        favoriteLocations,
        selectedPlaceDetails,
        selectedSearchResult,
        submittedSearchResults,
    });
    const { clearDirectionsRouteRequest, requestDirectionsRoute } =
        useDirectionsRouteRequest({
            directionsDebugGeometryIsEnabled,
            directionsRouteSheetRef,
            isMountedRef,
            setDirectionsRoute,
            setDirectionsRouteError,
            setDirectionsRouteIsLoading,
            setDirectionsSearchIsFocused,
        });

    const handleSearchChangeCore = useCallback(
        (value) => {
            clearSelectedPlaceRequest();
            resetSubmittedSearch();
            dismissPlaceSheet();
            submittedSearchResultsSheetRef.current?.dismiss();
            setSearchValue(value);
            setSelectedSearchResult(null);
            setSelectedPlaceDetails(null);
            setSelectedPlaceError('');
            setSelectedPlaceIsLoading(false);
            setSearchIsFocused(true);
            setSearchPageIsVisible(true);
        },
        [clearSelectedPlaceRequest, resetSubmittedSearch],
    );
    const {
        abortVoiceSearch,
        handleVoiceSearchPress,
        setVoiceSearchError,
        voiceSearchError,
        voiceSearchIsListening,
    } = useVoiceSearch({
        handleSearchChange: handleSearchChangeCore,
        isMountedRef,
        setSearchIsFocused,
    });

    const setDirectionsFieldState = useCallback((field, value, waypoint) => {
        if (field === DIRECTIONS_FIELD_START) {
            setDirectionsStartValue(value);
            setDirectionsStartWaypoint(waypoint);
            return;
        }

        if (field === DIRECTIONS_FIELD_STOP) {
            setDirectionsStopValue(value);
            setDirectionsStopWaypoint(waypoint);
            return;
        }

        setDirectionsDestinationValue(value);
        setDirectionsDestinationWaypoint(waypoint);
    }, []);

    const clearDirectionsPlaceRequest = useCallback(() => {
        directionsPlaceRequestIdRef.current += 1;

        if (directionsPlaceAbortControllerRef.current) {
            directionsPlaceAbortControllerRef.current.abort();
            directionsPlaceAbortControllerRef.current = null;
        }
    }, []);

    const clearLocalitySearchRequest = useCallback(() => {
        if (localitySearchAbortControllerRef.current) {
            localitySearchAbortControllerRef.current.abort();
            localitySearchAbortControllerRef.current = null;
        }
    }, []);

    const submitZipSearchQuery = useCallback(
        (value) => {
            const query = typeof value === 'string' ? value.trim() : '';

            if (!/^\d{5}(?:-\d{4})?$/.test(query)) {
                return false;
            }

            const safeZip = query.slice(0, 5);
            const abortController = new AbortController();

            abortVoiceSearch();
            clearSelectedPlaceRequest();
            clearLocalitySearchRequest();
            resetSubmittedSearch();
            setSearchValue(safeZip);
            setSearchIsFocused(false);
            setSearchPageIsVisible(false);
            setSearchResults([]);
            setSearchError('');
            setSearchIsLoading(false);
            setSelectedSearchResult(null);
            setSelectedPlaceDetails(null);
            setSelectedPlaceError('');
            setSelectedPlaceIsLoading(false);
            setLocalitySearchError('');
            setLocalitySearchIsLoading(true);
            dismissPlaceSheet();
            submittedSearchResultsSheetRef.current?.dismiss();
            searchInputRef.current?.blur();
            Keyboard.dismiss();

            localitySearchAbortControllerRef.current = abortController;

            getLocalityBoundary({
                signal: abortController.signal,
                zip: safeZip,
            })
                .then((localityBoundary) => {
                    if (
                        !isMountedRef.current ||
                        localitySearchAbortControllerRef.current !==
                            abortController
                    ) {
                        return;
                    }

                    setLocalityBoundary?.(localityBoundary);

                    if (localityBoundary.bounds) {
                        fitCameraToBounds?.(localityBoundary.bounds, {
                            padding: searchResultsCameraPadding,
                        });
                    }
                })
                .catch((error) => {
                    if (error?.name === 'AbortError') {
                        return;
                    }

                    if (
                        isMountedRef.current &&
                        localitySearchAbortControllerRef.current ===
                            abortController
                    ) {
                        setLocalityBoundary?.(null);
                        setLocalitySearchError(
                            error?.message ||
                                'ZIP boundary could not be loaded.',
                        );
                    }
                })
                .finally(() => {
                    if (
                        localitySearchAbortControllerRef.current ===
                        abortController
                    ) {
                        localitySearchAbortControllerRef.current = null;
                    }

                    if (isMountedRef.current) {
                        setLocalitySearchIsLoading(false);
                    }
                });

            return true;
        },
        [
            abortVoiceSearch,
            clearLocalitySearchRequest,
            clearSelectedPlaceRequest,
            fitCameraToBounds,
            isMountedRef,
            resetSubmittedSearch,
            searchResultsCameraPadding,
            setLocalityBoundary,
            setSearchError,
            setSearchIsLoading,
            setSearchResults,
        ],
    );

    useEffect(() => {
        if (!directionsCurrentLocationWaypoint) {
            return;
        }

        if (
            currentLocationWaypointNeedsRefresh({
                currentLocationWaypoint: directionsCurrentLocationWaypoint,
                value: directionsStartValue,
                waypoint: directionsStartWaypoint,
            })
        ) {
            setDirectionsStartWaypoint(directionsCurrentLocationWaypoint);
            setDirectionsStartValue(
                directionsCurrentLocationWaypoint.inputValue,
            );
        }

        if (
            currentLocationWaypointNeedsRefresh({
                currentLocationWaypoint: directionsCurrentLocationWaypoint,
                value: directionsDestinationValue,
                waypoint: directionsDestinationWaypoint,
            })
        ) {
            setDirectionsDestinationWaypoint(directionsCurrentLocationWaypoint);
            setDirectionsDestinationValue(
                directionsCurrentLocationWaypoint.inputValue,
            );
        }
    }, [
        directionsCurrentLocationWaypoint,
        directionsDestinationValue,
        directionsDestinationWaypoint,
        directionsStartValue,
        directionsStartWaypoint,
    ]);

    const handleDrawerPress = useCallback(() => {
        abortVoiceSearch();
        searchInputRef.current?.blur();
        setSearchIsFocused(false);
        setDirectionsSearchIsFocused(false);
        setSearchPageIsVisible(false);
        setDirectionsSearchPageIsVisible(false);
        toggleNearestDrawer(navigation);
    }, [abortVoiceSearch, navigation]);

    const handleSearchFocus = useCallback(() => {
        submittedSearchResultsSheetRef.current?.dismiss();
        setSearchIsFocused(true);
        setSearchPageIsVisible(true);
    }, []);

    const handleSearchChange = useCallback(
        (value) => {
            setVoiceSearchError('');
            handleSearchChangeCore(value);
        },
        [handleSearchChangeCore, setVoiceSearchError],
    );

    const handleSearchBlur = useCallback(() => {
        // Keep suggestions visible when the keyboard is dismissed; explicit
        // dismiss, clear, and selection actions collapse search mode.
    }, []);

    const handleSearchDismiss = useCallback(() => {
        abortVoiceSearch();
        searchInputRef.current?.blur();
        Keyboard.dismiss();
        setSearchIsFocused(false);
        setSearchPageIsVisible(false);
        setSearchResults([]);
        setSearchError('');
        setSearchIsLoading(false);

        if (!selectedSearchResult) {
            resetSubmittedSearch();
            setSearchValue('');
        }
    }, [
        abortVoiceSearch,
        resetSubmittedSearch,
        selectedSearchResult,
        setSearchError,
        setSearchIsLoading,
        setSearchResults,
    ]);

    const submitSearchQuery = useCallback(
        (value) => {
            const query = typeof value === 'string' ? value.trim() : '';

            if (!query) {
                return false;
            }

            if (submitZipSearchQuery(query)) {
                return true;
            }

            abortVoiceSearch();
            setLocalityBoundary?.(null);
            setLocalitySearchError('');
            setSearchPageIsVisible(true);
            submitSubmittedSearchQuery(query);
            return true;
        },
        [
            abortVoiceSearch,
            setLocalityBoundary,
            submitSubmittedSearchQuery,
            submitZipSearchQuery,
        ],
    );

    const handleSearchSubmit = useCallback(() => {
        submitSearchQuery(searchValue);
    }, [searchValue, submitSearchQuery]);

    const handleDestinationCategoryPress = useCallback(
        (query) => {
            setSearchValue(query);
            setSearchIsFocused(true);
            setSearchPageIsVisible(true);
            submitSearchQuery(query);
        },
        [submitSearchQuery],
    );

    const handleDirectionsModePress = useCallback(() => {
        abortVoiceSearch();
        clearDirectionsPlaceRequest();

        const shouldUseCurrentLocation =
            directionsCurrentLocationWaypoint &&
            (!directionsStartWaypoint ||
                directionsStartWaypoint.kind ===
                    CURRENT_LOCATION_DIRECTIONS_WAYPOINT_ID ||
                !directionsStartValue.trim());
        const shouldFocusStart =
            !shouldUseCurrentLocation && !directionsStartWaypoint;
        const nextActiveField = shouldFocusStart
            ? DIRECTIONS_FIELD_START
            : DIRECTIONS_FIELD_DESTINATION;

        if (shouldUseCurrentLocation) {
            setDirectionsStartValue(
                directionsCurrentLocationWaypoint.inputValue,
            );
            setDirectionsStartWaypoint(directionsCurrentLocationWaypoint);
        }

        setDirectionsActiveField(nextActiveField);
        setDirectionsPlaceError('');
        setDirectionsPlaceIsLoading(false);
        setDirectionsRouteError('');
        setDirectionsSearchError('');
        setDirectionsSearchIsFocused(false);
        setDirectionsSearchPageIsVisible(false);
        setSearchIsFocused(false);
        setSearchMode(DIRECTIONS_MODE_DIRECTIONS);
        dismissPlaceSheet();
        submittedSearchResultsSheetRef.current?.dismiss();
        searchInputRef.current?.blur();

        directionsStartInputRef.current?.blur();
        directionsDestinationInputRef.current?.blur();
    }, [
        abortVoiceSearch,
        clearDirectionsPlaceRequest,
        directionsCurrentLocationWaypoint,
        directionsStartValue,
        directionsStartWaypoint,
        setDirectionsSearchError,
    ]);

    const handleDirectionsFieldFocus = useCallback(
        (field) => {
            abortVoiceSearch();
            setSearchMode(DIRECTIONS_MODE_DIRECTIONS);
            setDirectionsActiveField(field);
            setDirectionsPlaceError('');
            setDirectionsRouteError('');
            setDirectionsSearchIsFocused(true);
            setDirectionsSearchPageIsVisible(true);
            setSearchIsFocused(false);
        },
        [abortVoiceSearch],
    );

    const handleDirectionsFieldChange = useCallback(
        (field, value) => {
            clearDirectionsPlaceRequest();
            setDirectionsActiveField(field);
            setDirectionsFieldState(field, value, null);
            setDirectionsPlaceError('');
            setDirectionsPlaceIsLoading(false);
            setDirectionsRouteError('');
            setDirectionsSearchIsFocused(true);
        },
        [clearDirectionsPlaceRequest, setDirectionsFieldState],
    );

    const handleDirectionsFieldClear = useCallback(
        (field) => {
            clearDirectionsPlaceRequest();
            setDirectionsActiveField(field);
            setDirectionsFieldState(field, '', null);
            setDirectionsPlaceError('');
            setDirectionsPlaceIsLoading(false);
            setDirectionsRouteError('');
            setDirectionsSearchError('');
            setDirectionsSearchIsLoading(false);
            setDirectionsSearchResults([]);
            setDirectionsSearchIsFocused(true);
            setDirectionsSearchPageIsVisible(true);
            setSearchIsFocused(false);
            setSearchMode(DIRECTIONS_MODE_DIRECTIONS);

            requestAnimationFrame(() => {
                const nextInputRef =
                    field === DIRECTIONS_FIELD_START
                        ? directionsStartInputRef
                        : field === DIRECTIONS_FIELD_STOP
                          ? directionsStopInputRef
                          : directionsDestinationInputRef;

                nextInputRef.current?.focus();
            });
        },
        [
            clearDirectionsPlaceRequest,
            setDirectionsFieldState,
            setDirectionsSearchError,
            setDirectionsSearchIsLoading,
            setDirectionsSearchResults,
        ],
    );

    const handleDirectionsStartChange = useCallback(
        (value) => {
            handleDirectionsFieldChange(DIRECTIONS_FIELD_START, value);
        },
        [handleDirectionsFieldChange],
    );

    const handleDirectionsStartClear = useCallback(() => {
        handleDirectionsFieldClear(DIRECTIONS_FIELD_START);
    }, [handleDirectionsFieldClear]);

    const handleDirectionsDestinationChange = useCallback(
        (value) => {
            handleDirectionsFieldChange(DIRECTIONS_FIELD_DESTINATION, value);
        },
        [handleDirectionsFieldChange],
    );

    const handleDirectionsDestinationClear = useCallback(() => {
        handleDirectionsFieldClear(DIRECTIONS_FIELD_DESTINATION);
    }, [handleDirectionsFieldClear]);

    const handleDirectionsStopChange = useCallback(
        (value) => {
            handleDirectionsFieldChange(DIRECTIONS_FIELD_STOP, value);
        },
        [handleDirectionsFieldChange],
    );

    const handleDirectionsStopClear = useCallback(() => {
        handleDirectionsFieldClear(DIRECTIONS_FIELD_STOP);
    }, [handleDirectionsFieldClear]);

    const handleDirectionsStopRemove = useCallback(() => {
        clearDirectionsPlaceRequest();
        setDirectionsStopIsVisible(false);
        setDirectionsStopValue('');
        setDirectionsStopWaypoint(null);
        setDirectionsPlaceError('');
        setDirectionsPlaceIsLoading(false);
        setDirectionsRouteError('');
        setDirectionsSearchError('');
        setDirectionsSearchIsLoading(false);
        setDirectionsSearchResults([]);

        if (directionsActiveField === DIRECTIONS_FIELD_STOP) {
            setDirectionsActiveField(DIRECTIONS_FIELD_DESTINATION);
            setDirectionsSearchIsFocused(false);
            setDirectionsSearchPageIsVisible(false);
            directionsStopInputRef.current?.blur();
            directionsDestinationInputRef.current?.blur();
            Keyboard.dismiss();
        }
    }, [
        clearDirectionsPlaceRequest,
        directionsActiveField,
        setDirectionsSearchError,
        setDirectionsSearchIsLoading,
        setDirectionsSearchResults,
    ]);

    const handleDirectionsAddStopPress = useCallback(() => {
        setDirectionsStopIsVisible(true);
        setDirectionsActiveField(DIRECTIONS_FIELD_STOP);
        setDirectionsPlaceError('');
        setDirectionsRouteError('');
        setDirectionsSearchIsFocused(true);
        setDirectionsSearchPageIsVisible(true);
        setSearchIsFocused(false);
        setSearchMode(DIRECTIONS_MODE_DIRECTIONS);

        requestAnimationFrame(() => {
            directionsStopInputRef.current?.focus();
        });
    }, []);

    const handleDirectionsSearchDismiss = useCallback(() => {
        directionsStartInputRef.current?.blur();
        directionsStopInputRef.current?.blur();
        directionsDestinationInputRef.current?.blur();
        Keyboard.dismiss();
        setDirectionsSearchIsFocused(false);
        setDirectionsSearchPageIsVisible(false);
    }, []);

    const handleLocationAccessSearchChange = useCallback((value) => {
        setLocationAccessSearchValue(value);
    }, []);

    const handleLocationAccessSearchSubmit = useCallback(() => {
        const query = locationAccessSearchValue.trim();

        if (!query) {
            return false;
        }

        submitSearchQuery(query);

        return true;
    }, [locationAccessSearchValue, submitSearchQuery]);

    const applyDirectionsWaypoint = useCallback(
        (field, waypoint) => {
            if (!waypoint) {
                return;
            }

            setDirectionsFieldState(field, waypoint.inputValue, waypoint);
            setDirectionsSearchResults([]);
            setDirectionsSearchError('');
            setDirectionsSearchIsLoading(false);
            setDirectionsPlaceError('');
            setDirectionsPlaceIsLoading(false);
            setDirectionsSearchIsFocused(false);
            setDirectionsSearchPageIsVisible(false);
            Keyboard.dismiss();
        },
        [
            setDirectionsFieldState,
            setDirectionsSearchError,
            setDirectionsSearchIsLoading,
            setDirectionsSearchResults,
        ],
    );

    const handleDirectionsCurrentLocationPress = useCallback(() => {
        if (!directionsCurrentLocationWaypoint) {
            return;
        }

        applyDirectionsWaypoint(
            directionsActiveField,
            directionsCurrentLocationWaypoint,
        );
    }, [
        applyDirectionsWaypoint,
        directionsActiveField,
        directionsCurrentLocationWaypoint,
    ]);

    const handleDirectionsSearchResultPress = useCallback(
        (result) => {
            const field = directionsActiveField;
            const requestId = directionsPlaceRequestIdRef.current + 1;
            const abortController = new AbortController();

            clearDirectionsPlaceRequest();
            directionsPlaceRequestIdRef.current = requestId;
            directionsPlaceAbortControllerRef.current = abortController;

            setDirectionsFieldState(
                field,
                result.label || result.primaryText || '',
                null,
            );
            setDirectionsSearchResults([]);
            setDirectionsSearchError('');
            setDirectionsPlaceError('');
            setDirectionsPlaceIsLoading(true);
            setDirectionsSearchIsFocused(false);
            setDirectionsSearchPageIsVisible(false);
            Keyboard.dismiss();

            getPlaceDetails({
                placeId: result.placeId,
                signal: abortController.signal,
            })
                .then((place) => {
                    if (
                        !isMountedRef.current ||
                        directionsPlaceRequestIdRef.current !== requestId
                    ) {
                        return;
                    }

                    const waypoint = createPlaceDirectionsWaypoint({
                        address: getPlaceAddress(place, result),
                        name: getPlaceDisplayName(place, result),
                        place,
                        result,
                    });

                    if (!waypoint) {
                        throw new Error('Place location could not be loaded.');
                    }

                    applyDirectionsWaypoint(field, waypoint);
                    recordRecentLocation(
                        createSavedLocationFromPlace({
                            address: getPlaceAddress(place, result),
                            name: getPlaceDisplayName(place, result),
                            place,
                            result,
                            typeLabel: getPlaceTypeLabel(place),
                        }),
                    );
                })
                .catch((error) => {
                    if (error?.name === 'AbortError') {
                        return;
                    }

                    if (
                        isMountedRef.current &&
                        directionsPlaceRequestIdRef.current === requestId
                    ) {
                        setDirectionsPlaceError(
                            error?.message ||
                                'Place location could not be loaded.',
                        );
                    }
                })
                .finally(() => {
                    if (
                        directionsPlaceAbortControllerRef.current ===
                        abortController
                    ) {
                        directionsPlaceAbortControllerRef.current = null;
                    }

                    if (
                        isMountedRef.current &&
                        directionsPlaceRequestIdRef.current === requestId
                    ) {
                        setDirectionsPlaceIsLoading(false);
                    }
                });
        },
        [
            applyDirectionsWaypoint,
            clearDirectionsPlaceRequest,
            directionsActiveField,
            isMountedRef,
            recordRecentLocation,
            setDirectionsFieldState,
            setDirectionsSearchError,
            setDirectionsSearchResults,
        ],
    );

    const handleDirectionsSavedLocationPress = useCallback(
        (location) => {
            const result = createSearchResultFromSavedLocation(location);

            if (result) {
                handleDirectionsSearchResultPress(result);
            }
        },
        [handleDirectionsSearchResultPress],
    );

    const handleDirectionsSwapPress = useCallback(() => {
        setDirectionsStartValue(directionsDestinationValue);
        setDirectionsDestinationValue(directionsStartValue);
        setDirectionsStartWaypoint(directionsDestinationWaypoint);
        setDirectionsDestinationWaypoint(directionsStartWaypoint);
        setDirectionsActiveField((field) =>
            field === DIRECTIONS_FIELD_START
                ? DIRECTIONS_FIELD_DESTINATION
                : DIRECTIONS_FIELD_START,
        );
        setDirectionsPlaceError('');
        setDirectionsRouteError('');
    }, [
        directionsDestinationValue,
        directionsDestinationWaypoint,
        directionsStartValue,
        directionsStartWaypoint,
    ]);

    const handleSearchResultPress = useCallback(
        (result, selectionSource = 'autocomplete') => {
            abortVoiceSearch();
            logMapPlaceSelected({ result, source: selectionSource });

            setSearchValue(result.label || result.primaryText);
            setSearchResults([]);
            setSearchError('');
            setSelectedSearchResult(result);
            setSearchIsFocused(false);
            setSearchPageIsVisible(false);
            recordRecentLocation(createSavedLocationFromPlace({ result }));
            submittedSearchResultsSheetRef.current?.dismiss();
            searchInputRef.current?.blur();
            Keyboard.dismiss();
            requestSelectedPlaceDetails(result);
        },
        [
            abortVoiceSearch,
            requestSelectedPlaceDetails,
            recordRecentLocation,
            setSearchError,
            setSearchResults,
        ],
    );

    const handleSavedLocationPress = useCallback(
        (location) => {
            const result = createSearchResultFromSavedLocation(location);

            if (result) {
                handleSearchResultPress(result, 'saved_location');
            }
        },
        [handleSearchResultPress],
    );

    const handleClearSelectedSearchResult = useCallback(() => {
        abortVoiceSearch();
        clearSelectedPlaceRequest();
        resetSubmittedSearch();
        setSearchValue('');
        setSearchResults([]);
        setSearchError('');
        setSearchIsLoading(false);
        setLocalityBoundary?.(null);
        setLocalitySearchError('');
        setLocalitySearchIsLoading(false);
        setVoiceSearchError('');
        setSelectedSearchResult(null);
        setSelectedPlaceDetails(null);
        setSelectedPlaceError('');
        setSelectedPlaceIsLoading(false);
        setSearchIsFocused(false);
        setSearchPageIsVisible(false);
        dismissPlaceSheet();
        submittedSearchResultsSheetRef.current?.dismiss();
        searchInputRef.current?.blur();
        Keyboard.dismiss();
    }, [
        abortVoiceSearch,
        clearSelectedPlaceRequest,
        resetSubmittedSearch,
        setSearchError,
        setSearchIsLoading,
        setSearchResults,
        setVoiceSearchError,
        setLocalityBoundary,
    ]);

    useEffect(() => {
        if (
            !searchResultRestoreEnabled ||
            !screenIsFocused ||
            !pendingSearchResultRestore
        ) {
            return;
        }

        const result = pendingSearchResultRestore.result;
        const place = pendingSearchResultRestore.place ?? null;

        setPendingSearchResultRestore?.(null);

        abortVoiceSearch();
        clearDirectionsPlaceRequest();
        clearSelectedPlaceRequest();
        resetSubmittedSearch();
        clearDirectionsRouteRequest();

        setDirectionsActiveField(DIRECTIONS_FIELD_DESTINATION);
        setDirectionsDestinationValue('');
        setDirectionsDestinationWaypoint(null);
        setDirectionsPlaceError('');
        setDirectionsPlaceIsLoading(false);
        setDirectionsRouteError('');
        setDirectionsRouteIsLoading(false);
        setDirectionsSearchError('');
        setDirectionsSearchIsFocused(false);
        setDirectionsSearchPageIsVisible(false);
        setDirectionsSearchIsLoading(false);
        setDirectionsSearchResults([]);
        setDirectionsStartValue('');
        setDirectionsStartWaypoint(null);
        setDirectionsStopIsVisible(false);
        setDirectionsStopValue('');
        setDirectionsStopWaypoint(null);
        setPendingDirectionsRequest?.(null);
        setSearchMode(DIRECTIONS_MODE_SEARCH);

        if (!result) {
            setSearchIsFocused(false);
            submittedSearchResultsSheetRef.current?.dismiss();
            dismissDirectionsRouteSheet();
            directionsStartInputRef.current?.blur();
            directionsStopInputRef.current?.blur();
            directionsDestinationInputRef.current?.blur();
            searchInputRef.current?.blur();
            Keyboard.dismiss();
            return;
        }

        setSearchValue(result.label || result.primaryText || '');
        setSearchResults([]);
        setSearchError('');
        setSearchIsLoading(false);
        setVoiceSearchError('');
        setSelectedSearchResult(result);
        setSelectedPlaceDetails(place);
        setSelectedPlaceError('');
        setSelectedPlaceIsLoading(false);
        setSearchIsFocused(false);
        setSearchPageIsVisible(false);

        submittedSearchResultsSheetRef.current?.dismiss();
        dismissDirectionsRouteSheet();
        directionsStartInputRef.current?.blur();
        directionsStopInputRef.current?.blur();
        directionsDestinationInputRef.current?.blur();
        searchInputRef.current?.blur();
        Keyboard.dismiss();

        if (place) {
            moveCameraToPlace(place);
        }
    }, [
        abortVoiceSearch,
        clearDirectionsPlaceRequest,
        clearSelectedPlaceRequest,
        clearDirectionsRouteRequest,
        resetSubmittedSearch,
        moveCameraToPlace,
        pendingSearchResultRestore,
        screenIsFocused,
        searchResultRestoreEnabled,
        setDirectionsSearchError,
        setDirectionsSearchIsLoading,
        setDirectionsSearchResults,
        setPendingDirectionsRequest,
        setPendingSearchResultRestore,
        setSearchError,
        setSearchIsLoading,
        setSearchResults,
        setVoiceSearchError,
    ]);

    const handleMapPress = useCallback(() => {
        if (selectedSearchResult && !placeSheetIsOpenRef.current) {
            presentPlaceSheet();
            return;
        }

        if (directionsRoute) {
            directionsRouteSheetRef.current?.present();
        }
    }, [directionsRoute, presentPlaceSheet, selectedSearchResult]);

    const handleSelectedPlaceMarkerPress = useCallback(() => {
        if (selectedSearchResult) {
            presentPlaceSheet();
        }
    }, [presentPlaceSheet, selectedSearchResult]);

    const handleSelectedPlaceAvatarPress = useCallback(() => {
        if (selectedPlaceDetails?.location) {
            moveCameraToPlace(selectedPlaceDetails);
        }
    }, [moveCameraToPlace, selectedPlaceDetails]);

    const handleSelectedPlaceBackToSearchResults = useCallback(() => {
        if (submittedSearchResults.length === 0) {
            return;
        }

        placeSheetIsOpenRef.current = false;
        dismissPlaceSheet();
        setSearchMode(DIRECTIONS_MODE_SEARCH);
        setSearchIsFocused(true);
        setSearchPageIsVisible(true);
    }, [submittedSearchResults.length]);

    const handleSubmittedSearchResultPress = useCallback(
        (result) => {
            handleSearchResultPress(result, 'submitted_search_results');
        },
        [handleSearchResultPress],
    );

    const handleOpenSelectedPlaceWebsite = useCallback(() => {
        const websiteUri = selectedPlaceDetails?.websiteUri;

        if (websiteUri) {
            logMapSelectedPlaceWebsiteOpened({
                place: selectedPlaceDetails,
                result: selectedSearchResult,
            });
            Linking.openURL(websiteUri).catch(() => {});
        }
    }, [selectedPlaceDetails, selectedSearchResult]);

    useEffect(
        () => () => {
            if (directionsPlaceAbortControllerRef.current) {
                directionsPlaceAbortControllerRef.current.abort();
                directionsPlaceAbortControllerRef.current = null;
            }
            clearLocalitySearchRequest();
            clearDirectionsRouteRequest();
        },
        [clearDirectionsRouteRequest, clearLocalitySearchRequest],
    );

    const directionsStartApiCoord = useMemo(
        () => getDirectionsWaypointApiCoord(directionsStartWaypoint),
        [directionsStartWaypoint],
    );
    const directionsDestinationApiCoord = useMemo(
        () => getDirectionsWaypointApiCoord(directionsDestinationWaypoint),
        [directionsDestinationWaypoint],
    );
    const directionsStopWaypoints = useMemo(
        () => (directionsStopWaypoint ? [directionsStopWaypoint] : []),
        [directionsStopWaypoint],
    );
    const directionsStopCanSubmit =
        !directionsStopIsVisible ||
        !directionsStopValue.trim() ||
        Boolean(directionsStopWaypoint);
    const directionsRouteCanSubmit = Boolean(
        directionsStartApiCoord &&
        directionsDestinationApiCoord &&
        directionsStopCanSubmit &&
        !directionsPlaceIsLoading &&
        !directionsRouteIsLoading,
    );
    const directionsWaypointMarkers = useMemo(
        () =>
            makeDirectionsWaypointMarkers({
                directionsDestinationWaypoint,
                directionsRoute,
                directionsStartWaypoint,
                directionsStopWaypoints,
                searchMode,
            }),
        [
            directionsDestinationWaypoint,
            directionsRoute,
            directionsStartWaypoint,
            directionsStopWaypoints,
            searchMode,
        ],
    );

    const handleGetDirectionsToSelectedPlace = useCallback(() => {
        const destinationWaypoint = createPlaceDirectionsWaypoint({
            address: selectedPlaceAddress,
            name: selectedPlaceName,
            place: selectedPlaceDetails,
            result: selectedSearchResult,
        });

        if (!destinationWaypoint) {
            setSelectedPlaceError('Place location could not be loaded.');
            return;
        }

        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const request = {
            destinationWaypoint,
            id: requestId,
        };

        setPendingDirectionsRequest?.(request);

        setSearchIsFocused(false);
        dismissPlaceSheet();
        searchInputRef.current?.blur();
        Keyboard.dismiss();
    }, [
        selectedPlaceAddress,
        selectedPlaceDetails,
        selectedPlaceName,
        selectedSearchResult,
        setPendingDirectionsRequest,
    ]);

    const handleDirectionsModeDismiss = useCallback(() => {
        abortVoiceSearch();
        clearDirectionsPlaceRequest();
        clearDirectionsRouteRequest();

        setDirectionsActiveField(DIRECTIONS_FIELD_DESTINATION);
        setDirectionsDestinationValue('');
        setDirectionsDestinationWaypoint(null);
        setDirectionsPlaceError('');
        setDirectionsPlaceIsLoading(false);
        setDirectionsRoute(null);
        setDirectionsRouteError('');
        setDirectionsRouteIsLoading(false);
        setDirectionsSearchError('');
        setDirectionsSearchIsFocused(false);
        setDirectionsSearchPageIsVisible(false);
        setDirectionsSearchIsLoading(false);
        setDirectionsSearchResults([]);
        setDirectionsStartValue('');
        setDirectionsStartWaypoint(null);
        setDirectionsStopIsVisible(false);
        setDirectionsStopValue('');
        setDirectionsStopWaypoint(null);
        setPendingDirectionsRequest?.(null);
        setSearchMode(defaultSearchMode);
        dismissDirectionsRouteSheet();
        directionsStartInputRef.current?.blur();
        directionsStopInputRef.current?.blur();
        directionsDestinationInputRef.current?.blur();
        Keyboard.dismiss();

        if (selectedSearchResult) {
            presentPlaceSheet();
            setTimeout(presentPlaceSheet, 300);
        }
    }, [
        abortVoiceSearch,
        clearDirectionsPlaceRequest,
        clearDirectionsRouteRequest,
        defaultSearchMode,
        presentPlaceSheet,
        selectedSearchResult,
        setDirectionsRoute,
        setDirectionsSearchError,
        setDirectionsSearchIsLoading,
        setPendingDirectionsRequest,
        setDirectionsSearchResults,
    ]);

    useEffect(() => {
        if (
            !screenIsFocused ||
            !pendingDirectionsRequest?.destinationWaypoint ||
            handledPendingDirectionsRequestIdRef.current ===
                pendingDirectionsRequest.id
        ) {
            return;
        }

        handledPendingDirectionsRequestIdRef.current =
            pendingDirectionsRequest.id;

        const destinationWaypoint =
            pendingDirectionsRequest.destinationWaypoint;
        const shouldUseCurrentLocation =
            directionsCurrentLocationWaypoint &&
            (!directionsStartWaypoint ||
                directionsStartWaypoint.kind ===
                    CURRENT_LOCATION_DIRECTIONS_WAYPOINT_ID ||
                !directionsStartValue.trim());
        const startWaypoint = shouldUseCurrentLocation
            ? directionsCurrentLocationWaypoint
            : directionsStartWaypoint;

        if (shouldUseCurrentLocation) {
            setDirectionsStartValue(
                directionsCurrentLocationWaypoint.inputValue,
            );
            setDirectionsStartWaypoint(directionsCurrentLocationWaypoint);
        }

        setDirectionsDestinationValue(destinationWaypoint.inputValue);
        setDirectionsDestinationWaypoint(destinationWaypoint);
        setDirectionsActiveField(
            startWaypoint
                ? DIRECTIONS_FIELD_DESTINATION
                : DIRECTIONS_FIELD_START,
        );
        setDirectionsPlaceError('');
        setDirectionsRouteError('');
        setDirectionsSearchError('');
        setDirectionsSearchIsFocused(!startWaypoint);
        setDirectionsSearchPageIsVisible(!startWaypoint);
        setSearchIsFocused(false);
        setSearchMode(DIRECTIONS_MODE_DIRECTIONS);
        setPendingDirectionsRequest?.(null);
        directionsStartInputRef.current?.blur();
        directionsDestinationInputRef.current?.blur();
        Keyboard.dismiss();

        if (startWaypoint) {
            requestDirectionsRoute({
                destinationWaypoint,
                source: 'selected_place',
                startWaypoint,
            });
            return;
        }

        requestAnimationFrame(() => {
            directionsStartInputRef.current?.focus();
        });
    }, [
        directionsCurrentLocationWaypoint,
        directionsStartValue,
        directionsStartWaypoint,
        pendingDirectionsRequest,
        requestDirectionsRoute,
        screenIsFocused,
        setDirectionsSearchError,
        setPendingDirectionsRequest,
    ]);

    const handleDirectionsSubmit = useCallback(() => {
        if (!directionsStartApiCoord || !directionsDestinationApiCoord) {
            setDirectionsRouteError('Choose both a start and destination.');
            return;
        }

        requestDirectionsRoute({
            destinationWaypoint: directionsDestinationWaypoint,
            source: 'directions_form',
            startWaypoint: directionsStartWaypoint,
            stopWaypoints: directionsStopWaypoints,
        });
    }, [
        directionsDestinationApiCoord,
        directionsDestinationWaypoint,
        directionsStartApiCoord,
        directionsStartWaypoint,
        directionsStopWaypoints,
        requestDirectionsRoute,
    ]);

    const handleDirectionsRouteRecenter = useCallback(() => {
        const bounds =
            directionsRoute?.bounds ??
            getDirectionsRouteBounds(directionsRoute);

        if (bounds) {
            fitCameraToBounds?.(bounds, {
                padding: directionsRouteCameraPadding,
            });
        }
    }, [directionsRoute, directionsRouteCameraPadding, fitCameraToBounds]);

    const handleDirectionsRouteSelect = useCallback(
        (routeKey) => {
            const nextRoute = selectDirectionsRoute(directionsRoute, routeKey);
            const bounds =
                nextRoute?.bounds ?? getDirectionsRouteBounds(nextRoute);

            setDirectionsRoute(nextRoute);
            logMapDirectionsRouteSelected({ routeKey });

            if (bounds) {
                fitCameraToBounds?.(bounds, {
                    padding: directionsRouteCameraPadding,
                });
            }
        },
        [
            directionsRoute,
            directionsRouteCameraPadding,
            fitCameraToBounds,
            setDirectionsRoute,
        ],
    );

    const handleToggleSelectedPlaceFavorite = useCallback(() => {
        toggleSavedLocationFavorite(selectedSavedLocation);
    }, [selectedSavedLocation, toggleSavedLocationFavorite]);

    return {
        directionsActiveField,
        directionsCurrentLocationWaypoint,
        directionsDestinationInputRef,
        directionsDestinationValue,
        directionsDestinationWaypoint,
        directionsModeIsDefault:
            defaultSearchMode === DIRECTIONS_MODE_DIRECTIONS,
        directionsPlaceError,
        directionsPlaceIsLoading,
        directionsRoute,
        directionsRouteCanSubmit,
        directionsRouteError,
        directionsRouteIsLoading,
        directionsRouteSheetRef,
        directionsSearchError,
        directionsSearchIsFocused,
        directionsSearchPageIsVisible,
        directionsSearchIsLoading,
        directionsSearchResults,
        directionsStartInputRef,
        directionsStartValue,
        directionsStartWaypoint,
        directionsStopInputRef,
        directionsStopIsVisible,
        directionsStopValue,
        directionsStopWaypoint,
        directionsTrimmedSearchValue,
        directionsWaypointMarkers,
        dismissDirectionsRouteSheet,
        dismissPlaceSheet,
        favoriteLocations,
        handleClearSelectedSearchResult,
        handleDirectionsAddStopPress,
        handleDirectionsCurrentLocationPress,
        handleDestinationCategoryPress,
        handleDirectionsDestinationClear,
        handleDirectionsDestinationChange,
        handleDirectionsFieldFocus,
        handleDirectionsModePress,
        handleDirectionsModeDismiss,
        handleDirectionsRouteRecenter,
        handleDirectionsRouteSelect,
        handleDirectionsSavedLocationPress,
        handleDirectionsSearchDismiss,
        handleDirectionsSearchResultPress,
        handleDirectionsStartClear,
        handleDirectionsStartChange,
        handleDirectionsStopClear,
        handleDirectionsStopChange,
        handleDirectionsStopRemove,
        handleDirectionsSubmit,
        handleDirectionsSwapPress,
        handleDrawerPress,
        handleGetDirectionsToSelectedPlace,
        handleLocationAccessSearchChange,
        handleLocationAccessSearchSubmit,
        handleMapPress,
        handleOpenSelectedPlaceWebsite,
        handlePlaceSheetDismiss,
        handleSavedLocationPress,
        handleSearchBlur,
        handleSearchChange,
        handleSearchDismiss,
        handleSearchFocus,
        handleSearchResultPress,
        handleSearchSubmit,
        handleSelectedPlaceBackToSearchResults,
        handleSelectedPlaceAvatarPress,
        handleSelectedPlaceMarkerPress,
        handleSubmittedSearchResultPress,
        handleSubmittedSearchResultsSheetDismiss,
        handleToggleSelectedPlaceFavorite,
        handleVoiceSearchPress,
        handleZipSearchSubmit: submitZipSearchQuery,
        locationAccessSearchValue,
        localitySearchError,
        localitySearchIsLoading,
        placeSheetRef,
        recentLocations,
        searchMode,
        searchError,
        searchInputRef,
        searchIsFocused,
        searchPageIsVisible,
        searchIsLoading,
        searchResults,
        searchValue,
        selectedPlaceAddress,
        selectedPlaceCanReturnToSearchResults,
        selectedPlaceCoordinate,
        selectedPlaceDetails,
        selectedPlaceError,
        selectedPlaceHasDetailBox,
        selectedPlaceHasHoursBox,
        selectedPlaceCurrentHoursSummary,
        selectedPlaceHeaderSubtitle,
        selectedPlaceIsFavorite,
        selectedPlaceIsLoading,
        selectedPlaceName,
        selectedPlaceOpenNowLabel,
        selectedPlacePhoneNumber,
        selectedPlaceRatingLabel,
        selectedPlaceRatingStars,
        selectedPlaceWeekdayDescriptions,
        selectedSearchResult,
        submittedSearchError,
        submittedSearchIsLoading,
        submittedSearchQuery,
        submittedSearchResults,
        submittedSearchResultsSheetRef,
        trimmedSearchValue,
        voiceSearchError,
        voiceSearchIsListening,
    };
}
