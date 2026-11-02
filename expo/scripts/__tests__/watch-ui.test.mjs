import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const watchRoot = fileURLToPath(new URL('../../../watch-os/', import.meta.url));
const macOnly =
    process.platform !== 'darwin' && 'Requires the Apple Swift SDKs';

test(
    'Apple Watch presentation preserves units, near-turn cues, and Area activity',
    { skip: macOnly },
    (t) => {
        const directory = mkdtempSync(join(tmpdir(), 'watch-presentation-'));
        t.after(() => rmSync(directory, { recursive: true, force: true }));
        writeFileSync(
            join(directory, 'main.swift'),
            `
import Foundation

func expectDistance(_ meters: Double?, _ value: String, _ unit: String) {
    let actual = WatchFormat.maneuverDistance(meters)
    precondition(actual.value == value && actual.unit == unit, "Unexpected maneuver distance: \\(actual)")
}
expectDistance(nil, "—", "")
expectDistance(0, "Now", "")
expectDistance(18.288, "Now", "")
expectDistance(18.289, "50", "ft")
expectDistance(121.92, "400", "ft")
expectDistance(1609.344, "1.0", "mi")
precondition(WatchFormat.distance(0) == "0 ft", "Trip and camera distances must not say Now")

let area = try! JSONDecoder().decode(WatchedArea.self, from: Data(#"{"id":1,"name":"Home","unreadCount":0,"cameraCount":283,"addedCount":0,"removedCount":0,"changesStatus":"ready","changes":[]}"#.utf8))
precondition(area.activity(at: 10000) == "Quiet week. Zero new boxes.")
let active = try! JSONDecoder().decode(WatchedArea.self, from: Data(#"{"id":2,"name":"Oakland","unreadCount":3,"cameraCount":116,"addedCount":2,"removedCount":1,"changesStatus":"ready","changes":[{"id":3,"kind":"added","street":"Market St","changedAt":1000}]}"#.utf8))
precondition(active.activity(at: 7201000) == "+2 −1 · 2h ago")
let loading = try! JSONDecoder().decode(WatchedArea.self, from: Data(#"{"id":1,"name":"Home","unreadCount":0,"cameraCount":0,"changesStatus":"loading","changes":[]}"#.utf8))
precondition(loading.activity(at: 10000) == "Checking recent changes")
`,
        );
        const result = spawnSync(
            'xcrun',
            [
                'swiftc',
                '-module-cache-path',
                join(directory, 'cache'),
                join(watchRoot, 'Shared/WatchSnapshot.swift'),
                join(directory, 'main.swift'),
                '-o',
                join(directory, 'presentation-tests'),
            ],
            { encoding: 'utf8', timeout: 60_000 },
        );
        assert.equal(result.status, 0, result.error?.message ?? result.stderr);
        const run = spawnSync(join(directory, 'presentation-tests'), [], {
            encoding: 'utf8',
            timeout: 10_000,
        });
        assert.equal(run.status, 0, run.error?.message ?? run.stderr);
    },
);

test(
    'Apple Watch app views support the watchOS 10 deployment target without generating an app',
    { skip: macOnly },
    (t) => {
        const sdk = spawnSync(
            'xcrun',
            ['--sdk', 'watchsimulator', '--show-sdk-path'],
            { encoding: 'utf8', timeout: 15_000 },
        );
        if (sdk.status !== 0) {
            t.skip('Requires Xcode with the watchOS simulator SDK');
            return;
        }
        const directory = mkdtempSync(join(tmpdir(), 'watch-ui-typecheck-'));
        t.after(() => rmSync(directory, { recursive: true, force: true }));
        const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
        const files = [
            'Shared/WatchSnapshot.swift',
            'Shared/WatchDesign.swift',
            'WatchApp/WatchHaptics.swift',
            'WatchApp/WatchRepository.swift',
            'WatchApp/WatchRootView.swift',
            'WatchApp/DriversAgainstFlockApp.swift',
        ];
        const result = spawnSync(
            'xcrun',
            [
                'swiftc',
                '-typecheck',
                '-parse-as-library',
                '-swift-version',
                '5',
                '-target',
                `${architecture}-apple-watchos10.0-simulator`,
                '-sdk',
                sdk.stdout.trim(),
                '-module-cache-path',
                join(directory, 'cache'),
                ...files.map((file) => join(watchRoot, file)),
            ],
            { encoding: 'utf8', timeout: 120_000 },
        );
        assert.equal(
            result.status,
            0,
            result.error?.message ?? `${result.stdout}\n${result.stderr}`,
        );
    },
);
