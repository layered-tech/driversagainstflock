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
