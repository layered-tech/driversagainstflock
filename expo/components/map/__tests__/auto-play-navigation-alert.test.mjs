import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    AUTO_PLAY_NAVIGATION_ALERT_ACTION_TITLE,
    AUTO_PLAY_NAVIGATION_ALERT_FALLBACK_DURATION_MS,
    AUTO_PLAY_NAVIGATION_ALERT_ICON_COLOR,
    AUTO_PLAY_NAVIGATION_ALERT_MAXIMUM_DURATION_MS,
    AUTO_PLAY_NAVIGATION_ALERT_MINIMUM_DURATION_MS,
    AUTO_PLAY_NAVIGATION_ALERT_TITLE,
    AUTO_PLAY_NAVIGATION_ALERT_TITLE_WITHOUT_DISTANCE,
    getAutoPlayNavigationAlertContent,
    getAutoPlayNavigationAlertDismissedState,
    getAutoPlayNavigationAlertDurationMs,
    getAutoPlayNavigationAlertTransition,
} from '../../auto-play-navigation-alert.js';

// 20 m/s ≈ 45 mph, so time-to-pass stays inside the duration clamps.
const CRUISING_SPEED_MPS = 20;

const policeAlert = {
    distanceMeters: 1609.344,
    id: 'waze-police',
    source: { publishedAt: '2026-07-12T11:56:00.000Z' },
    type: 'police',
};
const alprAlert = {
    distanceMeters: 483,
    id: 'flock-reader',
    source: { tags: { manufacturer: 'Flock Safety' } },
    type: 'alpr',
};

const makeContent = (upcomingAlerts, currentSpeedMps = CRUISING_SPEED_MPS) =>
    getAutoPlayNavigationAlertContent({ currentSpeedMps, upcomingAlerts });

const announcerSource = readFileSync(
    new URL('../../auto-play-navigation-alert-announcer.js', import.meta.url),
    'utf8',
);
const mapStatusOverlaySource = readFileSync(
    new URL('../../auto-play-map-status-overlay.js', import.meta.url),
    'utf8',
);
const mapSurfaceSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);
const carPlaySurfaceSource = readFileSync(
    new URL('../../carplay-map-surface.js', import.meta.url),
    'utf8',
);
const androidAutoSurfaceSource = readFileSync(
    new URL('../../android-auto-map-surface.js', import.meta.url),
    'utf8',
);

describe('car navigation alert content', () => {
    test('has nothing to announce without an upcoming ALPR or police alert', () => {
        assert.equal(makeContent([]), null);
        assert.equal(
            makeContent([
                { distanceMeters: 100, id: 'work-zone', type: 'construction' },
            ]),
            null,
        );
    });

    test('announces a police report at medium priority', () => {
        assert.deepEqual(makeContent([policeAlert]), {
            alertKey: 'waze-police',
            distance: { unit: 'miles', value: 1 },
            durationMs: 80467,
            priority: 'medium',
            priorityRank: 1,
            subtitle: 'Police - on your route',
            title: '{distance} ahead',
            type: 'police',
        });
    });

    test('announces an ALPR reader at high priority', () => {
        assert.deepEqual(makeContent([alprAlert]), {
            alertKey: 'flock-reader',
            distance: { unit: 'miles', value: 0.3 },
            durationMs: 24150,
            priority: 'high',
            priorityRank: 2,
            subtitle: 'ALPR - on your route',
            title: '{distance} ahead',
            type: 'alpr',
        });
    });

    test('leads with the closest alert when both types are upcoming', () => {
        const content = makeContent([policeAlert, alprAlert]);

        assert.equal(content.alertKey, 'flock-reader');
        assert.equal(content.subtitle, 'ALPR - on your route');
        assert.equal(content.priority, 'high');
    });

    test('keeps police first when both alerts sit at the same distance', () => {
        const content = makeContent([
            { ...alprAlert, distanceMeters: 300 },
            { ...policeAlert, distanceMeters: 300 },
        ]);

        assert.equal(content.subtitle, 'Police - on your route');
        assert.deepEqual(content.distance, { unit: 'miles', value: 0.2 });
    });

    test('hands the host a distance placeholder it can format itself', () => {
        assert.equal(AUTO_PLAY_NAVIGATION_ALERT_TITLE, '{distance} ahead');
        assert.equal(makeContent([alprAlert]).title, '{distance} ahead');
    });

    test('switches to feet inside the maneuver-card threshold', () => {
        assert.deepEqual(
            makeContent([{ ...alprAlert, distanceMeters: 100 }]).distance,
            {
                unit: 'feet',
                value: 350,
            },
        );
        assert.deepEqual(
            makeContent([{ ...alprAlert, distanceMeters: 10 }]).distance,
            {
                unit: 'feet',
                value: 50,
            },
        );
    });

    test('drops the placeholder when the alert has no usable range', () => {
        const content = makeContent([
            { ...policeAlert, distanceMeters: undefined },
        ]);

        assert.equal(content.distance, null);
        assert.equal(
            content.title,
            AUTO_PLAY_NAVIGATION_ALERT_TITLE_WITHOUT_DISTANCE,
        );
    });
});

describe('car navigation alert duration', () => {
    test('lasts as long as the remaining distance takes to cover', () => {
        assert.equal(
            getAutoPlayNavigationAlertDurationMs({
                currentSpeedMps: 20,
                distanceMeters: 1000,
            }),
            50000,
        );
        assert.equal(
            getAutoPlayNavigationAlertDurationMs({
                currentSpeedMps: 25,
                distanceMeters: 500,
            }),
            20000,
        );
    });

    test('clamps a banner that would be too brief to read or too long to sit through', () => {
        assert.equal(
            getAutoPlayNavigationAlertDurationMs({
                currentSpeedMps: 25,
                distanceMeters: 50,
            }),
            AUTO_PLAY_NAVIGATION_ALERT_MINIMUM_DURATION_MS,
        );
        assert.equal(
            getAutoPlayNavigationAlertDurationMs({
                currentSpeedMps: 5,
                distanceMeters: 3218.688,
            }),
            AUTO_PLAY_NAVIGATION_ALERT_MAXIMUM_DURATION_MS,
        );
    });

    test('falls back to a fixed banner when time-to-pass means nothing', () => {
        for (const options of [
            { currentSpeedMps: undefined, distanceMeters: 1000 },
            { currentSpeedMps: 0, distanceMeters: 1000 },
            { currentSpeedMps: 1, distanceMeters: 1000 },
            { currentSpeedMps: 20, distanceMeters: undefined },
            { currentSpeedMps: 20, distanceMeters: 0 },
        ]) {
            assert.equal(
                getAutoPlayNavigationAlertDurationMs(options),
                AUTO_PLAY_NAVIGATION_ALERT_FALLBACK_DURATION_MS,
                JSON.stringify(options),
            );
        }
    });
});

describe('car navigation alert transitions', () => {
    // Fixed clock so the announced duration, and therefore the window in which
    // a banner is still holding the screen, is exact.
    const NOW = 1780000000000;
    const alprContent = makeContent([alprAlert]);
    const policeContent = makeContent([policeAlert]);
    const ALPR_DURATION_MS = alprContent.durationMs;
    const transition = (
        content,
        { nextAlertId = 7, now = NOW, state = null } = {},
    ) =>
        getAutoPlayNavigationAlertTransition({
            content,
            nextAlertId,
            now,
            state,
        });
    const shown = (content = alprContent) => transition(content).state;

    test('stays quiet while there is nothing announced and nothing upcoming', () => {
        assert.deepEqual(transition(null), { action: 'none', state: null });
    });

    test('shows the first alert with the next host alert id', () => {
        assert.deepEqual(transition(alprContent), {
            action: 'show',
            alertId: 7,
            state: {
                alertId: 7,
                alertKey: 'flock-reader',
                distance: { unit: 'miles', value: 0.3 },
                expiresAt: NOW + ALPR_DURATION_MS,
                isVisible: true,
                priorityRank: 2,
                subtitle: 'ALPR - on your route',
                title: '{distance} ahead',
            },
        });
    });

    test('refreshes the visible banner as the rendered distance changes', () => {
        const result = transition(
            makeContent([{ ...alprAlert, distanceMeters: 100 }]),
            { nextAlertId: 8, state: shown() },
        );

        assert.equal(result.action, 'update');
        assert.equal(result.alertId, 7);
        assert.deepEqual(result.state.distance, { unit: 'feet', value: 350 });
    });

    test('ignores approach that does not move the rendered distance', () => {
        const state = shown();
        // 483 m and 485 m both render as 0.3 mi, so the host is left alone.
        const result = transition(
            makeContent([{ ...alprAlert, distanceMeters: 485 }]),
            { nextAlertId: 8, state },
        );

        assert.deepEqual(result, { action: 'none', state });
    });

    test('stops refreshing a banner whose duration has already elapsed', () => {
        const state = shown();
        const result = transition(
            makeContent([{ ...alprAlert, distanceMeters: 100 }]),
            { nextAlertId: 8, now: NOW + ALPR_DURATION_MS + 1, state },
        );

        assert.deepEqual(result, { action: 'none', state });
    });

    test('lets an ALPR reader replace a visible police banner', () => {
        const result = transition(alprContent, {
            nextAlertId: 8,
            state: shown(policeContent),
        });

        assert.equal(result.action, 'show');
        assert.equal(result.alertId, 8);
        assert.equal(result.state.alertKey, 'flock-reader');
    });

    test('holds a police report the host would drop under a visible ALPR banner', () => {
        const state = shown();

        // Recording it as shown here would lose the announcement outright: the
        // host drops the lower-ranked alert without any callback.
        assert.deepEqual(transition(policeContent, { nextAlertId: 8, state }), {
            action: 'none',
            state,
        });
        // Still held one tick before the ALPR banner is due to clear.
        assert.deepEqual(
            transition(policeContent, {
                nextAlertId: 8,
                now: NOW + ALPR_DURATION_MS - 1,
                state,
            }),
            { action: 'none', state },
        );
    });

    test('releases the held police report when the driver dismisses the banner', () => {
        const state = getAutoPlayNavigationAlertDismissedState(shown(), 7);
        const result = transition(policeContent, { nextAlertId: 8, state });

        assert.equal(result.action, 'show');
        assert.equal(result.alertId, 8);
        assert.equal(result.state.alertKey, 'waze-police');
        assert.equal(result.state.priorityRank, 1);
    });

    test('releases the held police report once the banner times out on its own', () => {
        // Covers a dropped onDidDismiss: the announced duration is the outer
        // bound, so a missed callback cannot mute police alerts indefinitely.
        const result = transition(policeContent, {
            nextAlertId: 8,
            now: NOW + ALPR_DURATION_MS + 1,
            state: shown(),
        });

        assert.equal(result.action, 'show');
        assert.equal(result.state.alertKey, 'waze-police');
    });

    test('announces an alert once even after the host times the banner out', () => {
        const state = getAutoPlayNavigationAlertDismissedState(shown(), 7);

        assert.equal(state.isVisible, false);
        assert.deepEqual(
            transition(makeContent([{ ...alprAlert, distanceMeters: 100 }]), {
                nextAlertId: 8,
                state,
            }),
            { action: 'none', state },
        );
    });

    test('ignores a dismissal reported for an alert the host already replaced', () => {
        const state = shown();

        assert.equal(
            getAutoPlayNavigationAlertDismissedState(state, 999),
            state,
        );
        assert.equal(getAutoPlayNavigationAlertDismissedState(null, 7), null);
    });

    test('dismisses the visible banner once nothing is upcoming', () => {
        assert.deepEqual(transition(null, { nextAlertId: 8, state: shown() }), {
            action: 'dismiss',
            alertId: 7,
            state: null,
        });
    });

    test('skips the dismiss call when the host already closed the banner', () => {
        assert.deepEqual(
            transition(null, {
                nextAlertId: 8,
                state: getAutoPlayNavigationAlertDismissedState(shown(), 7),
            }),
            { action: 'none', alertId: 7, state: null },
        );
        // Same for a banner whose duration lapsed without a callback: the id is
        // stale, and on iOS dismissing it would close whatever is on screen.
        assert.deepEqual(
            transition(null, {
                nextAlertId: 8,
                now: NOW + ALPR_DURATION_MS + 1,
                state: shown(),
            }),
            { action: 'none', alertId: 7, state: null },
        );
    });
});

describe('car navigation alert wiring', () => {
    test('drives the host banner instead of drawing an alert card on the map', () => {
        assert.doesNotMatch(mapStatusOverlaySource, /UpcomingAlert/);
        assert.doesNotMatch(
            mapStatusOverlaySource,
            /getDrivingAlertsPresentation/,
        );
        assert.match(
            mapSurfaceSource,
            /useAutoPlayNavigationAlerts\(\{[\s\S]*?currentSpeedMps: getRouteCurrentSpeedMps\(\s*mapPreferences\.userLocation,?\s*\),[\s\S]*?enabled:[\s\S]*?alertSurfaceVisibility\.upcomingAlertsVisible[\s\S]*?!routePreviewIsActive[\s\S]*?!searchResultsMapIsActive,[\s\S]*?upcomingAlerts,\s*\}\);/,
        );
    });

    test('ships the road-circle-exclamation icon as a tintable asset', () => {
        assert.equal(AUTO_PLAY_NAVIGATION_ALERT_ICON_COLOR, '#ffdf92');
        assert.ok(
            existsSync(
                new URL(
                    '../../../assets/auto-play/road-circle-exclamation.png',
                    import.meta.url,
                ),
            ),
            'road-circle-exclamation.png is missing from assets/auto-play',
        );
        assert.match(
            announcerSource,
            /color: AUTO_PLAY_NAVIGATION_ALERT_ICON_COLOR,\s*image: require\('\.\.\/assets\/auto-play\/road-circle-exclamation\.png'\),\s*type: 'asset',/,
        );
    });

    test('announces with the per-alert priority and time-to-pass duration', () => {
        assert.equal(AUTO_PLAY_NAVIGATION_ALERT_ACTION_TITLE, 'OK');
        assert.match(
            announcerSource,
            /mapTemplate\.showAlert\(\{[\s\S]*?durationMs: content\.durationMs,[\s\S]*?image: AUTO_PLAY_NAVIGATION_ALERT_IMAGE,[\s\S]*?priority: content\.priority,[\s\S]*?title: makeAutoPlayNavigationAlertTitle\(content\),/,
        );
        assert.match(announcerSource, /mapTemplate\.updateAlert\(/);
        assert.match(announcerSource, /mapTemplate\.dismissAlert\(/);
    });

    test('announces on both car hosts, not just Android Auto', () => {
        // The announcer rides `rendersAppOverlays`, so a head-unit surface that
        // opts out of the app overlay layer silently mutes every alert. Only
        // secondary surfaces (cluster, CarPlay Dashboard) may opt out, and they
        // are excluded by their host-assigned module id instead.
        assert.doesNotMatch(carPlaySurfaceSource, /^\s*hostOwnsNavigationUI:/m);
        assert.match(
            androidAutoSurfaceSource,
            /const ANDROID_AUTO_SURFACE_PLATFORM_CONFIG = \{[\s\S]*?\n\};/,
        );
        assert.doesNotMatch(
            androidAutoSurfaceSource.slice(
                0,
                androidAutoSurfaceSource.indexOf(
                    'export const AndroidAutoMapSurface',
                ),
            ),
            /^\s*hostOwnsNavigationUI:/m,
        );
        assert.match(mapSurfaceSource, /enabled:\s*rendersAppOverlays &&/);
    });

    test('re-runs the announcement pass as soon as a banner is dismissed', () => {
        // Without this a held alert waits on the next location update, because
        // the dismissal only mutates a ref.
        assert.match(
            announcerSource,
            /setDismissalRevision\(\(revision\) => revision \+ 1\)/,
        );
        assert.match(
            announcerSource,
            /\}, \[\s*dismissalRevision,\s*enabled,\s*handleAlertDismissed,\s*mapTemplate,\s*upcomingAlerts,\s*\]\);/,
        );
    });
});
