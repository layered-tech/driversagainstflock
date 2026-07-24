import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { shouldShowCurrentRoadPill } from '../current-road-pill-layout.js';
import { getRetainedCurrentRoadText } from '../current-road-state.js';
import {
    AUTO_PLAY_NAVIGATION_PUCK_SIZE,
    getNavigationPuckAnchorY,
    NAVIGATION_PUCK_SIZE,
} from '../navigation-puck-layout.js';

describe('current road pill layout', () => {
    test('scales navigation pucks for mobile and car-host surfaces', () => {
        assert.equal(NAVIGATION_PUCK_SIZE, 75);
        assert.equal(AUTO_PLAY_NAVIGATION_PUCK_SIZE, 62.5);
    });

    test('uses the measured puck slot center as the camera anchor', () => {
        assert.equal(
            getNavigationPuckAnchorY({
                layoutY: 520,
            }),
            520 + NAVIGATION_PUCK_SIZE / 2,
        );
    });

    test('translates car-host layout coordinates into map coordinates', () => {
        assert.equal(
            getNavigationPuckAnchorY({
                layoutY: 380,
                puckSize: AUTO_PLAY_NAVIGATION_PUCK_SIZE,
                viewportTop: 60,
            }),
            60 + 380 + AUTO_PLAY_NAVIGATION_PUCK_SIZE / 2,
        );
    });

    test('rejects incomplete layout measurements', () => {
        assert.equal(getNavigationPuckAnchorY({ layoutY: undefined }), null);
        assert.equal(getNavigationPuckAnchorY({ layoutY: null }), null);
        assert.equal(
            getNavigationPuckAnchorY({ layoutY: 100, viewportTop: NaN }),
            null,
        );
        assert.equal(
            getNavigationPuckAnchorY({ layoutY: 100, puckSize: NaN }),
            null,
        );
    });

    test('keeps road context visible during active navigation', () => {
        assert.equal(
            shouldShowCurrentRoadPill({
                roadText: 'Main Street',
                routeIsActive: true,
            }),
            true,
        );
        assert.equal(shouldShowCurrentRoadPill({ roadText: '   ' }), false);
    });

    test('retains the last road through location fixes without road context', () => {
        assert.equal(
            getRetainedCurrentRoadText('Main Street', {
                latitude: 41.8,
                longitude: -87.6,
            }),
            'Main Street',
        );
    });

    test('replaces retained roads and clears explicit off-road matches', () => {
        assert.equal(
            getRetainedCurrentRoadText('Main Street', {
                roadMatch: {
                    roadContext: { primaryText: 'Oak Avenue' },
                },
            }),
            'Oak Avenue',
        );
        assert.equal(
            getRetainedCurrentRoadText('Oak Avenue', {
                roadMatch: { isOffRoad: true },
            }),
            '',
        );
        assert.equal(getRetainedCurrentRoadText('Oak Avenue', null), '');
    });
});
