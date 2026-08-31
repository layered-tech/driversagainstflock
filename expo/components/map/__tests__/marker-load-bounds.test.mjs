import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    DRIVING_MARKER_REQUIRED_RADIUS_METERS,
    expandBoundsForMarkerRequest,
    getDrivingMarkerRequiredBounds,
    getDrivingMarkerRequiredRadiusMeters,
    markerRequestBoundsContainCameraBounds,
    resolveMarkerLoadBounds,
    shouldSkipMarkerLoadRequest,
} from '../marker-load-bounds.js';

const CHICAGO_LOCATION = {
    latitude: 41.8781,
    longitude: -87.6298,
};
const markerLoaderSource = readFileSync(
    new URL('../use-marker-loader.js', import.meta.url),
    'utf8',
);

describe('driving marker load bounds', () => {
    test('does not replace an active request for a late cached viewport', () => {
        const cachedRequestBounds = {
            sw_lng: -88,
            sw_lat: 41,
            ne_lng: -87,
            ne_lat: 42,
        };
        const lateCachedCameraBounds = {
            sw: [-87.9, 41.1],
            ne: [-87.1, 41.9],
        };

        assert.equal(
            shouldSkipMarkerLoadRequest({
                activeRequestContainsBounds: false,
                cameraBounds: lateCachedCameraBounds,
                lastLoadedRequestBounds: cachedRequestBounds,
                pendingRequestBounds: null,
            }),
            true,
        );
    });

    test('coalesces heading changes and small movements into one request', () => {
        const headingBounds = [
            {
                sw: [-87.68, 41.84],
                ne: [-87.58, 42.13],
            },
            {
                sw: [-87.67, 41.83],
                ne: [-87.25, 41.93],
            },
            {
                sw: [-87.68, 41.63],
                ne: [-87.58, 41.92],
            },
            {
                sw: [-88.01, 41.83],
                ne: [-87.59, 41.93],
            },
        ];
        const samples = headingBounds.map((cameraBounds) => ({
            cameraBounds,
            userLocation: CHICAGO_LOCATION,
        }));
        const smallLongitudeMovement = 0.05;
        const largeLongitudeMovement = 0.2;
        const northFacingBounds = headingBounds[0];

        samples.push({
            cameraBounds: {
                sw: [
                    northFacingBounds.sw[0] + smallLongitudeMovement,
                    northFacingBounds.sw[1],
                ],
                ne: [
                    northFacingBounds.ne[0] + smallLongitudeMovement,
                    northFacingBounds.ne[1],
                ],
            },
            userLocation: {
                ...CHICAGO_LOCATION,
                longitude: CHICAGO_LOCATION.longitude + smallLongitudeMovement,
            },
        });
        samples.push({
            cameraBounds: {
                sw: [
                    northFacingBounds.sw[0] + largeLongitudeMovement,
                    northFacingBounds.sw[1],
                ],
                ne: [
                    northFacingBounds.ne[0] + largeLongitudeMovement,
                    northFacingBounds.ne[1],
                ],
            },
            userLocation: {
                ...CHICAGO_LOCATION,
                longitude: CHICAGO_LOCATION.longitude + largeLongitudeMovement,
            },
        });

        let currentRequestBounds = null;
        const requestBounds = [];

        for (const [sampleIndex, sample] of samples.entries()) {
            const requiredBounds = resolveMarkerLoadBounds({
                cameraBounds: sample.cameraBounds,
                drivingFollowIsActive: true,
                userLocation: sample.userLocation,
            });

            if (
                !markerRequestBoundsContainCameraBounds(
                    currentRequestBounds,
                    requiredBounds,
                )
            ) {
                currentRequestBounds =
                    expandBoundsForMarkerRequest(requiredBounds);
                requestBounds.push(currentRequestBounds);
            }

            assert.equal(
                markerRequestBoundsContainCameraBounds(
                    currentRequestBounds,
                    sample.cameraBounds,
                ),
                true,
            );

            if (sampleIndex < samples.length - 1) {
                assert.equal(requestBounds.length, 1);
            }
        }

        assert.equal(requestBounds.length, 2);
        assert.equal(
            markerRequestBoundsContainCameraBounds(
                requestBounds[0],
                resolveMarkerLoadBounds({
                    cameraBounds: samples[4].cameraBounds,
                    drivingFollowIsActive: true,
                    userLocation: samples[4].userLocation,
                }),
            ),
            true,
        );
    });

    test('grows beyond ten miles to cover a distant visible horizon', () => {
        const cameraBounds = {
            sw: [-87.68, 41.84],
            ne: [-87.58, 42.13],
        };
        const requiredBounds = getDrivingMarkerRequiredBounds(
            CHICAGO_LOCATION,
            cameraBounds,
        );
        const requestBounds = expandBoundsForMarkerRequest(requiredBounds);

        assert.ok(
            getDrivingMarkerRequiredRadiusMeters(
                CHICAGO_LOCATION,
                cameraBounds,
            ) > DRIVING_MARKER_REQUIRED_RADIUS_METERS,
        );
        assert.equal(
            markerRequestBoundsContainCameraBounds(requestBounds, cameraBounds),
            true,
        );
    });

    test('keeps viewport bounds outside active driving follow', () => {
        const cameraBounds = {
            sw: [-88, 41],
            ne: [-87, 42],
        };

        assert.equal(
            resolveMarkerLoadBounds({
                cameraBounds,
                drivingFollowIsActive: false,
                userLocation: CHICAGO_LOCATION,
            }),
            cameraBounds,
        );
    });

    test('falls back to viewport bounds without a valid location', () => {
        const cameraBounds = {
            sw: [-88, 41],
            ne: [-87, 42],
        };

        assert.equal(
            resolveMarkerLoadBounds({
                cameraBounds,
                drivingFollowIsActive: true,
                userLocation: null,
            }),
            cameraBounds,
        );
    });

    test('builds a ten-mile radius and crosses the antimeridian safely', () => {
        const equatorialBounds = getDrivingMarkerRequiredBounds(
            {
                latitude: 0,
                longitude: 0,
            },
            null,
        );
        const antimeridianBounds = getDrivingMarkerRequiredBounds(
            {
                latitude: 0,
                longitude: 179.95,
            },
            null,
        );
        const expectedLatitudeRadiusDegrees =
            (DRIVING_MARKER_REQUIRED_RADIUS_METERS / 6371008.8) *
            (180 / Math.PI);

        assert.ok(
            Math.abs(equatorialBounds.ne[1] - expectedLatitudeRadiusDegrees) <
                0.000001,
        );
        assert.ok(antimeridianBounds.sw[0] > antimeridianBounds.ne[0]);
    });
});

test('wires stable driving coverage into phone and automotive maps', () => {
    const phoneControllerSource = readFileSync(
        new URL('../use-map-location-controller.js', import.meta.url),
        'utf8',
    );
    const autoPlayControllerSource = readFileSync(
        new URL('../../auto-play-map-surface-content.js', import.meta.url),
        'utf8',
    );

    for (const source of [phoneControllerSource, autoPlayControllerSource]) {
        assert.match(source, /resolveMarkerLoadBounds\(\{/);
        assert.match(
            source,
            /locationTrackingModeRef\.current ===\s*LOCATION_TRACKING_FOLLOW/,
        );
        assert.match(source, /followLocationMode\.getRecenterIsNeeded\(\)/);
        assert.match(source, /manualPanIsStarting/);
    }
});

test('keeps the active-bound containment helper available to the marker loader', () => {
    assert.match(
        markerLoaderSource,
        /markerRequestBoundsContainCameraBounds,[\s\S]*?shouldSkipMarkerLoadRequest,/,
    );
    assert.match(
        markerLoaderSource,
        /const activeMarkerRequestContainsBounds[\s\S]*?markerRequestBoundsContainCameraBounds\(/,
    );
});
