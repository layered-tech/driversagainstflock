import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
    assertRouteOverview,
    makeRoutePixelProbe,
    routeOverviewFailure,
    routeOverviewIsStable,
} from '../automotive-route-overview.mjs';
import {
    buildAndroidAutoNavigationSuite,
    selectAndroidAutoSuite,
} from '../android-auto-navigation-suite.mjs';
import { CarPlayRunner } from '../carplay-e2e.mjs';
import { loadSuite } from '../android-auto-e2e.mjs';

const baseline = { zoom: 16 };
const overview = {
    ready: true,
    previewVisible: true,
    zoom: 12,
    center: [-88.2, 43.1],
    routeKey: 'ideal',
    routeBounds: { ne: [-88.1, 43.2], sw: [-88.3, 43] },
    boundsPoints: [
        [110, 40],
        [180, 160],
        [180, 40],
        [110, 160],
    ],
    routePoints: Array.from({ length: 20 }, (_, i) => [
        120 + i * 3,
        50 + i * 5,
    ]),
    renderedRouteKeys: ['ideal'],
    viewport: {
        width: 400,
        height: 200,
        key: '400:200',
        visibleRect: { left: 100, top: 20, right: 380, bottom: 180 },
    },
};

test('overview requires actual zoom-out, all route bounds inside host-visible map and the selected rendered line', () => {
    assert.equal(routeOverviewFailure(overview, baseline), null);
    const failures = [
        [{ ...overview, ready: false }, /not ready/],
        [{ ...overview, previewVisible: false }, /not visible/],
        [{ ...overview, zoom: 16 }, /did not zoom out/],
        [{ ...overview, zoom: NaN }, /zoom is unavailable/],
        [
            {
                ...overview,
                boundsPoints: [[50, 50], ...overview.boundsPoints.slice(1)],
            },
            /contain all route/,
        ],
        [{ ...overview, renderedRouteKeys: ['direct'] }, /line is missing/],
        [{ ...overview, routePoints: [] }, /coordinates are unavailable/],
    ];
    for (const [snapshot, expected] of failures)
        assert.match(routeOverviewFailure(snapshot, baseline), expected);
    assert.match(routeOverviewFailure(overview, null), /zoom is unavailable/);
});

test('stability resets when the camera moves, the viewport changes or route selection changes', () => {
    assert.equal(routeOverviewIsStable(undefined, overview), false);
    assert.equal(routeOverviewIsStable(overview, overview), true);
    for (const changed of [
        { ...overview, zoom: 12.1 },
        { ...overview, center: [-88.21, 43.1] },
        { ...overview, routeKey: 'direct' },
        { ...overview, viewport: { ...overview.viewport, key: 'new' } },
        { ...overview, routeBounds: {} },
    ])
        assert.equal(routeOverviewIsStable(overview, changed), false);
});

test('pixel probes scale native route coordinates into the captured map and exclude host-covered points', () => {
    const probe = makeRoutePixelProbe(
        {
            ...overview,
            routePoints: [
                [20, 50],
                [120, 50],
                [200, 180],
            ],
        },
        { x: 80, y: 10, width: 800, height: 400 },
    );
    assert.deepEqual(probe, {
        color: [31, 191, 107],
        radius: 8,
        points: [[320, 110]],
    });
    assert.deepEqual(
        makeRoutePixelProbe(
            { ...overview, routeKey: 'direct' },
            { x: 0, y: 0, width: 400, height: 200 },
        ).color,
        [46, 139, 255],
    );
});

test('gate waits for stable camera and visible route pixels and saves its native evidence', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'daf-overview-'));
    try {
        let clock = 0,
            samples = 0,
            captures = 0,
            finishedAt;
        await assertRouteOverview({
            name: 'preview',
            directory,
            baseline,
            sample: async () => {
                samples++;
                return overview;
            },
            capture: () => {
                captures++;
                return {};
            },
            appBounds: () => ({ x: 0, y: 0, width: 400, height: 200 }),
            runPixelProbe: () => ({ matched: samples < 3 ? 0 : 20, span: 120 }),
            report: () => {
                finishedAt = clock;
            },
            now: () => clock,
            pause: async (ms) => {
                clock += ms;
            },
        });
        assert.ok(
            finishedAt >= 2200,
            'Missing line samples cannot count toward stable duration',
        );
        assert.equal(captures, samples);
        const evidence = JSON.parse(
            readFileSync(join(directory, 'preview-overview.json')),
        );
        assert.equal(evidence.baseline.zoom, 16);
        assert.match(evidence.samples[0].failure, /not visibly drawn/);
        assert.equal(evidence.samples.at(-1).failure, null);
        clock = 0;
        await assert.rejects(
            assertRouteOverview({
                name: 'missing-line',
                directory,
                baseline,
                sample: async () => overview,
                capture: () => ({}),
                appBounds: () => ({ x: 0, y: 0, width: 400, height: 200 }),
                runPixelProbe: () => ({ matched: 0, span: 0 }),
                report: () => assert.fail('No route line'),
                now: () => clock,
                pause: async (ms) => {
                    clock += ms;
                },
                timeout: 1000,
            }),
            /not visibly drawn/,
        );
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test('standalone route-choice groups reuse every preview case and preserve full-suite coverage', () => {
    const suite = loadSuite(
        new URL('../../.android-auto/suite.json', import.meta.url).pathname,
    );
    const android = selectAndroidAutoSuite(suite, {
        ANDROID_AUTO_E2E_SUITE: 'route-choices',
    }).tests;
    assert.equal(android.length, 15);
    assert.equal(android.at(-1).name, 'disconnect');
    for (const layout of ['dashboard', 'fullscreen'])
        assert.equal(
            android.filter((test) => test.layout === layout).length,
            7,
        );
    const carplay = new CarPlayRunner({ CARPLAY_E2E_SUITE: 'route-choices' })
        .suite;
    assert.equal(carplay.length, 7);
    for (const scenario of [...android.slice(0, -1), ...carplay]) {
        assert.ok(scenario.stationary);
        assert.equal(scenario.steps[0].type, 'captureRouteOverviewBaseline');
        const lastOverview = scenario.steps.findLastIndex(
            ({ type }) => type === 'assertRouteOverview',
        );
        assert.ok(lastOverview > 0);
        const start = scenario.steps.findIndex(({ text }) => text === 'Start');
        if (start >= 0) assert.ok(start > lastOverview);
    }
    assert.equal(buildAndroidAutoNavigationSuite().length, 13);
    assert.equal(selectAndroidAutoSuite(suite).tests.length, 43);
    assert.equal(new CarPlayRunner({}).suite.length, 18);
});
