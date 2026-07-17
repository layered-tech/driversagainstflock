import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    autoPlaySearchRequestIsCurrent,
    getAutoPlayHeaderButtonVisibility,
    getAutoPlayMapContentVisibility,
    getAutoPlayRouteChoiceText,
    getAutoPlayRoutePreviewFitKey,
    getAutoPlaySearchLoadingCopy,
    getAutoPlaySearchResultsFitKey,
    getAutoPlaySearchResultsMapIsActive,
    getAutoPlayTripEstimateValues,
    makeAutoPlayTripSelectorTrips,
    makeAutoPlayTripSteps,
} from '../../auto-play-template-state.js';

describe('Auto Play template state', () => {
    test('shows a destination-specific loading row while search is pending', () => {
        assert.deepEqual(getAutoPlaySearchLoadingCopy('  coffee  '), {
            detailedText: 'Looking for places matching "coffee".',
            title: 'Searching...',
        });
    });

    test('rejects stale and aborted search responses', () => {
        const currentRequest = { signal: { aborted: false } };
        const staleRequest = { signal: { aborted: false } };

        assert.equal(
            autoPlaySearchRequestIsCurrent(currentRequest, currentRequest),
            true,
        );
        assert.equal(
            autoPlaySearchRequestIsCurrent(currentRequest, staleRequest),
            false,
        );

        currentRequest.signal.aborted = true;

        assert.equal(
            autoPlaySearchRequestIsCurrent(currentRequest, currentRequest),
            false,
        );
    });

    test('keeps Android Auto pan in map chrome instead of a driving header action', () => {
        assert.deepEqual(
            getAutoPlayHeaderButtonVisibility({
                hasActiveNavigation: false,
                usesHeaderDrivingModeButton: false,
                usesHeaderExitNavigationButton: false,
            }),
            {
                navigationExitButtonIsVisible: false,
                trailingNavigationButtonIsVisible: false,
            },
        );
    });

    test('preserves the CarPlay driving and navigation header actions', () => {
        assert.deepEqual(
            getAutoPlayHeaderButtonVisibility({
                hasActiveNavigation: false,
                usesHeaderDrivingModeButton: true,
                usesHeaderExitNavigationButton: true,
            }),
            {
                navigationExitButtonIsVisible: false,
                trailingNavigationButtonIsVisible: true,
            },
        );
        assert.deepEqual(
            getAutoPlayHeaderButtonVisibility({
                hasActiveNavigation: true,
                usesHeaderDrivingModeButton: true,
                usesHeaderExitNavigationButton: true,
            }),
            {
                navigationExitButtonIsVisible: true,
                trailingNavigationButtonIsVisible: true,
            },
        );
    });

    test('packs alternatives into one trip with the selected route first', () => {
        const routeOptions = [{ routeKey: 'fastest' }, { routeKey: 'private' }];
        const trips = makeAutoPlayTripSelectorTrips({
            makeRouteChoice: (routeOption) => ({
                id: routeOption.routeKey,
                steps: [{ name: 'Start' }, { name: 'Destination' }],
            }),
            routeOptions,
            selectedRouteKey: 'private',
            tripId: 'trip-1',
        });

        assert.equal(trips.length, 1);
        assert.equal(trips[0].id, 'trip-1');
        assert.deepEqual(
            trips[0].routeChoices.map((routeChoice) => routeChoice.id),
            ['private', 'fastest'],
        );
        assert.deepEqual(
            routeOptions.map((routeOption) => routeOption.routeKey),
            ['fastest', 'private'],
        );
    });

    test('builds cumulative trip estimates with route totals at the destination', () => {
        assert.deepEqual(
            getAutoPlayTripEstimateValues({
                distance: 1000,
                duration: 600,
                maneuvers: [
                    { distance: 100, duration: 60 },
                    { distance: 300, duration: 120 },
                ],
            }),
            {
                destination: {
                    distanceMeters: 1000,
                    durationSeconds: 600,
                },
                maneuverEstimates: [
                    { distanceMeters: 0, durationSeconds: 0 },
                    { distanceMeters: 100, durationSeconds: 60 },
                ],
                origin: { distanceMeters: 0, durationSeconds: 0 },
            },
        );
    });

    test('falls back to maneuver sums when route totals are absent', () => {
        assert.deepEqual(
            getAutoPlayTripEstimateValues({
                maneuvers: [
                    { distance: 125, duration: 45 },
                    { distance: 375, duration: 135 },
                ],
            }).destination,
            {
                distanceMeters: 500,
                durationSeconds: 180,
            },
        );
    });

    test('keeps route titles separate from comparison-only selector copy', () => {
        assert.deepEqual(
            getAutoPlayRouteChoiceText({
                routeLabel: 'Private',
                selectionSummary:
                    '2 min slower - 0.5 mi longer - Potentially avoids 3 monitored nodes',
            }),
            {
                additionalInformationVariants: ['Private route'],
                selectionSummaryVariants: [
                    '2 min slower - 0.5 mi longer - Potentially avoids 3 monitored nodes',
                ],
                summaryVariants: ['Private route'],
            },
        );
    });

    test('changes preview fit identity with the selected route', () => {
        const bounds = { ne: [-96.7, 32.9], sw: [-96.9, 32.7] };
        const privateKey = getAutoPlayRoutePreviewFitKey({
            bounds,
            route: { requestedAt: 123, selectedRouteKey: 'private' },
            viewportKey: '1920x720',
        });
        const fastestKey = getAutoPlayRoutePreviewFitKey({
            bounds,
            route: { requestedAt: 123, selectedRouteKey: 'fastest' },
            viewportKey: '1920x720',
        });
        assert.notEqual(privateKey, fastestKey);
    });

    test('changes search-results fit identity with the query and viewport', () => {
        const bounds = { ne: [-96.7, 32.9], sw: [-96.9, 32.7] };
        const coffeeKey = getAutoPlaySearchResultsFitKey({
            bounds,
            query: 'coffee',
            viewportKey: '1920x720',
        });
        const gasKey = getAutoPlaySearchResultsFitKey({
            bounds,
            query: 'gas',
            viewportKey: '1920x720',
        });
        const resizedCoffeeKey = getAutoPlaySearchResultsFitKey({
            bounds,
            query: 'coffee',
            viewportKey: '1280x720',
        });

        assert.notEqual(coffeeKey, gasKey);
        assert.notEqual(coffeeKey, resizedCoffeeKey);
    });

    test('keeps the search-results map mode tied to its visible panel', () => {
        assert.equal(
            getAutoPlaySearchResultsMapIsActive({
                isNavigating: false,
                routePreviewIsActive: false,
                submittedSearchQuery: '',
                submittedSearchResults: [{ id: 'result-1' }],
            }),
            true,
        );
        assert.equal(
            getAutoPlaySearchResultsMapIsActive({
                isNavigating: false,
                routePreviewIsActive: false,
                submittedSearchQuery: 'no matches',
                submittedSearchResults: [],
            }),
            true,
        );
        assert.equal(
            getAutoPlaySearchResultsMapIsActive({
                isNavigating: false,
                routePreviewIsActive: true,
                submittedSearchQuery: 'coffee',
                submittedSearchResults: [],
            }),
            false,
        );
        assert.equal(
            getAutoPlaySearchResultsMapIsActive({
                isNavigating: true,
                routePreviewIsActive: false,
                submittedSearchQuery: 'coffee',
                submittedSearchResults: [{ id: 'result-1' }],
            }),
            false,
        );
    });

    test('shows only context-appropriate Auto Play map content', () => {
        const defaultContext = {
            routePreviewIsActive: false,
            searchResultsMapIsActive: false,
            surveillanceMarkersVisible: true,
        };
        const normalVisibility =
            getAutoPlayMapContentVisibility(defaultContext);
        const searchVisibility = getAutoPlayMapContentVisibility({
            ...defaultContext,
            searchResultsMapIsActive: true,
        });
        const routePreviewVisibility = getAutoPlayMapContentVisibility({
            ...defaultContext,
            routePreviewIsActive: true,
        });

        assert.deepEqual(normalVisibility, {
            drivingStatusIsVisible: true,
            surveillanceMarkersVisible: true,
            userLocationPuckVisible: true,
        });
        assert.deepEqual(searchVisibility, {
            drivingStatusIsVisible: false,
            surveillanceMarkersVisible: false,
            userLocationPuckVisible: false,
        });
        assert.deepEqual(routePreviewVisibility, {
            drivingStatusIsVisible: false,
            surveillanceMarkersVisible: true,
            userLocationPuckVisible: false,
        });
        assert.deepEqual(
            [normalVisibility, searchVisibility, normalVisibility].map(
                (visibility) => visibility.userLocationPuckVisible,
            ),
            [true, false, true],
        );
        assert.deepEqual(
            [normalVisibility, routePreviewVisibility, normalVisibility].map(
                (visibility) => visibility.userLocationPuckVisible,
            ),
            [true, false, true],
        );
        assert.equal(
            getAutoPlayMapContentVisibility({
                ...defaultContext,
                surveillanceMarkersVisible: false,
            }).surveillanceMarkersVisible,
            false,
        );
    });

    test('keeps the selector origin first and destination last when capped', () => {
        const originStep = { name: 'Start' };
        const destinationStep = { name: 'Shared destination' };
        const maneuverSteps = Array.from({ length: 15 }, (_, index) => ({
            name: `Maneuver ${index + 1}`,
        }));
        const steps = makeAutoPlayTripSteps({
            destinationStep,
            includeOrigin: true,
            maneuverSteps,
            originStep,
        });

        assert.equal(steps.length, 12);
        assert.equal(steps[0], originStep);
        assert.equal(steps.at(-1), destinationStep);
    });

    test('requires both endpoints for selector steps', () => {
        assert.deepEqual(
            makeAutoPlayTripSteps({
                destinationStep: null,
                includeOrigin: true,
                maneuverSteps: [{ name: 'Continue' }],
                originStep: { name: 'Start' },
            }),
            [],
        );
    });

    test('rejects selector choices without an origin and destination', () => {
        assert.throws(
            () =>
                makeAutoPlayTripSelectorTrips({
                    makeRouteChoice: (routeOption) => ({
                        id: routeOption.routeKey,
                        steps: [{ name: 'Destination' }],
                    }),
                    routeOptions: [{ routeKey: 'private' }],
                    selectedRouteKey: 'private',
                    tripId: 'trip-1',
                }),
            /enough navigation steps/,
        );
    });
});
