import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
const modules = new Map();
const nativeModules = {
    'sentry.js': { addSentryBreadcrumb() {} },
    'config.js': { buildApiURL: () => 'https://road-corridor.test' },
    'api-mocks.js': { mapApiMocksAreEnabled: () => false },
    'place-details-cache.js': {},
    'shared-map-preferences-sync.js': {},
};

function loadMapModule(url) {
    const nativeModule = nativeModules[url.pathname.split('/').at(-1)];
    if (nativeModule) {
        return nativeModule;
    }
    if (url.pathname.endsWith('/constants.js')) {
        return {
            EMPTY_FEATURE_COLLECTION: {
                type: 'FeatureCollection',
                features: [],
            },
        };
    }

    if (modules.has(url.href)) {
        return modules.get(url.href).exports;
    }

    const module = { exports: {} };
    modules.set(url.href, module);
    const source = transformSync(readFileSync(url, 'utf8'), {
        babelrc: false,
        configFile: false,
        plugins: [transformModulesCommonJs],
    }).code;
    new Function('require', 'module', 'exports', source)(
        (specifier) =>
            loadMapModule(new URL(`${specifier.replace(/\.js$/, '')}.js`, url)),
        module,
        module.exports,
    );
    return module.exports;
}

const directions = loadMapModule(new URL('../directions.js', import.meta.url));

function locationAt(coordinate, recordedAt, isRoundabout) {
    return {
        latitude: coordinate[1],
        longitude: coordinate[0],
        recordedAt,
        roadMatch: { isOffRoad: false, isRoundabout },
    };
}

function makeRoute(coordinates, maneuvers) {
    return directions.normalizeDirectionsRoute({ coordinates, maneuvers });
}

describe('driving maneuver sequences', () => {
    const coordinates = [
        [-97.745, 30.267],
        [-97.744, 30.267],
        [-97.7438, 30.2672],
        [-97.7436, 30.267],
        [-97.7438, 30.2668],
        [-97.7436, 30.265],
        [-97.7436, 30.25],
        [-97.74, 30.25],
    ];
    const maneuvers = [
        { type: 11, way_points: [0, 1], instruction: 'Depart' },
        {
            type: 7,
            exit_number: 2,
            way_points: [1, 6],
            instruction: 'Take second exit',
        },
        { type: 1, way_points: [6, 7], instruction: 'Turn right' },
        { type: 10, way_points: [7, 7], instruction: 'Arrive' },
    ];

    test('retains the exit number inside and advances on the exit road, even with a long instruction interval', () => {
        const route = makeRoute(coordinates, maneuvers);
        const inside = locationAt(coordinates[2], 1000, true);
        const afterExit = locationAt(coordinates[5], 2000, false);

        assert.equal(
            directions.getActiveDirectionsManeuver(route, inside).exit_number,
            2,
        );
        const active = directions.getActiveDirectionsManeuver(route, afterExit);
        assert.equal(active.instruction, 'Turn right');
        assert.ok(active.distanceToManeuver > 1600);
        assert.equal(
            directions.getNextDirectionsManeuver(route, afterExit).type,
            10,
        );
    });

    test('advances after an exit even when GPS samples skipped the roundabout', () => {
        const route = makeRoute(coordinates, maneuvers);
        const afterExit = locationAt(coordinates[5], 2000, false);
        assert.equal(
            directions.getActiveDirectionsManeuver(route, afterExit).stepIndex,
            2,
        );
    });

    test('carries API roundabout metadata through road matching into live guidance', async (context) => {
        const api = loadMapModule(new URL('../api.js', import.meta.url));
        const { createDirectedRoadGraph } = loadMapModule(
            new URL('../road-graph.js', import.meta.url),
        );
        const { createRoadMatcher } = loadMapModule(
            new URL('../road-matching.js', import.meta.url),
        );
        context.mock.method(globalThis, 'fetch', async () => ({
            ok: true,
            json: async () => ({
                result: {
                    ways: [
                        {
                            id: 'approach',
                            coordinates: coordinates.slice(0, 2),
                            is_roundabout: false,
                        },
                        {
                            id: 'circle',
                            coordinates: coordinates.slice(1, 5),
                            is_roundabout: true,
                        },
                        {
                            id: 'exit',
                            coordinates: coordinates.slice(4),
                            is_roundabout: false,
                        },
                    ],
                },
            }),
        }));
        const ways = await api.getRoadCorridor({
            location: locationAt(coordinates[0], 0),
        });
        assert.deepEqual(
            ways.map((way) => way.isRoundabout),
            [false, true, false],
        );
        const matcher = createRoadMatcher(createDirectedRoadGraph(ways));
        const route = makeRoute(coordinates, maneuvers);
        const tracker = directions.createDirectionsRouteProgressTracker();
        for (const [index, expectedType] of [
            [2, 7],
            [5, 1],
        ]) {
            const location = matcher.update(
                {
                    ...locationAt(coordinates[index], index * 10000),
                    accuracy: 3,
                    speed: 12,
                    timestamp: index * 10000,
                },
                { preferredRouteCoordinates: route.coordinates },
            );
            const progress = tracker.update(route, location);
            assert.equal(
                directions.getActiveDirectionsManeuver(
                    route,
                    location,
                    progress,
                ).type,
                expectedType,
            );
        }
    });

    test('does not interpret missing road metadata or an off-road fix as a confirmed roundabout exit', () => {
        const route = makeRoute(coordinates, maneuvers);
        for (const roadMatch of [
            {},
            { isRoundabout: false, isOffRoad: true },
        ]) {
            const location = { ...locationAt(coordinates[2], 1000), roadMatch };
            assert.equal(
                directions.getActiveDirectionsManeuver(route, location).type,
                7,
            );
        }
    });

    test('advances ordinary turns and retains final arrival', () => {
        const route = makeRoute(
            coordinates,
            maneuvers.map((maneuver) =>
                maneuver.type === 7 ? { ...maneuver, type: 0 } : maneuver,
            ),
        );
        assert.equal(
            directions.getActiveDirectionsManeuver(
                route,
                locationAt(coordinates[2], 1000),
            ).type,
            1,
        );
        assert.equal(
            directions.getActiveDirectionsManeuver(
                route,
                locationAt(coordinates[7], 2000),
            ).type,
            10,
        );
    });
});

describe('navigation progress continuity', () => {
    function crossingRoute() {
        return makeRoute(
            [
                [-97.744, 30.266],
                [-97.742, 30.268],
                [-97.742, 30.266],
                [-97.744, 30.268],
            ],
            [
                { type: 11, way_points: [0, 1] },
                { type: 1, way_points: [1, 2] },
                { type: 0, way_points: [2, 3] },
                { type: 10, way_points: [3, 3] },
            ],
        );
    }

    test('keeps the first crossing on the first leg for both guidance consumers', () => {
        const route = crossingRoute();
        for (const tracker of [
            directions.createDirectionsRouteProgressTracker(),
            directions.createDirectionsRouteProgressTracker(),
        ]) {
            tracker.update(route, locationAt([-97.7434, 30.2666], 1000));
            const location = locationAt([-97.743, 30.267], 2000);
            const progress = tracker.update(route, location);
            assert.ok(progress.alongRouteDistance < 300);
            assert.equal(
                directions.getActiveDirectionsManeuver(
                    route,
                    location,
                    progress,
                ).stepIndex,
                1,
            );
            assert.equal(
                directions.getNextDirectionsManeuver(route, location, progress)
                    .stepIndex,
                2,
            );
        }
    });

    test('allows the later crossing after driving the intervening legs', () => {
        const route = crossingRoute();
        const tracker = directions.createDirectionsRouteProgressTracker();
        for (const [index, coordinate] of route.coordinates
            .slice(0, 3)
            .entries()) {
            tracker.update(route, locationAt(coordinate, (index + 1) * 1000));
        }
        const progress = tracker.update(
            route,
            locationAt([-97.743, 30.267], 4000),
        );
        assert.ok(progress.alongRouteDistance > 600);
    });

    test('ignores delayed fixes and resets continuity for a replacement route and stopped navigation', () => {
        const route = crossingRoute();
        const tracker = directions.createDirectionsRouteProgressTracker();
        const latest = tracker.update(
            route,
            locationAt(route.coordinates[2], 2000),
        );
        assert.deepEqual(
            tracker.update(route, locationAt(route.coordinates[0], 1000)),
            latest,
        );
        const replacement = { ...crossingRoute(), requestedAt: 3000 };
        assert.ok(
            tracker.update(
                replacement,
                locationAt(replacement.coordinates[0], 3000),
            ).alongRouteDistance < 1,
        );
        tracker.reset();
        assert.ok(
            tracker.update(route, locationAt(route.coordinates[0], 1000))
                .alongRouteDistance < 1,
        );
    });

    test('preserves real off-route distance and recovers after missing locations', () => {
        const route = crossingRoute();
        const tracker = directions.createDirectionsRouteProgressTracker();
        tracker.update(route, locationAt(route.coordinates[0], 1000));
        assert.equal(tracker.update(route, null), null);
        const offRoute = tracker.update(
            route,
            locationAt([-97.75, 30.26], 2000),
        );
        assert.ok(offRoute.distanceFromRoute > 30);
        assert.ok(
            tracker.update(route, locationAt([-97.743, 30.267], 3000))
                .alongRouteDistance < 300,
        );
    });
});
