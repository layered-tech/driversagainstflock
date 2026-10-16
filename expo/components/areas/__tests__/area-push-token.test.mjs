import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveAreaPushToken } from '../area-push-token.js';

for (const [platform, releaseType, sandbox] of [
    ['ios', 1, true],
    ['ios', 3, false],
    ['ios', 4, false],
    ['ios', 5, false],
    ['ios', 0, false],
    ['android', null, false],
]) {
    test(`${platform} release ${releaseType} ${sandbox ? 'uses sandbox APNs' : 'keeps Expo environment detection'}`, async () => {
        let registrations = 0;
        const devicePushToken = { type: platform, data: 'native-token' };
        await saveAreaPushToken({
            platform,
            application: {
                ApplicationReleaseType: { SIMULATOR: 1 },
                async getIosApplicationReleaseTypeAsync() {
                    assert.equal(platform, 'ios');
                    return releaseType;
                },
            },
            notifications: {
                async getExpoPushTokenAsync(options) {
                    assert.equal(options.projectId, 'test-project');
                    assert.equal(options.devicePushToken, devicePushToken);
                    assert.equal(
                        Object.hasOwn(options, 'development'),
                        sandbox,
                    );
                    if (sandbox) assert.equal(options.development, true);
                    registrations++;
                    return { data: 'ExpoPushToken[test]' };
                },
            },
            devicePushToken,
            projectId: 'test-project',
            areaRequest: async () => {},
            timezone: 'UTC',
        });
        assert.equal(registrations, 1);
    });
}

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
