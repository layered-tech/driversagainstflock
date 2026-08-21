import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { getAutoPlaySharedNavigationAction } from '../../auto-play-shared-navigation.js';

const autoPlayPackageRoot = process.env.AUTO_PLAY_PACKAGE_ROOT
    ? resolve(process.env.AUTO_PLAY_PACKAGE_ROOT)
    : fileURLToPath(
          new URL(
              '../../../node_modules/@iternio/react-native-auto-play/',
              import.meta.url,
          ),
      );

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const androidAutoMapTemplateSource = readFileSync(
    join(
        autoPlayPackageRoot,
        'android/src/main/java/com/margelo/nitro/swe/iternio/reactnativeautoplay/template/MapTemplate.kt',
    ),
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
const getGeometryRouteSyncKey = (candidateRoute) => {
    const selectedRouteOption = candidateRoute?.routeOptions?.find(
        (routeOption) =>
            routeOption.routeKey === candidateRoute?.selectedRouteKey,
    );

    return JSON.stringify([
        candidateRoute?.selectedRouteKey ?? '',
        selectedRouteOption?.coordinates ?? [],
    ]);
};

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

    test('does not restart host navigation for camera-only route enrichment', () => {
        const enrichedRoute = {
            ...route,
            routeOptions: route.routeOptions.map((routeOption) => ({
                ...routeOption,
                cameraCandidates: [
                    {
                        coordinate: [-86.95, 41.05],
                        osmId: 'camera-1',
                    },
                ],
                cameraCoverageComplete: true,
                nodeCount: 1,
            })),
        };

        assert.equal(
            getAutoPlaySharedNavigationAction({
                activeNavigationRoute: route,
                getRouteSyncKey: getGeometryRouteSyncKey,
                rootMapTemplateIsReady: true,
                routingState: {
                    directionsRoute: enrichedRoute,
                    drivingModeIsActive: true,
                },
            }).action,
            'none',
        );
        assert.match(
            autoPlaySource,
            /getRouteSyncKey: getDirectionsRouteGeometrySyncKey/,
        );
    });

    test('publishes auto-drive fixes to the shared accepted-location stream', () => {
        assert.match(
            autoPlaySource,
            /function startAutoDriveNavigationSimulation[\s\S]*?onLocation: \(position\) => \{[\s\S]*?publishAcceptedDeviceLocation\(position\)/,
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

    test('stops stale Auto Play state after the phone ends navigation', () => {
        assert.deepEqual(
            getAutoPlaySharedNavigationAction({
                activeNavigationRoute: route,
                getRouteSyncKey,
                hostNavigationIsActive: false,
                rootMapTemplateIsReady: true,
                routingState: {
                    directionsRoute: null,
                    drivingModeIsActive: false,
                },
            }),
            { action: 'stop', route: null },
        );
    });

    test('publishes explicit car starts and host stops but preserves state on disconnect', () => {
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
        assert.match(disconnectSource, /autoDriveIsEnabled = false/);
        assert.match(disconnectSource, /stopAutoDriveSimulation\(\)/);
        assert.match(disconnectSource, /stopNavigationLocationUpdates\(\)/);
        assert.match(disconnectSource, /activeNavigationRoute = null/);

        const hostStopSource = autoPlaySource.slice(
            autoPlaySource.indexOf('onStopNavigation: () => {'),
            autoPlaySource.indexOf(
                '...autoPlayPlatform.getMapTemplatePlatformConfig',
            ),
        );

        assert.match(
            hostStopSource,
            /stopAutoPlayNavigation\(\{ notifyTemplate: false \}\);/,
        );
        assert.doesNotMatch(
            hostStopSource,
            /preservesPhoneNavigationOnHostStop/,
        );
    });

    test('always forwards an Android Auto host cancellation to JavaScript', () => {
        assert.match(
            androidAutoMapTemplateSource,
            /override fun onStopNavigation\(\) \{\s*navigationEnded\(\)\s*config\.onStopNavigation\(\)\s*\}/,
        );
        assert.doesNotMatch(
            androidAutoMapTemplateSource,
            /Lifecycle\.State\.RESUMED/,
        );
    });
});
