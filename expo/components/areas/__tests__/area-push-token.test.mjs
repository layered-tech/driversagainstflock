import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveAreaPushToken } from '../area-push-token.js';

test('token rotation reuses the native event token without requesting another token', async () => {
    const devicePushToken = { type: 'android', data: 'rotated-native-token' };
    const writes = [];
    await saveAreaPushToken({
        notifications: {
            async getExpoPushTokenAsync(options) {
                assert.equal(options.projectId, 'test-project');
                assert.equal(options.devicePushToken, devicePushToken);
                return { data: 'ExpoPushToken[test]' };
            },
        },
        projectId: 'test-project',
        devicePushToken,
        areaRequest: async (...args) => writes.push(args),
        timezone: 'America/Chicago',
    });
    assert.deepEqual(writes, [
        [
            '/device',
            {
                method: 'PATCH',
                body: {
                    push_token: 'ExpoPushToken[test]',
                    timezone: 'America/Chicago',
                },
            },
        ],
    ]);
});

test('initial registration lets Expo acquire a native token', async () => {
    let registrations = 0;
    await saveAreaPushToken({
        notifications: {
            async getExpoPushTokenAsync({ devicePushToken }) {
                assert.equal(devicePushToken, undefined);
                registrations++;
                return { data: 'ExpoPushToken[initial]' };
            },
        },
        projectId: 'test-project',
        areaRequest: async () => {},
        timezone: 'UTC',
    });
    assert.equal(registrations, 1);
});

test('failed Expo registration never overwrites the saved device token', async () => {
    let writes = 0;
    await assert.rejects(
        saveAreaPushToken({
            notifications: {
                async getExpoPushTokenAsync() {
                    throw new Error('Push service unavailable');
                },
            },
            projectId: 'test-project',
            areaRequest: async () => writes++,
            timezone: 'UTC',
        }),
        /Push service unavailable/,
    );
    assert.equal(writes, 0);
});
