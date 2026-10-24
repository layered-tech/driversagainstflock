import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');

function loadTransformedModule(source, mockedRequire) {
    const { code } = transformSync(source, {
        babelrc: false,
        configFile: false,
        plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    });
    const module = { exports: {} };

    new Function('require', 'module', 'exports', code)(
        mockedRequire,
        module,
        module.exports,
    );

    return module.exports;
}

const alertControllerSource = readFileSync(
    new URL('../../auto-play-scorecard-arrival-alert.js', import.meta.url),
    'utf8',
);
const { createAutoPlayScorecardArrivalAlertController } = loadTransformedModule(
    alertControllerSource,
    () => {
        throw new Error(
            'The scorecard alert controller should have no imports.',
        );
    },
);
const nitroAlertSource = readFileSync(
    new URL(
        '../../../node_modules/@iternio/react-native-auto-play/lib/utils/NitroAlert.js',
        import.meta.url,
    ),
    'utf8',
);
const { NitroAlertUtil } = loadTransformedModule(nitroAlertSource, (name) => {
    assert.equal(name, './NitroImage');

    return { NitroImageUtil: { convert: (image) => image } };
});
const announcerSource = readFileSync(
    new URL(
        '../../auto-play-scorecard-arrival-alert-announcer.js',
        import.meta.url,
    ),
    'utf8',
);

const emptySnapshot = {
    isHydrated: true,
    scorecardState: {
        pendingRecapTripId: null,
        settings: { enabled: true },
        trips: [],
    },
};
const completedTrip = (overrides = {}) => ({
    completed: true,
    completion: 'arrival',
    distanceMiles: 12.4,
    durationSeconds: 900,
    id: 'guided-trip-1',
    mode: 'guided',
    avoidedCameraCount: 3,
    confirmedReadCount: 0,
    possibleReadCount: 0,
    ...overrides,
});
const snapshotWithTrip = (trip) => ({
    isHydrated: true,
    scorecardState: {
        pendingRecapTripId: trip.id,
        settings: { enabled: true },
        trips: [trip],
    },
});

function createAnnouncerHarness({
    enabled = true,
    mapTemplate = null,
    snapshot = emptySnapshot,
} = {}) {
    let activeEnabled = enabled;
    let activeMapTemplate = mapTemplate;
    let activeSnapshot = snapshot;
    let effectIndex = 0;
    let refIndex = 0;
    const effects = [];
    const refs = [];
    const nativeAlerts = [];
    const dismissals = [];
    const react = {
        useEffect(effect, dependencies) {
            const index = effectIndex++;
            const previousDependencies = effects[index]?.dependencies;
            const changed =
                !previousDependencies ||
                dependencies.some(
                    (dependency, dependencyIndex) =>
                        dependency !== previousDependencies[dependencyIndex],
                ) ||
                dependencies.length !== previousDependencies.length;

            if (changed) {
                effects[index] = { dependencies, cleanup: effect() };
            }
        },
        useRef(initialValue) {
            const index = refIndex++;

            if (!refs[index]) {
                refs[index] = { current: initialValue };
            }

            return refs[index];
        },
        useSyncExternalStore() {
            return activeSnapshot;
        },
    };
    const mapTemplateApi = {
        useAutoPlayMapTemplate: () => activeMapTemplate,
    };
    const runtime = {
        getScorecardRuntimeSnapshot: () => activeSnapshot,
        initializeScorecardRuntime: () => Promise.resolve(),
        subscribeScorecardRuntime: () => () => {},
    };
    const { useAutoPlayScorecardArrivalAlert } = loadTransformedModule(
        announcerSource,
        (name) => {
            if (name === 'react') {
                return react;
            }

            if (name === './auto-play-navigation-alert-announcer') {
                return mapTemplateApi;
            }

            if (name === './auto-play-scorecard-arrival-alert') {
                return { createAutoPlayScorecardArrivalAlertController };
            }

            if (name === './scorecard/scorecard-runtime-instance') {
                return runtime;
            }

            throw new Error(`Unexpected announcer dependency: ${name}`);
        },
    );
    const template = {
        dismissAlert(alertId) {
            dismissals.push(alertId);
        },
        showAlert(alert) {
            nativeAlerts.push(NitroAlertUtil.convert(alert));
        },
    };

    return {
        dismissals,
        nativeAlerts,
        render({
            enabled: nextEnabled = activeEnabled,
            mapTemplate: nextMapTemplate = activeMapTemplate,
            snapshot: nextSnapshot = activeSnapshot,
        } = {}) {
            activeEnabled = nextEnabled;
            activeMapTemplate = nextMapTemplate;
            activeSnapshot = nextSnapshot;
            effectIndex = 0;
            refIndex = 0;
            useAutoPlayScorecardArrivalAlert({ enabled: activeEnabled });
        },
        template,
    };
}

test('completed guided trips reach the native alert boundary with a valid payload', () => {
    const harness = createAnnouncerHarness();

    harness.render();
    harness.render({
        mapTemplate: harness.template,
        snapshot: snapshotWithTrip(completedTrip()),
    });

    assert.equal(harness.nativeAlerts.length, 1);
    const [nativeAlert] = harness.nativeAlerts;
    assert.equal(nativeAlert.priority, 1);
    assert.equal(nativeAlert.durationMs, 10000);
    assert.deepEqual(nativeAlert.image, {
        backgroundColor: 'transparent',
        color: 'default',
        name: 'flag-checkered',
        type: 'glyph',
    });
    assert.deepEqual(nativeAlert.subtitle, { text: '3 avoided · 12.4 mi' });
    assert.deepEqual(nativeAlert.title, { text: 'Arrived, unseen' });

    nativeAlert.primaryAction.onPress();
    assert.deepEqual(harness.dismissals, [nativeAlert.id]);
});

test('a phone recap already pending at connection is not announced', () => {
    const phoneRecapSnapshot = snapshotWithTrip(
        completedTrip({ id: 'phone-recap-trip' }),
    );
    const harness = createAnnouncerHarness({ snapshot: phoneRecapSnapshot });

    harness.render({ mapTemplate: harness.template });

    assert.equal(harness.nativeAlerts.length, 0);
});

test('a new recap waits for an available presentation and is only announced once', () => {
    const harness = createAnnouncerHarness({ enabled: false });
    const newTripSnapshot = snapshotWithTrip(completedTrip());

    harness.render();
    harness.render({ snapshot: newTripSnapshot });
    assert.equal(harness.nativeAlerts.length, 0);

    harness.render({ enabled: true, snapshot: newTripSnapshot });
    assert.equal(harness.nativeAlerts.length, 0);

    harness.render({ mapTemplate: harness.template });
    harness.render({ snapshot: newTripSnapshot });

    assert.equal(harness.nativeAlerts.length, 1);
});
