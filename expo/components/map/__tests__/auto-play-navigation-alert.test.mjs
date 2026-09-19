import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    AUTO_PLAY_NAVIGATION_ALERT_ACTION_TITLE,
    AUTO_PLAY_NAVIGATION_ALERT_FALLBACK_DURATION_MS,
    AUTO_PLAY_NAVIGATION_ALERT_FOLLOW_UP_DELAY_MS,
    AUTO_PLAY_NAVIGATION_ALERT_ICON_COLOR,
    AUTO_PLAY_NAVIGATION_ALERT_MAXIMUM_DURATION_MS,
    AUTO_PLAY_NAVIGATION_ALERT_MAXIMUM_RANGE_METERS,
    AUTO_PLAY_NAVIGATION_ALERT_MINIMUM_DURATION_MS,
    AUTO_PLAY_NAVIGATION_ALERT_MINIMUM_RANGE_METERS,
    AUTO_PLAY_NAVIGATION_ALERT_TITLE,
    AUTO_PLAY_NAVIGATION_ALERT_TITLE_WITHOUT_DISTANCE,
    createAutoPlayNavigationAlertSuppressionController,
    getAutoPlayNavigationAlertContent,
    getAutoPlayNavigationAlertDismissedState,
    getAutoPlayNavigationAlertDurationMs,
    getAutoPlayNavigationAlertTransition,
} from '../../auto-play-navigation-alert.js';
import {
    AUTOMOTIVE_ALERT_PROXIMITY_METERS,
    createAutomotiveAlertHistory,
    getAutomotiveAlertHistoryEntry,
    getAutomotiveAlertsAllowedByHistory,
    recordAutomotiveAlertHistoryEntry,
} from '../automotive-alert-policy.js';
import {
    ELECTRONIC_HORIZON_ALERT_MAXIMUM_DISTANCE_METERS,
    ELECTRONIC_HORIZON_ALERT_PATH_LENGTH_METERS,
    getUpcomingElectronicHorizonAlerts,
} from '../electronic-horizon.js';

// 20 m/s ≈ 45 mph, so time-to-pass stays inside the duration clamps.
const CRUISING_SPEED_MPS = 20;
const EARTH_RADIUS_METERS = 6371008.8;
const vehicleLocation = { latitude: 0, longitude: 0 };

const coordinateAtDistance = (distanceMeters) => [
    0,
    ((distanceMeters / EARTH_RADIUS_METERS) * 180) / Math.PI,
];
const coordinateEastAtDistance = (distanceMeters) => [
    ((distanceMeters / EARTH_RADIUS_METERS) * 180) / Math.PI,
    0,
];

const policeAlert = {
    coordinate: coordinateAtDistance(1609.344),
    distanceMeters: 1609.344,
    id: 'waze-police',
    source: { publishedAt: '2026-07-12T11:56:00.000Z' },
    type: 'police',
};
const alprAlert = {
    coordinate: coordinateAtDistance(1609.344),
    distanceMeters: 483,
    id: 'flock-reader',
    source: { tags: { manufacturer: 'Flock Safety' } },
    type: 'alpr',
};
const emptyAlertHistory = createAutomotiveAlertHistory('drive-1');

const makeContent = (
    upcomingAlerts,
    currentSpeedMps = CRUISING_SPEED_MPS,
    {
        alertHistory = emptyAlertHistory,
        currentAlertKey = null,
        userLocation = vehicleLocation,
    } = {},
) =>
    getAutoPlayNavigationAlertContent({
        alertHistory,
        currentAlertKey,
        currentSpeedMps,
        upcomingAlerts,
        userLocation,
    });

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
const presencePromptSource = readFileSync(
    new URL('../../map/alpr-presence-prompt.js', import.meta.url),
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
            alertKey: 'police:waze-police',
            distance: { unit: 'miles', value: 1 },
            durationMs: 80467,
            historyEntry: {
                alertKey: 'police:waze-police',
                coordinate: policeAlert.coordinate,
                type: 'police',
            },
            priority: 'medium',
            priorityRank: 1,
            subtitle: 'Police - on your route',
            title: '{distance} ahead',
            type: 'police',
        });
    });

    test('announces an ALPR reader at high priority', () => {
        assert.deepEqual(makeContent([alprAlert]), {
            alertKey: 'alpr:flock-reader',
            distance: { unit: 'miles', value: 0.3 },
            durationMs: 24150,
            historyEntry: {
                alertKey: 'alpr:flock-reader',
                coordinate: alprAlert.coordinate,
                type: 'alpr',
            },
            priority: 'high',
            priorityRank: 2,
            subtitle: 'ALPR - on your route',
            title: '{distance} ahead',
            type: 'alpr',
        });
    });

    test('leads with the closest alert when both types are upcoming', () => {
        const content = makeContent([policeAlert, alprAlert]);

        assert.equal(content.alertKey, 'alpr:flock-reader');
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

    test('moves on to the next alert after the shown one enters drive history', () => {
        const nearbyPoliceAlert = { ...policeAlert, distanceMeters: 520 };
        const history = recordAutomotiveAlertHistoryEntry(
            emptyAlertHistory,
            getAutomotiveAlertHistoryEntry(alprAlert),
        );

        assert.equal(
            makeContent([alprAlert, nearbyPoliceAlert]).alertKey,
            'alpr:flock-reader',
        );
        assert.equal(
            makeContent([alprAlert, nearbyPoliceAlert], CRUISING_SPEED_MPS, {
                alertHistory: history,
            }).alertKey,
            'police:waze-police',
        );
        assert.equal(
            makeContent([alprAlert], CRUISING_SPEED_MPS, {
                alertHistory: history,
            }),
            null,
        );
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

    test('uses inclusive unrounded geographic boundaries', () => {
        for (const distanceMeters of [
            AUTO_PLAY_NAVIGATION_ALERT_MINIMUM_RANGE_METERS,
            AUTO_PLAY_NAVIGATION_ALERT_MINIMUM_RANGE_METERS + 0.001,
            AUTO_PLAY_NAVIGATION_ALERT_MAXIMUM_RANGE_METERS - 0.001,
            AUTO_PLAY_NAVIGATION_ALERT_MAXIMUM_RANGE_METERS,
        ]) {
            assert.equal(
                makeContent([
                    {
                        ...alprAlert,
                        coordinate: coordinateAtDistance(distanceMeters),
                    },
                ])?.alertKey,
                'alpr:flock-reader',
                `${distanceMeters} meters should be eligible`,
            );
        }

        for (const distanceMeters of [
            AUTO_PLAY_NAVIGATION_ALERT_MINIMUM_RANGE_METERS - 0.001,
            AUTO_PLAY_NAVIGATION_ALERT_MAXIMUM_RANGE_METERS + 0.001,
        ]) {
            assert.equal(
                makeContent([
                    {
                        ...alprAlert,
                        coordinate: coordinateAtDistance(distanceMeters),
                    },
                ]),
                null,
                `${distanceMeters} meters should be ineligible`,
            );
        }
    });

    test('filters by geographic radius before choosing the closest alert', () => {
        const content = makeContent([
            {
                ...alprAlert,
                coordinate: coordinateAtDistance(500),
                distanceMeters: 100,
                id: 'closest-but-too-near',
            },
            {
                ...alprAlert,
                coordinate: coordinateAtDistance(1609.344),
                distanceMeters: 1000,
                id: 'eligible-alternative',
            },
        ]);

        assert.equal(content.alertKey, 'alpr:eligible-alternative');
    });

    test('rejects missing and non-finite vehicle or node coordinates', () => {
        for (const invalidAlert of [
            { ...alprAlert, coordinate: undefined },
            { ...alprAlert, coordinate: [Number.NaN, 0] },
            { ...alprAlert, coordinate: [0, Number.POSITIVE_INFINITY] },
        ]) {
            assert.equal(makeContent([invalidAlert]), null);
        }

        assert.equal(
            getAutoPlayNavigationAlertContent({
                currentSpeedMps: CRUISING_SPEED_MPS,
                upcomingAlerts: [alprAlert],
                userLocation: null,
            }),
            null,
        );
    });

    test('uses vehicle-to-node distance instead of along-route distance', () => {
        assert.equal(
            makeContent([
                {
                    ...alprAlert,
                    coordinate: coordinateAtDistance(1609.344),
                    distanceMeters: 4000,
                    id: 'curved-route-alert',
                },
            ])?.alertKey,
            'alpr:curved-route-alert',
        );
        assert.equal(
            makeContent([
                {
                    ...alprAlert,
                    coordinate: coordinateAtDistance(3500),
                    distanceMeters: 1000,
                },
            ]),
            null,
        );
    });

    test('retains an on-route alert beyond two path miles when its geographic radius is eligible', () => {
        const curvedRoute = [
            [0, 0],
            [0, 0.025],
            [coordinateAtDistance(1609.344)[1], 0],
        ];
        const alprNodes = [
            {
                coordinate: curvedRoute.at(-1),
                id: 'curved-route-reader',
            },
        ];

        assert.deepEqual(
            getUpcomingElectronicHorizonAlerts({
                alprNodes,
                pathCoordinates: curvedRoute,
            }),
            [],
        );
        const automotiveAlerts = getUpcomingElectronicHorizonAlerts({
            alprNodes,
            maximumPathDistanceMeters:
                ELECTRONIC_HORIZON_ALERT_PATH_LENGTH_METERS,
            pathCoordinates: curvedRoute,
        });

        assert.ok(
            automotiveAlerts[0].distanceMeters >
                ELECTRONIC_HORIZON_ALERT_MAXIMUM_DISTANCE_METERS,
        );
        assert.equal(
            makeContent(automotiveAlerts)?.alertKey,
            'alpr:curved-route-reader',
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
        { nextAlertId = 7, now = NOW, state = null, suppressed = false } = {},
    ) =>
        getAutoPlayNavigationAlertTransition({
            content,
            nextAlertId,
            now,
            state,
            suppressed,
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
                alertKey: 'alpr:flock-reader',
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

    test('dismisses the visible banner when vehicle movement leaves either range boundary', () => {
        const alert = {
            ...alprAlert,
            coordinate: coordinateAtDistance(1609.344),
        };
        const initialContent = makeContent([alert]);

        for (const userLocation of [
            {
                latitude: coordinateAtDistance(1000)[1],
                longitude: 0,
            },
            {
                latitude: coordinateAtDistance(-2000)[1],
                longitude: 0,
            },
        ]) {
            const content = makeContent([alert], CRUISING_SPEED_MPS, {
                userLocation,
            });

            assert.equal(content, null);
            assert.deepEqual(
                transition(content, { state: shown(initialContent) }),
                {
                    action: 'dismiss',
                    alertId: 7,
                    state: null,
                },
            );
        }
    });

    test('suppression blocks ALPR and police shows without recording them', () => {
        for (const content of [alprContent, policeContent]) {
            assert.deepEqual(transition(content, { suppressed: true }), {
                action: 'none',
                state: null,
            });
        }
    });

    test('suppression clears both alert types instead of updating them', () => {
        for (const content of [alprContent, policeContent]) {
            assert.deepEqual(
                transition(
                    { ...content, subtitle: `${content.subtitle} updated` },
                    { state: shown(content), suppressed: true },
                ),
                { action: 'dismiss', alertId: 7, state: null },
            );
        }
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
        assert.equal(result.state.alertKey, 'alpr:flock-reader');
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

    test('releases the held police report a beat after the driver dismisses the banner', () => {
        const state = getAutoPlayNavigationAlertDismissedState(shown(), 7, NOW);

        // Announcing instantly would look like the ALPR banner never left.
        assert.deepEqual(
            transition(policeContent, {
                nextAlertId: 8,
                now: NOW + AUTO_PLAY_NAVIGATION_ALERT_FOLLOW_UP_DELAY_MS - 1,
                state,
            }),
            { action: 'none', state },
        );

        const result = transition(policeContent, {
            nextAlertId: 8,
            now: NOW + AUTO_PLAY_NAVIGATION_ALERT_FOLLOW_UP_DELAY_MS,
            state,
        });

        assert.equal(result.action, 'show');
        assert.equal(result.alertId, 8);
        assert.equal(result.state.alertKey, 'police:waze-police');
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
        assert.equal(result.state.alertKey, 'police:waze-police');
    });

    test('announces an alert once even after the host times the banner out', () => {
        const state = getAutoPlayNavigationAlertDismissedState(shown(), 7, NOW);

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
                state: getAutoPlayNavigationAlertDismissedState(
                    shown(),
                    7,
                    NOW,
                ),
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

describe('car navigation alert suppression ownership', () => {
    test('clears synchronously and only the current attempt can release', () => {
        const changes = [];
        const clears = [];
        const controller = createAutoPlayNavigationAlertSuppressionController(
            () => changes.push(controller.active),
        );
        const first = controller.acquire(() => clears.push('first'));
        const second = controller.acquire(() => clears.push('second'));

        assert.deepEqual(clears, ['first', 'second']);
        assert.equal(controller.active, true);
        assert.equal(first.release(), false);
        assert.equal(controller.active, true);
        assert.equal(second.release(), true);
        assert.equal(second.release(), false);
        assert.equal(controller.active, false);
        assert.deepEqual(changes, [true, true, false]);
    });
});

describe('car navigation alert drive history', () => {
    test('suppresses one node across disappearance, object churn, reroute, and range jitter', () => {
        const history = recordAutomotiveAlertHistoryEntry(
            emptyAlertHistory,
            getAutomotiveAlertHistoryEntry(alprAlert),
        );
        const freshAlprObject = {
            ...alprAlert,
            coordinate: [...alprAlert.coordinate],
            source: { tags: { manufacturer: 'Flock Safety' } },
        };

        assert.equal(
            makeContent([freshAlprObject], CRUISING_SPEED_MPS, {
                alertHistory: history,
            }),
            null,
        );
        assert.equal(
            makeContent([], CRUISING_SPEED_MPS, { alertHistory: history }),
            null,
        );
        assert.equal(
            makeContent([freshAlprObject], CRUISING_SPEED_MPS, {
                alertHistory: history,
                userLocation: {
                    latitude: coordinateAtDistance(-600)[1],
                    longitude: 0,
                },
            }),
            null,
        );
        assert.equal(
            makeContent([freshAlprObject], CRUISING_SPEED_MPS, {
                alertHistory: history,
                userLocation: {
                    latitude: coordinateAtDistance(1600)[1],
                    longitude: 0,
                },
            }),
            null,
        );
    });

    test('uses an inclusive 150-meter same-type proximity boundary', () => {
        const shown = { coordinate: [0, 0], id: 'shown', type: 'alpr' };
        const history = recordAutomotiveAlertHistoryEntry(
            emptyAlertHistory,
            getAutomotiveAlertHistoryEntry(shown),
        );
        const atBoundary = {
            coordinate: coordinateEastAtDistance(
                AUTOMOTIVE_ALERT_PROXIMITY_METERS,
            ),
            id: 'at-boundary',
            type: 'alpr',
        };
        const beyondBoundary = {
            ...atBoundary,
            coordinate: coordinateEastAtDistance(
                AUTOMOTIVE_ALERT_PROXIMITY_METERS + 0.001,
            ),
            id: 'beyond-boundary',
        };

        assert.deepEqual(
            getAutomotiveAlertsAllowedByHistory({
                alerts: [atBoundary],
                history,
            }),
            [],
        );
        assert.deepEqual(
            getAutomotiveAlertsAllowedByHistory({
                alerts: [beyondBoundary],
                history,
            }),
            [beyondBoundary],
        );
    });

    test('groups against shown representatives without transitive chaining', () => {
        const shown = { coordinate: [0, 0], id: 'shown', type: 'alpr' };
        const history = recordAutomotiveAlertHistoryEntry(
            emptyAlertHistory,
            getAutomotiveAlertHistoryEntry(shown),
        );
        const suppressedNeighbor = {
            coordinate: coordinateEastAtDistance(149),
            id: 'suppressed-neighbor',
            type: 'alpr',
        };
        const nonTransitiveCandidate = {
            coordinate: coordinateEastAtDistance(298),
            id: 'non-transitive-candidate',
            type: 'alpr',
        };

        assert.deepEqual(
            getAutomotiveAlertsAllowedByHistory({
                alerts: [suppressedNeighbor, nonTransitiveCandidate],
                history,
            }),
            [nonTransitiveCandidate],
        );
    });

    test('keeps ALPR and police history separate at the same coordinates', () => {
        const history = recordAutomotiveAlertHistoryEntry(
            emptyAlertHistory,
            getAutomotiveAlertHistoryEntry(alprAlert),
        );
        const colocatedPolice = {
            ...policeAlert,
            coordinate: alprAlert.coordinate,
        };

        assert.deepEqual(
            getAutomotiveAlertsAllowedByHistory({
                alerts: [colocatedPolice],
                history,
            }),
            [colocatedPolice],
        );
    });

    test('allows a genuinely new same-type report beyond the proximity group', () => {
        const history = recordAutomotiveAlertHistoryEntry(
            emptyAlertHistory,
            getAutomotiveAlertHistoryEntry(policeAlert),
        );
        const newPoliceReport = {
            ...policeAlert,
            coordinate: coordinateEastAtDistance(1609.344),
            id: 'new-police-report',
        };

        assert.equal(
            makeContent(
                [{ ...policeAlert }, newPoliceReport],
                CRUISING_SPEED_MPS,
                { alertHistory: history },
            ).alertKey,
            'police:new-police-report',
        );
    });

    test('chooses deterministically when equivalent candidates reorder', () => {
        const first = {
            ...alprAlert,
            coordinate: coordinateAtDistance(1609.344),
            distanceMeters: 1000,
            id: 'alpha',
        };
        const second = {
            ...alprAlert,
            coordinate: coordinateEastAtDistance(1609.344),
            distanceMeters: 1000,
            id: 'bravo',
        };

        assert.equal(makeContent([first, second]).alertKey, 'alpr:alpha');
        assert.equal(makeContent([second, first]).alertKey, 'alpr:alpha');
    });

    test('keeps a recorded visible alert eligible only for live updates', () => {
        const history = recordAutomotiveAlertHistoryEntry(
            emptyAlertHistory,
            getAutomotiveAlertHistoryEntry(alprAlert),
        );

        assert.equal(
            makeContent([alprAlert], CRUISING_SPEED_MPS, {
                alertHistory: history,
            }),
            null,
        );
        assert.equal(
            makeContent([alprAlert], CRUISING_SPEED_MPS, {
                alertHistory: history,
                currentAlertKey: 'alpr:flock-reader',
            }).alertKey,
            'alpr:flock-reader',
        );
    });

    test('announces a follow-up after the shown representative is recorded', () => {
        const NOW = 1780000000000;
        const nearbyPoliceAlert = { ...policeAlert, distanceMeters: 520 };
        const upcomingAlerts = [alprAlert, nearbyPoliceAlert];
        const shownAlpr = getAutoPlayNavigationAlertTransition({
            content: makeContent(upcomingAlerts),
            nextAlertId: 7,
            now: NOW,
            state: null,
        });
        const history = recordAutomotiveAlertHistoryEntry(
            emptyAlertHistory,
            getAutomotiveAlertHistoryEntry(alprAlert),
        );
        const dismissedState = getAutoPlayNavigationAlertDismissedState(
            shownAlpr.state,
            7,
            NOW,
        );
        const followUpContent = getAutoPlayNavigationAlertContent({
            alertHistory: history,
            currentSpeedMps: CRUISING_SPEED_MPS,
            upcomingAlerts,
            userLocation: vehicleLocation,
        });
        const heldFollowUp = getAutoPlayNavigationAlertTransition({
            content: followUpContent,
            nextAlertId: 8,
            now: NOW + 200,
            state: dismissedState,
        });
        const followUp = getAutoPlayNavigationAlertTransition({
            content: followUpContent,
            nextAlertId: 8,
            now: NOW + AUTO_PLAY_NAVIGATION_ALERT_FOLLOW_UP_DELAY_MS,
            state: dismissedState,
        });

        assert.equal(shownAlpr.state.alertKey, 'alpr:flock-reader');
        assert.equal(heldFollowUp.action, 'none');
        assert.equal(followUp.action, 'show');
        assert.equal(followUp.alertId, 8);
        assert.equal(followUp.state.alertKey, 'police:waze-police');
    });
});

describe('car navigation alert wiring', () => {
    test('claims history before showing and commits only on host acceptance', () => {
        assert.match(
            announcerSource,
            /presenceCoordinator\.claimAutomotiveAlert\(\s*content\.historyEntry,?\s*\)/,
        );
        assert.match(
            announcerSource,
            /onWillShow: \(\) => \{\s*if \(acceptPendingPresentation\(presentation\)\) return;/,
        );
        assert.match(
            announcerSource,
            /onDidDismiss: \(\) => \{\s*releasePendingPresentation\(presentation\);/,
        );
        assert.match(
            announcerSource,
            /catch \{\s*releasePendingPresentation\(presentation\);/,
        );
        assert.match(
            announcerSource,
            /presentation\.timeoutId = setTimeout\(\(\) => \{\s*if \(!releasePendingPresentation\(presentation\)\) return;/,
        );
        assert.doesNotMatch(announcerSource, /dismissedAlertKeys/);
    });

    test('drives the host banner instead of drawing an alert card on the map', () => {
        assert.doesNotMatch(mapStatusOverlaySource, /UpcomingAlert/);
        assert.doesNotMatch(
            mapStatusOverlaySource,
            /getDrivingAlertsPresentation/,
        );
        assert.match(
            mapSurfaceSource,
            /useAutoPlayNavigationAlerts\(\{[\s\S]*?currentSpeedMps: getRouteCurrentSpeedMps\(\s*mapPreferences\.userLocation,?\s*\),[\s\S]*?enabled:[\s\S]*?alertSurfaceVisibility\.upcomingAlertsVisible[\s\S]*?!routePreviewIsActive[\s\S]*?!searchResultsMapIsActive,[\s\S]*?upcomingAlerts,[\s\S]*?userLocation: mapPreferences\.userLocation,[\s\S]*?\}\);/,
        );
        assert.match(
            mapSurfaceSource,
            /useUpcomingElectronicHorizonAlerts\(\{[\s\S]*?maximumPathDistanceMeters:\s*ELECTRONIC_HORIZON_ALERT_PATH_LENGTH_METERS,/,
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

    test('re-runs the announcement pass once the follow-up pause has elapsed', () => {
        // Without this a held alert waits on the next location update, because
        // the dismissal only mutates a ref. The nudge is timed to the pause so
        // the swap does not look like the old banner being kept.
        assert.match(
            announcerSource,
            /followUpTimerRef\.current = setTimeout\(\(\) => \{[\s\S]*?setDismissalRevision\(\(revision\) => revision \+ 1\);[\s\S]*?\}, AUTO_PLAY_NAVIGATION_ALERT_FOLLOW_UP_DELAY_MS\)/,
        );
        assert.match(
            announcerSource,
            /useEffect\([\s\S]*?clearTimeout\(followUpTimerRef\.current\);[\s\S]*?releasePendingPresentation\(\);[\s\S]*?suppressionControllerRef\.current\.reset\(\{ notify: false \}\);[\s\S]*?\[releasePendingPresentation\],/,
        );
        assert.match(
            announcerSource,
            /\}, \[\s*dismissalRevision,\s*enabled,\s*acceptPendingPresentation,\s*handleAlertDismissed,\s*historyRevision,\s*mapTemplate,\s*releasePendingPresentation,\s*suppressionRevision,\s*upcomingAlerts,\s*userLocation,\s*\]\);/,
        );
    });

    test('hands attempt-scoped suppression from the announcer to confirmation', () => {
        assert.match(
            announcerSource,
            /createAutoPlayNavigationAlertSuppressionController/,
        );
        assert.match(
            announcerSource,
            /suppressed:\s*suppressionControllerRef\.current\.active/,
        );
        assert.match(
            announcerSource,
            /const clearCurrentAlert = useCallback\(\(\) => \{[\s\S]*?releasePendingPresentation\(\);[\s\S]*?suppressed: true,/,
        );
        assert.match(
            announcerSource,
            /return \{[\s\S]*?acquireSuppression,[\s\S]*?isSuppressed:/,
        );
        assert.match(
            mapSurfaceSource,
            /const navigationAlerts = useAutoPlayNavigationAlerts\(/,
        );
        assert.match(
            mapSurfaceSource,
            /suppressAlerts:\s*navigationAlerts\.acquireSuppression/,
        );
        assert.match(
            mapSurfaceSource,
            /warningBusy:\s*navigationAlerts\.hasEligibleAlert &&[\s\S]*?!navigationAlerts\.isSuppressed/,
        );
        assert.match(presencePromptSource, /suppression:\s*suppressAlerts\(\)/);
        assert.match(
            presencePromptSource,
            /previous\.suppression\?\.release\(\)/,
        );
    });
});
