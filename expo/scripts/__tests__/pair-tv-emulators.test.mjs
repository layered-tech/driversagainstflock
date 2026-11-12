import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    parseTvPairingUri,
    tvPairingUriFromLinkParams,
} from '../../components/tv/tv-client.js';
import {
    bridgePairingLink,
    parseEmulatorDevices,
    selectEmulators,
} from '../pair-tv-emulators.mjs';

const pairingUri = `daf-tv://pair?host=10.0.2.15&port=38477&fingerprint=${'a'.repeat(64)}&code=ABC234`;

test('helper selects the TV and phone emulators without relying on serial order', () => {
    assert.deepEqual(
        selectEmulators([
            { serial: 'emulator-5556', model: 'sdk_gphone16k_arm64' },
            { serial: 'emulator-5554', model: 'sdk_google_atv64_arm64' },
        ]),
        { tv: 'emulator-5554', phone: 'emulator-5556' },
    );
});

test('helper parses ADB listings that separate columns with spaces', () => {
    assert.deepEqual(
        parseEmulatorDevices(
            'List of devices attached\nemulator-5554          device product:tv model:sdk_google_atv64_arm64\nemulator-5556          device product:phone model:sdk_gphone16k_arm64\n',
        ),
        [
            { serial: 'emulator-5554', model: 'sdk_google_atv64_arm64' },
            { serial: 'emulator-5556', model: 'sdk_gphone16k_arm64' },
        ],
    );
});

test('helper preserves certificate and code while routing through the host bridge', () => {
    const result = bridgePairingLink(pairingUri, 60644);
    const phone = new URL(result.phoneLink);
    const receivedUri = tvPairingUriFromLinkParams({
        tvHost: phone.searchParams.get('tvHost'),
        tvPort: phone.searchParams.get('tvPort'),
        tvFingerprint: phone.searchParams.get('tvFingerprint'),
        tvCode: phone.searchParams.get('tvCode'),
    });
    assert.deepEqual(parseTvPairingUri(receivedUri), {
        host: '10.0.2.2',
        port: 60644,
        fingerprint: 'a'.repeat(64),
        code: 'ABC234',
    });
});
