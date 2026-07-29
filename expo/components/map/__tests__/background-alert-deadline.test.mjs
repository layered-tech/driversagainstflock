import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    BACKGROUND_ALERT_FETCH_TIMEOUT_MS,
    BACKGROUND_ALERT_MINIMUM_COMPLETION_RESERVE_MS,
    BACKGROUND_ALERT_STORAGE_TIMEOUT_MS,
} from '../background-alert-budget.js';

const backgroundAlertRefreshSource = readFileSync(
    new URL('../background-alert-refresh.js', import.meta.url),
    'utf8',
);

const roadMatchingSessionSource = readFileSync(
    new URL('../road-matching-session.js', import.meta.url),
    'utf8',
);
const electronicHorizonAlprStoreSource = readFileSync(
    new URL('../electronic-horizon-alpr-store.js', import.meta.url),
    'utf8',
);
const wazePoliceAlertStoreSource = readFileSync(
    new URL('../waze-police-alert-store.js', import.meta.url),
    'utf8',
);
const electronicHorizonAlertsApiSource = readFileSync(
    new URL('../electronic-horizon-alerts-api.js', import.meta.url),
    'utf8',
);
const wazeAlertsApiSource = readFileSync(
    new URL('../waze-alerts-api.js', import.meta.url),
    'utf8',
);

describe('background task deadline', () => {
    test('settles failures and races work against a cleared deadline timer', () => {
        assert.match(
            backgroundAlertRefreshSource,
            /settledWork = Promise\.resolve\(work\)\.then\([\s\S]*?\(\) => true,[\s\S]*?\(\) => true/,
        );
        assert.match(
            backgroundAlertRefreshSource,
            /deadline = new Promise[\s\S]*?setTimeout\(\(\) => resolve\(false\), deadlineMs\)[\s\S]*?Promise\.race\(\[[\s\S]*?settledWork,[\s\S]*?deadline,[\s\S]*?\]\)[\s\S]*?clearTimeout\(timeoutId\)/,
        );
    });

    test('does not wait when no positive deadline remains', () => {
        assert.match(
            backgroundAlertRefreshSource,
            /!Number\.isFinite\(deadlineMs\) \|\| deadlineMs <= 0[\s\S]*?return false/,
        );
    });

    test('bounds latest-only matching and parallel alert refresh', () => {
        assert.match(
            roadMatchingSessionSource,
            /BACKGROUND_LOCATION_TASK_DEADLINE_MS = 24000/,
        );
        assert.match(
            roadMatchingSessionSource,
            /settleBackgroundWorkWithinDeadlineAsync\([\s\S]*?processBackgroundLocationTaskAsync\(data\)/,
        );
        assert.match(
            roadMatchingSessionSource,
            /latestLocation = locations\.at\(-1\)[\s\S]*?locationPublication = publishRawLocationAsync\([\s\S]*?alertRefresh = runBackgroundLocationWorkAsync\(latestLocation\)[\s\S]*?Promise\.allSettled\(\[locationPublication, alertRefresh\]\)/,
        );
        assert.match(
            roadMatchingSessionSource,
            /applyRawLocation\(location\)[\s\S]*?updateBackgroundDeliveryDiagnostics\(location, currentAppState\)[\s\S]*?await ensureRoadGraph\(location, source\)/,
        );
        assert.doesNotMatch(
            roadMatchingSessionSource,
            /BACKGROUND_ROAD_CORRIDOR_REQUEST_TIMEOUT_MS/,
        );
        assert.doesNotMatch(
            roadMatchingSessionSource,
            /for \(const location of locations\)/,
        );
    });

    test('leaves time for corridor, storage, and alert persistence', () => {
        const taskDeadlineMatch = roadMatchingSessionSource.match(
            /BACKGROUND_LOCATION_TASK_DEADLINE_MS = (\d+)/,
        );
        const roadGraphDeadlineMatch = roadMatchingSessionSource.match(
            /ROAD_CORRIDOR_REQUEST_TIMEOUT_MS = (\d+)/,
        );
        const taskDeadlineMs = Number(taskDeadlineMatch?.[1]);
        const roadGraphDeadlineMs = Number(roadGraphDeadlineMatch?.[1]);

        assert.ok(Number.isFinite(taskDeadlineMs));
        assert.ok(Number.isFinite(roadGraphDeadlineMs));
        assert.ok(taskDeadlineMs > roadGraphDeadlineMs);
        assert.ok(taskDeadlineMs - roadGraphDeadlineMs >= 1000);
        assert.ok(
            taskDeadlineMs - BACKGROUND_ALERT_FETCH_TIMEOUT_MS >=
                BACKGROUND_ALERT_MINIMUM_COMPLETION_RESERVE_MS,
        );
        assert.ok(
            BACKGROUND_ALERT_STORAGE_TIMEOUT_MS * 3 <
                BACKGROUND_ALERT_MINIMUM_COMPLETION_RESERVE_MS,
        );
        assert.ok(
            BACKGROUND_ALERT_FETCH_TIMEOUT_MS +
                BACKGROUND_ALERT_STORAGE_TIMEOUT_MS * 3 <
                taskDeadlineMs,
        );
        assert.match(
            backgroundAlertRefreshSource,
            /settleStorageReadWithinTimeout\([\s\S]*?BACKGROUND_ALERT_STORAGE_TIMEOUT_MS/,
        );
        assert.match(
            backgroundAlertRefreshSource,
            /policeAlertsAreEnabledPromise = policeAlertsNeedRefresh[\s\S]*?storedPoliceAlertsAreEnabled\(\)[\s\S]*?await getSharedRoutingStateForBackgroundAsync\(\)/,
        );

        for (const alertStoreSource of [
            electronicHorizonAlprStoreSource,
            wazePoliceAlertStoreSource,
        ]) {
            assert.match(
                alertStoreSource,
                /timeoutMs: BACKGROUND_ALERT_FETCH_TIMEOUT_MS/,
            );
            assert.match(
                alertStoreSource,
                /storageTimeoutMs: BACKGROUND_ALERT_STORAGE_TIMEOUT_MS/,
            );
            assert.doesNotMatch(alertStoreSource, /FETCH_TIMEOUT_MS = 12000/);
        }
    });

    test('cancels native alert requests and stalled response decoding', () => {
        for (const alertApiSource of [
            electronicHorizonAlertsApiSource,
            wazeAlertsApiSource,
        ]) {
            assert.match(
                alertApiSource,
                /import \{ fetch as expoFetch \} from 'expo\/fetch'/,
            );
            assert.match(alertApiSource, /await expoFetch\(/);
            assert.match(alertApiSource, /await runAbortableOperation\(/);
            assert.match(alertApiSource, /signal\?\.aborted === true/);
        }
    });
});
