import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPresenceDebugGeometry } from '../alpr-presence-debug-geometry.js';
import {
    createPresencePassDetector,
    getPresenceMotionPath,
    presenceDistance,
    presenceSegmentIsWithinRange,
} from '../alpr-presence-policy.js';

const node = { osm_id: 123, longitude: -97, latitude: 30 };
const fix = (east, north = 0) => ({
    longitude: -97 + east / (111195 * Math.cos(Math.PI / 6)),
    latitude: 30 + north / 111195,
    heading: 90,
    accuracy: 4,
});

const directedFix = (forward, right, heading) => {
    const angle = (heading * Math.PI) / 180;
    return {
        ...fix(
            forward * Math.sin(angle) + right * Math.cos(angle),
            forward * Math.cos(angle) - right * Math.sin(angle),
        ),
        heading,
    };
};

for (const navigationActive of [false, true]) {
    for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
        for (const [side, limit] of [
            [-1, 40],
            [1, 20],
        ]) {
            for (const distance of [limit - 0.01, limit + 0.01]) {
                test(`${navigationActive ? 'route' : 'free drive'} heading ${heading}, camera ${side < 0 ? 'left' : 'right'} ${distance} m`, () => {
                    const detector = createPresencePassDetector();
                    let encounter;
                    for (const [index, forward] of [
                        -80, -30, 20, 30,
                    ].entries()) {
                        const location = directedFix(
                            forward,
                            -side * distance,
                            heading,
                        );
                        encounter =
                            detector.update({
                                location,
                                coordinates: getPresenceMotionPath(location),
                                navigationActive,
                                nodes: [node],
                                coverageComplete: true,
                                routeKey: 'test',
                                now: 100000 + index * 2000,
                            }) ?? encounter;
                    }
                    assert.equal(Boolean(encounter), distance < limit);
                    if (encounter)
                        assert.equal(encounter.withinPassRange, true);
                });
            }
        }
    }
}

test('debug outline rotates with travel, reaches 20 m right and 40 m left, and hides when disabled or unreliable', () => {
    for (const heading of [0, 45, 90, 180, 270]) {
        const location = directedFix(0, 0, heading);
        const inspection = { context: { location }, pass: { approaches: [] } };
        const shape = buildPresenceDebugGeometry(inspection, true);
        const ring = shape.features[0].geometry.coordinates[0];
        assert.deepEqual(ring[0], ring.at(-1));
        for (const [index, forward, right] of [
            [0, 30, 0],
            [16, 0, 20],
            [32, -30, 0],
            [48, 0, -40],
        ]) {
            const expected = directedFix(forward, right, heading);
            assert.ok(
                presenceDistance(ring[index], [
                    expected.longitude,
                    expected.latitude,
                ]) < 0.001,
            );
        }
        assert.equal(
            buildPresenceDebugGeometry(inspection, false).features.length,
            0,
        );
        assert.equal(
            buildPresenceDebugGeometry(
                { context: { location: { ...location, accuracy: 50 } } },
                true,
            ).features.length,
            0,
        );
    }
});

test('map geometry follows actual approach samples and shows pending encounters without leaking into default inspection', () => {
    const detector = createPresencePassDetector();
    const update = (east, index) => {
        const location = fix(east, 10);
        return detector.update({
            location,
            coordinates: getPresenceMotionPath(location),
            navigationActive: false,
            nodes: [node],
            coverageComplete: true,
            routeKey: 'free',
            now: 100000 + index * 2000,
        });
    };
    update(-80, 0);
    update(-30, 1);
    const draw = (east, encounter = null) =>
        buildPresenceDebugGeometry(
            {
                context: { location: fix(east, 10) },
                pass: detector.inspect(true),
                encounter,
                phase: 'pending',
            },
            true,
        );
    const approaching = draw(-30);
    assert.equal(
        approaching.features.find((f) => f.properties.kind === 'track')
            .properties.color,
        '#ef4444',
    );
    assert.ok(approaching.features.every((f) => !('label' in f.properties)));
    assert.ok(approaching.features.every((f) => f.properties.kind !== 'label'));
    update(20, 2);
    const target = draw(20).features.find(
        (f) => f.properties.kind === 'target',
    );
    assert.equal(target.properties.color, '#22c55e');
    assert.equal(target.properties.label, undefined);
    const encounter = update(30, 3);
    assert.ok(encounter);
    const pending = draw(30, encounter);
    assert.equal(
        pending.features.find((f) => f.properties.kind === 'track').properties
            .color,
        '#22c55e',
    );
    assert.ok(pending.features.every((f) => !('label' in f.properties)));
    assert.equal(detector.inspect().approaches, undefined);
    detector.reset();
    assert.equal(
        draw(30).features.filter((f) => f.properties.kind === 'target').length,
        0,
    );
});

test('range uses a bounded segment and the same asymmetric ellipse as the outline', () => {
    for (const heading of [0, 90, 180, 270]) {
        const location = directedFix(0, 0, heading);
        const origin = [location.longitude, location.latitude];
        const shape = buildPresenceDebugGeometry(
            { context: { location } },
            true,
        );
        const ring = shape.features[0].geometry.coordinates[0];
        for (const point of ring) {
            for (const scale of [0.99, 1.01]) {
                const target = origin.map(
                    (value, index) => value + (point[index] - value) * scale,
                );
                assert.equal(
                    presenceSegmentIsWithinRange(origin, location, target),
                    scale < 1,
                );
            }
        }
        const start = directedFix(-90, 0, heading);
        const end = directedFix(-80, 0, heading);
        assert.equal(
            presenceSegmentIsWithinRange(
                [start.longitude, start.latitude],
                end,
                origin,
            ),
            false,
        );
    }
});

for (const navigationActive of [false, true]) {
    test(`${navigationActive ? 'route' : 'free drive'} tracks within the same 150 m before and after, then moves to the next node`, () => {
        const detector = createPresencePassDetector();
        const nextLocation = fix(250);
        const nextNode = {
            osm_id: 456,
            longitude: nextLocation.longitude,
            latitude: nextLocation.latitude,
        };
        const update = (east, index, coverageComplete = true) => {
            const location = fix(east);
            return detector.update({
                location,
                coordinates: getPresenceMotionPath(location),
                navigationActive,
                nodes: [node, nextNode],
                coverageComplete,
                routeKey: 'test',
                now: 100000 + index * 1000,
            });
        };
        update(-151, 0);
        assert.equal(detector.inspect().trackedApproaches, 0);
        update(-149, 1);
        assert.equal(detector.inspect().trackedApproaches, 1);
        update(-50, 2);
        update(50, 3, false);
        update(149, 4, false);
        assert.equal(detector.inspect().trackedApproaches, 1);
        assert.equal(update(151, 5), null);
        assert.deepEqual(
            detector.inspect(true).approaches.map((track) => track.node.osm_id),
            [456],
        );
    });
}

test('debug lines use the tracking limit for approaching, pending, and visible confirmations', () => {
    const track = { node, withinPassRange: true };
    for (const phase of ['observing', 'pending', 'showing']) {
        for (const east of [-151, -149, 149, 151]) {
            const shape = buildPresenceDebugGeometry(
                {
                    context: { location: fix(east) },
                    phase,
                    pass: { approaches: phase === 'observing' ? [track] : [] },
                    encounter: phase === 'observing' ? null : track,
                },
                true,
            );
            assert.equal(
                shape.features.filter(
                    (feature) => feature.properties.kind === 'track',
                ).length,
                Math.abs(east) < 150 ? 1 : 0,
            );
            assert.equal(
                shape.features.filter(
                    (feature) => feature.properties.kind === 'target',
                ).length,
                Math.abs(east) < 150 ? 1 : 0,
            );
            assert.equal(
                shape.features.filter(
                    (feature) => feature.properties.kind === 'radius',
                ).length,
                1,
            );
        }
    }
});
