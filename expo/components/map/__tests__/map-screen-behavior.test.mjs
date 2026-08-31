import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    fitRouteComparisonCamera,
    getDisplayedMapStyleURL,
} from '../../map-screen-behavior.js';

const MAPBOX_STANDARD_SATELLITE_STYLE_URL = 'mapbox://styles/satellite';
const MAPBOX_STANDARD_STYLE_URL = 'mapbox://styles/standard';

describe('map screen behavior', () => {
    test('temporarily displays satellite imagery during contribution placement', () => {
        assert.equal(
            getDisplayedMapStyleURL({
                contributionMapStyleURL: MAPBOX_STANDARD_SATELLITE_STYLE_URL,
                contributePlacementIsActive: true,
                mapStyleURL: MAPBOX_STANDARD_STYLE_URL,
            }),
            MAPBOX_STANDARD_SATELLITE_STYLE_URL,
        );
        assert.equal(
            getDisplayedMapStyleURL({
                contributionMapStyleURL: MAPBOX_STANDARD_SATELLITE_STYLE_URL,
                contributePlacementIsActive: false,
                mapStyleURL: MAPBOX_STANDARD_STYLE_URL,
            }),
            MAPBOX_STANDARD_STYLE_URL,
        );
    });

    test('fits each route comparison bounds and padding combination once', () => {
        const calls = [];
        const bounds = {
            ne: [-87.62, 41.9],
            sw: [-87.7, 41.84],
        };
        const cameraPadding = [16, 24, 32, 24];
        const fitCameraToBounds = (...args) => {
            calls.push(args);
            return true;
        };

        const fitKey = fitRouteComparisonCamera({
            bounds,
            cameraPadding,
            fitCameraToBounds,
            previousFitKey: '',
        });
        const unchangedFitKey = fitRouteComparisonCamera({
            bounds,
            cameraPadding,
            fitCameraToBounds,
            previousFitKey: fitKey,
        });

        assert.equal(unchangedFitKey, fitKey);
        assert.deepEqual(calls, [[bounds, { padding: cameraPadding }]]);
    });

    test('retries a route comparison fit that the map could not accept', () => {
        const attempts = [];
        const bounds = {
            ne: [-87.62, 41.9],
            sw: [-87.7, 41.84],
        };
        const cameraPadding = [16, 24, 32, 24];
        const fitCameraToBounds = () => {
            attempts.push(true);
            return attempts.length > 1;
        };

        const failedFitKey = fitRouteComparisonCamera({
            bounds,
            cameraPadding,
            fitCameraToBounds,
            previousFitKey: '',
        });
        const successfulFitKey = fitRouteComparisonCamera({
            bounds,
            cameraPadding,
            fitCameraToBounds,
            previousFitKey: failedFitKey,
        });

        assert.equal(failedFitKey, '');
        assert.notEqual(successfulFitKey, '');
        assert.equal(attempts.length, 2);
    });
});
