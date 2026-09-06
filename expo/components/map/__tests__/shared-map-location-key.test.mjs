import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getSharedMapLocationKey } from '../shared-map-location-key.js';

const baseLocation = {
    accuracy: 5,
    latitude: 30.2672,
    longitude: -97.7431,
    recordedAt: 1_000,
};

describe('shared map location metadata', () => {
    test('publishes roundabout metadata updates at the same GPS fix', () => {
        const inside = { ...baseLocation, roadMatch: { isRoundabout: true } };
        const outside = { ...baseLocation, roadMatch: { isRoundabout: false } };
        assert.notEqual(
            getSharedMapLocationKey(inside),
            getSharedMapLocationKey(outside),
        );
        assert.notEqual(
            getSharedMapLocationKey(baseLocation),
            getSharedMapLocationKey(outside),
        );
    });

    test('changes when road and speed-limit data arrives at the same GPS fix', () => {
        const matchedLocation = {
            ...baseLocation,
            roadMatch: {
                edgeId: 'edge-1',
                isOffRoad: false,
                roadContext: {
                    components: [{ text: 'Congress Avenue' }],
                    primaryText: 'Congress Avenue',
                },
                speedLimit: {
                    maxspeed: '35 mph',
                    speed: 35,
                    speedLimitMph: 35,
                    unit: 'mph',
                },
                wayId: 'way-1',
            },
            speed: 12,
        };

        assert.notEqual(
            getSharedMapLocationKey(baseLocation),
            getSharedMapLocationKey(matchedLocation),
        );
    });

    test('changes with speed without requiring coordinate movement', () => {
        assert.notEqual(
            getSharedMapLocationKey({ ...baseLocation, speed: 12 }),
            getSharedMapLocationKey({ ...baseLocation, speed: 13 }),
        );
    });
});
