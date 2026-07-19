export const AUTO_PLAY_TRIP_PREVIEW_TEXT_CONFIGURATION = Object.freeze({
    additionalRoutesButtonTitle: 'Route options',
    overviewButtonTitle: 'Overview',
    startButtonTitle: 'Start',
    travelEstimatesTitle: 'Arrive',
});

export function getAutoPlaySearchLoadingCopy(query) {
    const normalizedQuery = String(query ?? '').trim();

    return {
        detailedText: normalizedQuery
            ? `Looking for places matching "${normalizedQuery}".`
            : 'Loading search results.',
        title: 'Searching...',
    };
}

export function autoPlaySearchRequestIsCurrent(currentRequest, request) {
    return currentRequest === request && request?.signal?.aborted !== true;
}

function normalizeAutoPlaySearchText(searchText) {
    return String(searchText ?? '').trim();
}

export function createAutoPlaySearchCallbackState() {
    let activeSubmissionToken = null;
    let nextSubmissionToken = 0;
    let submittedSearchText = '';

    return {
        handleSearchTextChanged(searchText) {
            const normalizedSearchText =
                normalizeAutoPlaySearchText(searchText);
            const normalizedComparison = normalizedSearchText.toLowerCase();
            const submittedComparison = submittedSearchText.toLowerCase();
            const isLateSubmittedChange = Boolean(
                submittedSearchText &&
                (!normalizedSearchText ||
                    submittedComparison.startsWith(normalizedComparison)),
            );

            if (!isLateSubmittedChange) {
                activeSubmissionToken = null;
                submittedSearchText = '';
            }

            return {
                ignored: isLateSubmittedChange,
                searchText: normalizedSearchText,
            };
        },
        handleSearchTextSubmitted(searchText) {
            nextSubmissionToken += 1;
            activeSubmissionToken = nextSubmissionToken;
            submittedSearchText = normalizeAutoPlaySearchText(searchText);

            return {
                searchText: submittedSearchText,
                submissionToken: activeSubmissionToken,
            };
        },
        handleSearchTextSubmissionCompleted(submissionToken) {
            if (activeSubmissionToken !== submissionToken) {
                return;
            }

            activeSubmissionToken = null;
            submittedSearchText = '';
        },
    };
}

export function getAutoPlayHeaderButtonVisibility({
    hasActiveNavigation,
    usesHeaderDrivingModeButton = true,
    usesHeaderExitNavigationButton = false,
}) {
    const navigationExitButtonIsVisible = Boolean(
        usesHeaderExitNavigationButton && hasActiveNavigation,
    );

    return {
        navigationExitButtonIsVisible,
        trailingNavigationButtonIsVisible:
            navigationExitButtonIsVisible || usesHeaderDrivingModeButton,
    };
}

export function makeAutoPlayTripSteps({
    destinationStep,
    includeOrigin = false,
    maneuverSteps,
    maxSteps = 12,
    originStep,
}) {
    if (includeOrigin && (!originStep || !destinationStep)) {
        return [];
    }

    const steps = [...(maneuverSteps ?? [])].filter(Boolean);

    if (destinationStep) {
        steps.push(destinationStep);
    }

    if (includeOrigin && originStep) {
        steps.unshift(originStep);
    }

    if (steps.length < 2) {
        if (!includeOrigin && originStep) {
            steps.unshift(originStep);
        }

        if (destinationStep && steps.at(-1) !== destinationStep) {
            steps.push(destinationStep);
        }
    }

    if (steps.length <= maxSteps) {
        return steps;
    }

    return [...steps.slice(0, maxSteps - 1), steps[steps.length - 1]];
}

function getNonnegativeRouteValue(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}

export function getAutoPlayTripEstimateValues(routeOption) {
    const maneuvers = [...(routeOption?.maneuvers ?? [])];
    const maneuverDistanceTotal = maneuvers.reduce(
        (total, maneuver) =>
            total + getNonnegativeRouteValue(maneuver?.distance),
        0,
    );
    const maneuverDurationTotal = maneuvers.reduce(
        (total, maneuver) =>
            total + getNonnegativeRouteValue(maneuver?.duration),
        0,
    );
    const routeDistance = getNonnegativeRouteValue(routeOption?.distance);
    const routeDuration = getNonnegativeRouteValue(routeOption?.duration);
    const destinationDistance = routeDistance || maneuverDistanceTotal;
    const destinationDuration = routeDuration || maneuverDurationTotal;
    let elapsedDistance = 0;
    let elapsedDuration = 0;

    const maneuverEstimates = maneuvers.map((maneuver) => {
        const estimate = {
            distanceMeters: Math.min(elapsedDistance, destinationDistance),
            durationSeconds: Math.min(elapsedDuration, destinationDuration),
        };

        elapsedDistance += getNonnegativeRouteValue(maneuver?.distance);
        elapsedDuration += getNonnegativeRouteValue(maneuver?.duration);

        return estimate;
    });

    return {
        destination: {
            distanceMeters: destinationDistance,
            durationSeconds: destinationDuration,
        },
        maneuverEstimates,
        origin: {
            distanceMeters: 0,
            durationSeconds: 0,
        },
    };
}

export function getAutoPlayRouteChoiceText({ routeLabel, selectionSummary }) {
    const normalizedRouteLabel =
        String(routeLabel || 'Route').trim() || 'Route';
    const routeTitle = `${normalizedRouteLabel} route`;
    const normalizedSelectionSummary = String(selectionSummary || '').trim();

    return {
        additionalInformationVariants: [routeTitle],
        selectionSummaryVariants: [normalizedSelectionSummary || routeTitle],
        summaryVariants: [routeTitle],
    };
}

export function getAutoPlayRoutePreviewFitKey({ bounds, route, viewportKey }) {
    const boundsKey = [bounds?.sw, bounds?.ne]
        .flat()
        .filter((coordinate) => Number.isFinite(Number(coordinate)))
        .join(',');

    return [
        'preview',
        route?.requestedAt,
        route?.selectedRouteKey ?? route?.routeKey,
        route?.destination?.id,
        route?.destination?.label,
        route?.destination?.inputValue,
        boundsKey,
        viewportKey,
    ].join(':');
}

export function getAutoPlaySearchResultsFitKey({ bounds, query, viewportKey }) {
    const boundsKey = [bounds?.sw, bounds?.ne]
        .flat()
        .filter((coordinate) => Number.isFinite(Number(coordinate)))
        .join(',');

    return [
        'search-results',
        String(query ?? '').trim(),
        boundsKey,
        viewportKey,
    ].join(':');
}

export function getAutoPlaySearchResultsMapIsActive({
    isNavigating,
    routePreviewIsActive,
    submittedSearchQuery,
    submittedSearchResults,
}) {
    if (isNavigating || routePreviewIsActive) {
        return false;
    }

    return Boolean(
        submittedSearchResults?.length ||
        String(submittedSearchQuery ?? '').trim(),
    );
}

export function getAutoPlayMapContentVisibility({
    routePreviewIsActive,
    searchResultsMapIsActive,
    surveillanceMarkersVisible,
}) {
    const transientMapContextIsActive = Boolean(
        routePreviewIsActive || searchResultsMapIsActive,
    );

    return {
        compassIsVisible: !transientMapContextIsActive,
        drivingStatusIsVisible: !transientMapContextIsActive,
        surveillanceMarkersVisible: Boolean(
            surveillanceMarkersVisible && !searchResultsMapIsActive,
        ),
        userLocationPuckVisible: true,
    };
}

export function getAutoPlayNavigationPuckRefreshKey({
    isNavigating,
    isRootMapSurface,
    routePreviewIsActive,
    searchResultsMapIsActive,
}) {
    if (!isRootMapSurface) {
        return 'secondary-map';
    }

    if (isNavigating) {
        return 'root-navigation';
    }

    if (routePreviewIsActive) {
        return 'root-route-preview';
    }

    if (searchResultsMapIsActive) {
        return 'root-search-results';
    }

    return 'root-map';
}

export function makeAutoPlayTripSelectorTrips({
    makeRouteChoice,
    routeOptions,
    selectedRouteKey,
    tripId,
}) {
    const availableRouteOptions = [...(routeOptions ?? [])];
    const selectedRouteOption = availableRouteOptions.find(
        (routeOption) => routeOption?.routeKey === selectedRouteKey,
    );
    const orderedRouteOptions = selectedRouteOption
        ? [
              selectedRouteOption,
              ...availableRouteOptions.filter(
                  (routeOption) => routeOption !== selectedRouteOption,
              ),
          ]
        : availableRouteOptions;
    const routeChoices = orderedRouteOptions
        .map((routeOption) => makeRouteChoice(routeOption))
        .filter((routeChoice) => routeChoice?.steps?.length >= 2);

    if (routeChoices.length === 0) {
        throw new Error('Route did not include enough navigation steps.');
    }

    return [
        {
            id: tripId,
            routeChoices,
        },
    ];
}
