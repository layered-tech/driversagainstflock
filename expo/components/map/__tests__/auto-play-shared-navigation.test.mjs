import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { getAutoPlaySharedNavigationAction } from '../../auto-play-shared-navigation.js';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const route = {
    destination: { id: 'destination-1' },
    requestedAt: 1000,
    routeOptions: [
        {
            coordinates: [
                [-87, 41],
                [-86.9, 41.1],
            ],
            distance: 1000,
            duration: 100,
            routeKey: 'route-1',
        },
    ],
    selectedRouteKey: 'route-1',
};
const getRouteSyncKey = (candidateRoute) =>
    candidateRoute?.selectedRouteKey ?? '';

describe('shared phone and car navigation contract', () => {
    test('defers a cold persisted route until the car root is ready', () => {
        const routingState = {
            directionsRoute: route,
            drivingModeIsActive: true,
        };

        assert.deepEqual(
            getAutoPlaySharedNavigationAction({
                activeNavigationRoute: null,
                getRouteSyncKey,
                rootMapTemplateIsReady: false,
                routingState,
            }),
            { action: 'none', route: null },
        );
        assert.deepEqual(
            getAutoPlaySharedNavigationAction({
                activeNavigationRoute: null,
                getRouteSyncKey,
                rootMapTemplateIsReady: true,
                routingState,
            }),
            { action: 'start', route },
        );
    });

    test('starts and stops car navigation from phone-owned state', () => {
        assert.equal(
            getAutoPlaySharedNavigationAction({
                activeNavigationRoute: null,
                getRouteSyncKey,
                rootMapTemplateIsReady: true,
                routingState: {
                    directionsRoute: route,
                    drivingModeIsActive: true,
                },
            }).action,
            'start',
        );
        assert.equal(
            getAutoPlaySharedNavigationAction({
                activeNavigationRoute: route,
                getRouteSyncKey,
                rootMapTemplateIsReady: true,
                routingState: {
                    directionsRoute: null,
                    drivingModeIsActive: false,
                },
            }).action,
            'stop',
        );
    });

    test('does not restart an already synchronized route', () => {
        assert.equal(
            getAutoPlaySharedNavigationAction({
                activeNavigationRoute: route,
                getRouteSyncKey,
                rootMapTemplateIsReady: true,
                routingState: {
                    directionsRoute: { ...route },
                    drivingModeIsActive: true,
                },
            }).action,
            'none',
        );
    });

    test('reattaches a phone route after the car host has stopped', () => {
        assert.deepEqual(
            getAutoPlaySharedNavigationAction({
                activeNavigationRoute: route,
                getRouteSyncKey,
                hostNavigationIsActive: false,
                rootMapTemplateIsReady: true,
                routingState: {
                    directionsRoute: route,
                    drivingModeIsActive: true,
                },
            }),
            { action: 'start', route },
        );
    });

    test('publishes explicit car start and stop but preserves state on disconnect', () => {
        assert.match(
            autoPlaySource,
            /function startAutoPlayNavigation[\s\S]*?setSharedRoutingState\(\{\s*directionsRoute: route,\s*drivingModeIsActive: true/,
        );
        assert.match(
            autoPlaySource,
            /function stopAutoPlayNavigation[\s\S]*?setSharedRoutingState\(\{\s*directionsRoute: null,\s*drivingModeIsActive: false/,
        );

        const disconnectSource = autoPlaySource.slice(
            autoPlaySource.indexOf('function handleAutoPlayDisconnect()'),
            autoPlaySource.indexOf('function handleAutoPlaySessionRenderState'),
        );

        assert.doesNotMatch(disconnectSource, /setSharedRoutingState/);
        assert.doesNotMatch(disconnectSource, /activeNavigationRoute = null/);
        assert.doesNotMatch(disconnectSource, /stopNavigationLocationUpdates/);
        assert.doesNotMatch(disconnectSource, /stopAutoDriveSimulation/);
        assert.match(
            autoPlaySource,
            /preservesPhoneNavigationOnHostStop === true[\s\S]*?autoPlayHostNavigationIsActive = false/,
        );
    });
});
