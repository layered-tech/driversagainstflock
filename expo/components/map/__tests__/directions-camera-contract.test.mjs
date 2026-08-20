import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
const directionsSource = readFileSync(
    new URL('../directions.js', import.meta.url),
    'utf8',
);

function loadDirectionsModule() {
    const module = { exports: {} };
    const transformedSource = transformSync(directionsSource, {
        babelrc: false,
        configFile: false,
        plugins: [transformModulesCommonJs],
        sourceType: 'module',
    }).code;
    const mockedModules = {
        './constants': {
            EMPTY_FEATURE_COLLECTION: {
                features: [],
                type: 'FeatureCollection',
            },
        },
        './geo': {
            getStoredNumber: (value) => {
                const number = Number(value);

                return Number.isFinite(number) ? number : null;
            },
            normalizeLongitude: (value) => value,
        },
        './place-formatters': {
            getPlaceAddress: () => '',
            getPlaceCoordinate: () => null,
            getPlaceDisplayName: () => '',
            getPlaceTypeLabel: () => '',
        },
    };

    new Function('require', 'module', 'exports', transformedSource)(
        (specifier) => mockedModules[specifier],
        module,
        module.exports,
    );

    return module.exports;
}

describe('directions camera contract', () => {
    test('normalizes monitoring inventory and truthful route-search flags', () => {
        const { normalizeDirectionsRouteResponse } = loadDirectionsModule();
        const route = normalizeDirectionsRouteResponse({
            avoidance_search_complete: false,
            routes: {
                direct: {
                    camera_candidates: [
                        {
                            coordinate: [-97.74, 30.26],
                            direction_known: false,
                            osm_id: 100,
                            route_progress_fraction: 0.5,
                        },
                        {
                            coordinate: [-97.73, 30.27],
                            direction_known: true,
                        },
                    ],
                    camera_coverage_complete: true,
                    coordinates: [
                        [-97.75, 30.25],
                        [-97.72, 30.28],
                    ],
                    distance: 1_000,
                    duration: 100,
                    monitoring_camera_nodes: [
                        {
                            coordinate: [-97.74, 30.26],
                            directions: [
                                { end: 112.5, is_range: true, start: 67.5 },
                            ],
                            label: 'Main Street camera',
                            operator: 'Example agency',
                            osm_id: 100,
                        },
                    ],
                },
                ideal: {
                    camera_candidates: [],
                    camera_coverage_complete: true,
                    coordinates: [
                        [-97.75, 30.25],
                        [-97.71, 30.29],
                    ],
                    distance: 1_200,
                    duration: 120,
                    monitoring_camera_nodes: [],
                },
            },
        });

        assert.equal(route.avoidanceSearchComplete, false);
        assert.equal(route.routes.direct.cameraCoverageComplete, false);
        assert.deepEqual(
            route.routes.direct.cameraCandidates.map(({ osmId }) => osmId),
            ['100'],
        );
        assert.equal(route.routes.direct.monitoringCameraNodes.length, 2);
        assert.deepEqual(
            route.routes.direct.monitoringCameraNodes[0].directions,
            [{ end: 112.5, isRange: true, start: 67.5 }],
        );
        assert.equal(
            route.routes.direct.monitoringCameraNodes[0].label,
            'Main Street camera',
        );
        assert.equal(route.monitoringCameraNodes.length, 0);
    });
});
