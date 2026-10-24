import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const source = readFileSync(
    new URL('../../auto-play-scorecard-arrival-alert.js', import.meta.url),
    'utf8',
);
const { code } = transformSync(source, {
    babelrc: false,
    configFile: false,
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(
    () => {
        throw new Error('The scorecard alert helper should have no imports.');
    },
    module,
    module.exports,
);
const { createAutoPlayScorecardArrivalAlertController } = module.exports;
const mapSurfaceSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);
const alertAnnouncerSource = readFileSync(
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
const snapshotWithTrip = (trip, settings = { enabled: true }) => ({
    isHydrated: true,
    scorecardState: {
        pendingRecapTripId: trip.id,
        settings,
        trips: [trip],
    },
});

test('a newly arrived guided trip produces one scorecard summary alert', () => {
    const controller =
        createAutoPlayScorecardArrivalAlertController(emptySnapshot);
    const snapshot = snapshotWithTrip(completedTrip());

    assert.deepEqual(controller.consume(snapshot), {
        subtitle: '3 avoided · 12.4 mi',
        title: 'Arrived, unseen',
    });
    assert.equal(controller.consume(snapshot), null);
});

test('an already pending phone recap is not replayed when the car connects', () => {
    const previousTrip = completedTrip({ id: 'phone-recap-trip' });
    const controller = createAutoPlayScorecardArrivalAlertController(
        snapshotWithTrip(previousTrip),
    );

    assert.equal(controller.consume(snapshotWithTrip(previousTrip)), null);
    assert.deepEqual(
        controller.consume(
            snapshotWithTrip(
                completedTrip({
                    id: 'new-trip',
                    completion: 'manual',
                    confirmedReadCount: 1,
                    distanceMiles: 4,
                }),
            ),
        ),
        { subtitle: '3 avoided · 4.0 mi', title: 'Route ended · 1 crossing' },
    );
});

test('cancelled, disabled, unknown, and unhydrated recaps are ignored once', () => {
    const controller =
        createAutoPlayScorecardArrivalAlertController(emptySnapshot);

    assert.equal(
        controller.consume({
            ...snapshotWithTrip(
                completedTrip({
                    completed: false,
                    completion: 'cancelled',
                    id: 'cancelled-trip',
                }),
            ),
        }),
        null,
    );
    assert.equal(
        controller.consume(
            snapshotWithTrip(completedTrip({ id: 'disabled-trip' }), {
                enabled: false,
            }),
        ),
        null,
    );
    assert.equal(
        controller.consume({
            isHydrated: true,
            scorecardState: {
                pendingRecapTripId: 'missing-trip',
                settings: { enabled: true },
                trips: [],
            },
        }),
        null,
    );
    assert.equal(
        controller.consume({
            isHydrated: false,
            scorecardState: {
                pendingRecapTripId: 'not-ready',
                settings: { enabled: true },
                trips: [],
            },
        }),
        null,
    );
    assert.deepEqual(
        controller.consume(snapshotWithTrip(completedTrip({ id: 'fresh' }))),
        { subtitle: '3 avoided · 12.4 mi', title: 'Arrived, unseen' },
    );
});

test('the root Auto Play map presents summaries through the host alert API', () => {
    assert.match(
        mapSurfaceSource,
        /useAutoPlayScorecardArrivalAlert\(\{\s*enabled:\s*isRootMapSurface\s*&&\s*rendersAppOverlays\s*&&\s*!routePreviewIsActive\s*&&\s*!searchResultsMapIsActive\s*,?\s*\}\)/,
    );
    assert.match(
        alertAnnouncerSource,
        /mapTemplate\.showAlert\(\{[\s\S]*?durationMs:\s*AUTO_PLAY_SCORECARD_ARRIVAL_ALERT_DURATION_MS[\s\S]*?primaryAction:/,
    );
    assert.match(
        alertAnnouncerSource,
        /if \(!enabled \|\| !mapTemplate\)\s*\{\s*return;\s*\}[\s\S]*?alertControllerRef\.current\.consume\(scorecardSnapshot\)/,
    );
});
