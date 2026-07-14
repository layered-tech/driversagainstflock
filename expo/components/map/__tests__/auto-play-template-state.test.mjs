import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    autoPlaySearchRequestIsCurrent,
    getAutoPlayHeaderButtonVisibility,
    getAutoPlaySearchLoadingCopy,
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
