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

function createDeferred() {
    let resolve;
    const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
    });

    return { promise, resolve };
}

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

    test('reattaches an active phone route after a full host reconnect', () => {
        const routingState = {
            directionsRoute: route,
            drivingModeIsActive: true,
        };
        let activeNavigationRoute = route;
        let hostNavigationIsActive = true;
        let rootMapTemplateIsReady = true;
        const synchronize = () =>
            getAutoPlaySharedNavigationAction({
                activeNavigationRoute,
                getRouteSyncKey,
                hostNavigationIsActive,
                rootMapTemplateIsReady,
                routingState,
            });

        assert.equal(synchronize().action, 'none');

        rootMapTemplateIsReady = false;
        hostNavigationIsActive = false;

        assert.equal(synchronize().action, 'none');
        assert.equal(activeNavigationRoute, route);
        assert.equal(routingState.directionsRoute, route);

        rootMapTemplateIsReady = true;

        const reconnectAction = synchronize();

        assert.deepEqual(reconnectAction, { action: 'start', route });

        activeNavigationRoute = reconnectAction.route;
        hostNavigationIsActive = true;

        assert.equal(synchronize().action, 'none');
    });

    test('starts only the latest shared route after hydration settles', async () => {
        const hydration = createDeferred();
        const hydratedRoute = {
            ...route,
            requestedAt: 2000,
            routeOptions: [
                {
                    ...route.routeOptions[0],
                    routeKey: 'route-2',
                },
            ],
            selectedRouteKey: 'route-2',
        };
        let routingState = {
            directionsRoute: route,
            drivingModeIsActive: true,
        };
        let rootMapTemplateIsReady = false;
        const synchronizeAfterHydration = async () => {
            await hydration.promise;
            rootMapTemplateIsReady = true;

            return getAutoPlaySharedNavigationAction({
                activeNavigationRoute: null,
                getRouteSyncKey,
                hostNavigationIsActive: false,
                rootMapTemplateIsReady,
                routingState,
            });
        };
        const pendingSynchronization = synchronizeAfterHydration();

        routingState = {
            directionsRoute: hydratedRoute,
            drivingModeIsActive: true,
        };
        hydration.resolve();

        assert.deepEqual(await pendingSynchronization, {
            action: 'start',
            route: hydratedRoute,
        });
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
