import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    autoPlaySearchRequestIsCurrent,
    createAutoPlaySearchCallbackState,
    getAutoPlayHeaderButtonVisibility,
    getAutoPlayMapContentVisibility,
    getAutoPlayNavigationPuckRefreshKey,
    getAutoPlayPrimaryLocationHeaderActionTypes,
    getAutoPlayPrimaryLocationTypes,
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

    test('keeps late voice text changes from replacing a submitted query', () => {
        const callbackState = createAutoPlaySearchCallbackState();

        assert.deepEqual(callbackState.handleSearchTextChanged('coffee'), {
            ignored: false,
            searchText: 'coffee',
        });
        const submission =
            callbackState.handleSearchTextSubmitted('coffee near me');

        assert.deepEqual(submission, {
            searchText: 'coffee near me',
            submissionToken: 1,
        });
        assert.deepEqual(callbackState.handleSearchTextChanged(''), {
            ignored: true,
            searchText: '',
        });
        assert.deepEqual(callbackState.handleSearchTextChanged('coffee'), {
            ignored: true,
            searchText: 'coffee',
        });
        callbackState.handleSearchTextSubmissionCompleted(
            submission.submissionToken,
        );
        assert.deepEqual(callbackState.handleSearchTextChanged('coffee'), {
            ignored: false,
            searchText: 'coffee',
        });
    });

    test('keeps the newest submitted query guarded when an older search finishes', () => {
        const callbackState = createAutoPlaySearchCallbackState();

        const olderSubmission =
            callbackState.handleSearchTextSubmitted('coffee');
        const newerSubmission = callbackState.handleSearchTextSubmitted('gas');
        callbackState.handleSearchTextSubmissionCompleted(
            olderSubmission.submissionToken,
        );

        assert.deepEqual(callbackState.handleSearchTextChanged(''), {
            ignored: true,
            searchText: '',
        });

        callbackState.handleSearchTextSubmissionCompleted(
            newerSubmission.submissionToken,
        );

        assert.deepEqual(callbackState.handleSearchTextChanged(''), {
            ignored: false,
            searchText: '',
        });
    });

    test('keeps an identical newer submission guarded when the older one finishes', () => {
        const callbackState = createAutoPlaySearchCallbackState();
        const olderSubmission =
            callbackState.handleSearchTextSubmitted('coffee');
        const newerSubmission =
            callbackState.handleSearchTextSubmitted('coffee');

        callbackState.handleSearchTextSubmissionCompleted(
            olderSubmission.submissionToken,
        );

        assert.deepEqual(callbackState.handleSearchTextChanged(''), {
            ignored: true,
            searchText: '',
        });

        callbackState.handleSearchTextSubmissionCompleted(
            newerSubmission.submissionToken,
        );

        assert.deepEqual(callbackState.handleSearchTextChanged(''), {
            ignored: false,
            searchText: '',
        });
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

    test('hides the idle CarPlay car action but preserves navigation exit', () => {
        assert.deepEqual(
            getAutoPlayHeaderButtonVisibility({
                hasActiveNavigation: false,
                usesHeaderDrivingModeButton: false,
                usesHeaderExitNavigationButton: true,
            }),
            {
                navigationExitButtonIsVisible: false,
                trailingNavigationButtonIsVisible: false,
            },
        );
        assert.deepEqual(
            getAutoPlayHeaderButtonVisibility({
                hasActiveNavigation: true,
                usesHeaderDrivingModeButton: false,
                usesHeaderExitNavigationButton: true,
            }),
            {
                navigationExitButtonIsVisible: true,
                trailingNavigationButtonIsVisible: true,
            },
        );
    });

    test('shows only configured Home and Work shortcuts while idle', () => {
        assert.deepEqual(
            getAutoPlayPrimaryLocationTypes({
                hasActiveNavigation: false,
                primaryLocations: {
                    home: { id: 'home' },
                    work: { id: 'work' },
                },
            }),
            ['home', 'work'],
        );
        assert.deepEqual(
            getAutoPlayPrimaryLocationTypes({
                hasActiveNavigation: false,
                primaryLocations: { home: { id: 'home' }, work: null },
            }),
            ['home'],
        );
        assert.deepEqual(
            getAutoPlayPrimaryLocationTypes({
                hasActiveNavigation: false,
                primaryLocations: { home: null, work: { id: 'work' } },
            }),
            ['work'],
        );
        assert.deepEqual(
            getAutoPlayPrimaryLocationTypes({
                hasActiveNavigation: false,
                primaryLocations: { home: null, work: null },
            }),
            [],
        );
        assert.deepEqual(
            getAutoPlayPrimaryLocationTypes({
                hasActiveNavigation: true,
                primaryLocations: {
                    home: { id: 'home' },
                    work: { id: 'work' },
                },
            }),
            [],
        );
    });

    test('uses Android Auto icon order and CarPlay display order', () => {
        assert.deepEqual(
            getAutoPlayPrimaryLocationHeaderActionTypes({
                hasActiveNavigation: false,
                primaryLocations: {
                    home: { id: 'home' },
                    work: { id: 'work' },
                },
            }),
            {
                android: ['home', 'work'],
                ios: ['work', 'home'],
            },
        );
        assert.deepEqual(
            getAutoPlayPrimaryLocationHeaderActionTypes({
                hasActiveNavigation: true,
                primaryLocations: {
                    home: { id: 'home' },
                    work: { id: 'work' },
                },
            }),
            { android: [], ios: [] },
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
            compassIsVisible: true,
            drivingStatusIsVisible: true,
            surveillanceMarkersVisible: true,
            userLocationPuckVisible: true,
        });
        assert.deepEqual(searchVisibility, {
            compassIsVisible: false,
            drivingStatusIsVisible: false,
            surveillanceMarkersVisible: false,
            userLocationPuckVisible: true,
        });
        assert.deepEqual(routePreviewVisibility, {
            compassIsVisible: false,
            drivingStatusIsVisible: false,
            surveillanceMarkersVisible: true,
            userLocationPuckVisible: true,
        });
        assert.deepEqual(
            [normalVisibility, searchVisibility, normalVisibility].map(
                (visibility) => visibility.userLocationPuckVisible,
            ),
            [true, true, true],
        );
        assert.deepEqual(
            [normalVisibility, routePreviewVisibility, normalVisibility].map(
                (visibility) => visibility.userLocationPuckVisible,
            ),
            [true, true, true],
        );
        assert.equal(
            getAutoPlayMapContentVisibility({
                ...defaultContext,
                surveillanceMarkersVisible: false,
            }).surveillanceMarkersVisible,
            false,
        );
    });

    test('refreshes the puck at each retained car-host map context', () => {
        const defaultContext = {
            isNavigating: false,
            isRootMapSurface: true,
            routePreviewIsActive: false,
            searchResultsMapIsActive: false,
        };

        assert.deepEqual(
            [
                defaultContext,
                { ...defaultContext, searchResultsMapIsActive: true },
                { ...defaultContext, routePreviewIsActive: true },
                { ...defaultContext, isNavigating: true },
            ].map(getAutoPlayNavigationPuckRefreshKey),
            [
                'root-map',
                'root-search-results',
                'root-route-preview',
                'root-navigation',
            ],
        );
        assert.equal(
            getAutoPlayNavigationPuckRefreshKey({
                ...defaultContext,
                isRootMapSurface: false,
            }),
            'secondary-map',
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
