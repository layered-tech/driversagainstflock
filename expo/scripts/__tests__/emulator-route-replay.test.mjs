import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Runner } from '../android-auto-e2e.mjs';
import { getEmulatorRouteGpsState } from '../emulator-gps-client.mjs';
import {
    buildEmulatorRouteReplay,
    getEmulatorRouteFix,
    parseEmulatorRoute,
    replayEmulatorRoute,
} from '../emulator-route-replay.mjs';

const source = JSON.parse(
    readFileSync(
        new URL('../../.android-auto/route-pewaukee.json', import.meta.url),
        'utf8',
    ),
);
const route = parseEmulatorRoute(source);

test('uses all 104 detailed road points rather than the simplified overview or an endpoint line', () => {
    assert.equal(route.name, 'WI-164 S/Pewaukee Rd');
    assert.equal(route.durationMs, 147000);
    assert.equal(route.coordinates.length, 104);
    assert.deepEqual(route.coordinates[0], [-88.24447, 43.121520000000004]);
    assert.deepEqual(
        route.coordinates.at(-1),
        [-88.24412000000001, 43.096900000000005],
    );
    assert.equal(source.routes[0].overview_path.length, 29);
    const fixes = buildEmulatorRouteReplay(route);
    assert.equal(fixes.length, 148);
    assert.ok(
        fixes.slice(0, -1).every((fix) => fix.speed > 18 && fix.speed < 19),
    );
    assert.ok(
        fixes
            .slice(0, -1)
            .every(
                (fix) =>
                    Math.abs(fix.velocityKnots * 0.514444 - fix.speed) < 1e-9,
            ),
    );
    assert.equal(fixes.at(-1).speed, 0);
    assert.deepEqual(
        [fixes.at(-1).longitude, fixes.at(-1).latitude],
        route.coordinates.at(-1),
    );
    assert.ok(new Set(fixes.map((fix) => Math.round(fix.heading))).size > 5);
});

test('every geometry vertex is preserved at its proportional leg time', () => {
    for (const point of route.points) {
        const fix = getEmulatorRouteFix(route, point.atMs);
        assert.deepEqual([fix.longitude, fix.latitude], point.coordinate);
    }
});

test('replay windows share their boundary and include a partial final interval', () => {
    const first = buildEmulatorRouteReplay(route, { toMs: 10500 });
    const second = buildEmulatorRouteReplay(route, {
        fromMs: 10500,
        toMs: 14000,
    });
    assert.deepEqual(first.at(-1), second[0]);
    assert.deepEqual(
        second.map((fix) => fix.atMs),
        [10500, 11500, 12500, 13500, 14000],
    );
    assert.ok(second.every((fix) => fix.speed > 0));
});

test('uses separate leg durations, skips duplicate step vertices and stops at arrival', () => {
    const parsed = parseEmulatorRoute({
        routes: [
            {
                legs: [
                    {
                        duration: { value: 10 },
                        steps: [
                            {
                                path: [
                                    { lng: 0, lat: 0 },
                                    { lng: 0, lat: 0.001 },
                                ],
                            },
                        ],
                    },
                    {
                        duration: { value: 20 },
                        steps: [
                            {
                                path: [
                                    { lng: 0, lat: 0.001 },
                                    { lng: 0.001, lat: 0.001 },
                                ],
                            },
                            {
                                path: [
                                    { lng: 0.001, lat: 0.001 },
                                    { lng: 0.002, lat: 0.001 },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    });
    assert.deepEqual(
        parsed.points.map((point) => point.atMs),
        [0, 10000, 20000, 30000],
    );
    assert.deepEqual(
        [
            getEmulatorRouteFix(parsed, 15000).longitude,
            getEmulatorRouteFix(parsed, 15000).latitude,
        ],
        [0.0005, 0.001],
    );
    assert.equal(getEmulatorRouteFix(parsed, 30000).velocityKnots, 0);
});

test('rejects invalid geometry, missing detailed paths, and invalid replay times', () => {
    for (const data of [
        {},
        { routes: [{ legs: [{ duration: { value: 1 }, steps: [] }] }] },
        {
            routes: [
                {
                    legs: [
                        {
                            duration: { value: 1 },
                            steps: [
                                {
                                    path: [
                                        { lat: 43, lng: -88 },
                                        { lat: 91, lng: -88 },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            routes: [
                {
                    legs: [
                        {
                            duration: { value: 0 },
                            steps: [
                                {
                                    path: [
                                        { lat: 43, lng: -88 },
                                        { lat: 42, lng: -88 },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ])
        assert.throws(() => parseEmulatorRoute(data), /route/i);
    for (const options of [
        { intervalMs: 0 },
        { fromMs: -1 },
        { toMs: Infinity },
        { toMs: 148000 },
        { fromMs: 2000, toMs: 1000 },
    ]) {
        assert.throws(() => buildEmulatorRouteReplay(route, options), /replay/);
    }
});

test('compensates for ADB latency and stops sending fixes when ADB fails', async () => {
    let time = 0;
    const sent = [];
    const fixes = buildEmulatorRouteReplay(route, { toMs: 2500 });
    const callbacks = {
        now: () => time,
        wait: async (ms) => {
            time += ms;
        },
        sendFix: async (fix) => {
            sent.push([fix.atMs, time]);
            time += 120;
        },
    };
    await replayEmulatorRoute(fixes, callbacks);
    assert.deepEqual(sent, [
        [0, 0],
        [1000, 1000],
        [2000, 2000],
        [2500, 2500],
    ]);
    let calls = 0;
    await assert.rejects(
        replayEmulatorRoute(fixes, {
            ...callbacks,
            sendFix: async () => {
                calls++;
                throw new Error('ADB disconnected');
            },
        }),
        /ADB disconnected/,
    );
    assert.equal(calls, 1);
});

test('harness sends longitude, latitude and knots through emulator GPS', () => {
    const runner = Object.create(Runner.prototype);
    const calls = [];
    runner.adb = (args) => calls.push(args);
    const fix = getEmulatorRouteFix(route, 78000);
    runner.setEmulatorLocation(fix);
    assert.deepEqual(calls[0], [
        'emu',
        'geo',
        'fix',
        String(fix.longitude),
        String(fix.latitude),
        '0',
        '8',
        String(fix.velocityKnots),
    ]);
});

test('route replay sends position, speed and southbound bearing through the emulator GPS API', async () => {
    const runner = Object.create(Runner.prototype);
    const fixes = [];
    runner.emulatorGpsClient = {
        setLocation: async (fix) => fixes.push(getEmulatorRouteGpsState(fix)),
    };
    const fix = getEmulatorRouteFix(route, 78000);
    await runner.setEmulatorRouteLocation(fix);
    assert.deepEqual(fixes, [
        {
            passiveUpdate: false,
            latitude: fix.latitude,
            longitude: fix.longitude,
            speed: fix.velocityKnots,
            bearing: fix.heading,
            altitude: 0,
            satellites: 8,
        },
    ]);
    assert.ok(fix.heading > 170 && fix.heading < 200);
});

test('default suite covers saved-route warnings, confirmations and expiry without synthetic locations', async () => {
    const suite = JSON.parse(
        readFileSync(
            new URL('../../.android-auto/suite.json', import.meta.url),
            'utf8',
        ),
    );
    assert.equal(suite.mapApiMocks, false);
    const steps = suite.tests.flatMap((scenario) => scenario.steps);
    assert.equal(
        steps.filter((step) =>
            ['deepLink', 'scorecardDriveScenario', 'autoDrive'].includes(
                step.type,
            ),
        ).length,
        0,
    );
    const replay = steps.filter((step) => step.type === 'replayRoute');
    assert.deepEqual(
        replay.map((step) => [step.fromMs, step.toMs]),
        [
            [0, 4000],
            [4000, 8000],
            [8000, 15000],
            [15000, 78000],
            [78000, 108000],
            [108000, 147000],
            [45000, 47000],
            [47000, 78000],
            [45000, 47000],
            [47000, 78000],
            [0, 4000],
            [4000, 8000],
            [8000, 15000],
            [15000, 78000],
            [78000, 108000],
            [108000, 147000],
            [45000, 47000],
            [47000, 78000],
            [45000, 47000],
            [47000, 78000],
        ],
    );
    for (const step of replay)
        assert.doesNotThrow(() => buildEmulatorRouteReplay(route, step));
    const runner = Object.create(Runner.prototype);
    runner.suite = suite;
    for (const type of ['deepLink', 'scorecardDriveScenario', 'autoDrive']) {
        await assert.rejects(runner.runStep({ type }), /cannot enable mocked/);
    }
});
