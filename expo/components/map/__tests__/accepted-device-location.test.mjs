import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
    addAcceptedDeviceLocationListener,
    getLatestAcceptedDeviceLocation,
    publishAcceptedDeviceLocation,
} from '../accepted-device-location.js';

describe('accepted raw device location stream', () => {
    test('publishes every accepted fix and stops after removal', () => {
        const received = [];
        const firstLocation = {
            coords: { latitude: 41.88, longitude: -87.63 },
            timestamp: 1000,
        };
        const secondLocation = {
            coords: { latitude: 41.881, longitude: -87.631 },
            timestamp: 2000,
        };
        const subscription = addAcceptedDeviceLocationListener((location) => {
            received.push(location);
        });

        publishAcceptedDeviceLocation(firstLocation);
        subscription.remove();
        publishAcceptedDeviceLocation(secondLocation);

        assert.deepEqual(received, [firstLocation]);
        assert.equal(getLatestAcceptedDeviceLocation(), secondLocation);
    });
});
