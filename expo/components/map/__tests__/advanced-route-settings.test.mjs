import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    DEFAULT_AVOID_BUFFER_METERS,
    getAdvancedRouteSettings,
    getAdvancedRouteSettingsKey,
    getAdvancedRouteSettingsRequestPayload,
    getStoredAdvancedRouteSettings,
    normalizeAdvancedRouteSettings,
    normalizeAvoidBufferMeters,
} from '../advanced-route-settings.js';

describe('advanced route settings', () => {
    test('uses the website defaults when settings are absent', () => {
        assert.deepEqual(normalizeAdvancedRouteSettings(), {
            allowAlprNearStartDestination: true,
            avoidBufferMeters: DEFAULT_AVOID_BUFFER_METERS,
        });
        assert.deepEqual(getAdvancedRouteSettings(null), {
            allowAlprNearStartDestination: true,
            avoidBufferMeters: DEFAULT_AVOID_BUFFER_METERS,
        });
    });

    test('clamps and steps avoid distance to the supported range', () => {
        assert.equal(normalizeAvoidBufferMeters(1), 25);
        assert.equal(normalizeAvoidBufferMeters(63), 75);
        assert.equal(normalizeAvoidBufferMeters(5000), 1000);
    });

    test('maps app settings to the API request fields', () => {
        assert.deepEqual(
            getAdvancedRouteSettingsRequestPayload({
                allowAlprNearStartDestination: false,
                avoidBufferMeters: 275,
            }),
            {
                allow_alpr_near_start_destination: false,
                avoid_buffer: 275,
            },
        );
    });

    test('normalizes stored settings for later route requests', () => {
        const storedSettings = getStoredAdvancedRouteSettings({
            advancedRouteSettings: {
                allowAlprNearStartDestination: false,
                avoidBufferMeters: 287,
            },
        });

        assert.deepEqual(storedSettings, {
            allowAlprNearStartDestination: false,
            avoidBufferMeters: 275,
        });
        assert.equal(getAdvancedRouteSettingsKey(storedSettings), '0:275');
    });
});
