import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
    createLocationPuckDiagnostics,
    getLocationPuckDiagnosticState,
} from '../location-puck-diagnostics.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('native diagnostics classify invalid bearings without leaking location or headings', () => {
    const state = getLocationPuckDiagnosticState({
        puckKind: '2d',
        providerOwnedByApp: false,
        indicatorLayerExists: true,
        providerHeading: NaN,
        renderedBearing: Infinity,
        cameraBearing: 42,
        providerLatitude: 41.123456,
        providerLongitude: -87.123456,
        cameraCenterLatitude: 41.123456,
        modelUri: 'private',
    });
    assert.equal(state.providerHeadingState, 'non-finite');
    assert.equal(state.renderedBearingState, 'non-finite');
    assert.equal(state.cameraBearingState, 'finite');
    assert.equal(state.providerOwnedByApp, false);
    assert.equal(state.indicatorLayerExists, true);
    for (const field of [
        'providerLatitude',
        'providerLongitude',
        'cameraCenterLatitude',
        'modelUri',
        'cameraBearing',
    ]) {
        assert.equal(Object.hasOwn(state, field), false);
    }
    assert.equal(
        getLocationPuckDiagnosticState({}).providerHeadingState,
        'missing',
    );
    assert.deepEqual(getLocationPuckDiagnosticState(null), {
        available: false,
    });
});

test('transition is logged before native read and delayed snapshots identify superseded transitions', async () => {
    const logs = [];
    const pending = [];
    const record = createLocationPuckDiagnostics({
        log: (entry) => logs.push(entry),
        readState: () => new Promise((resolve) => pending.push(resolve)),
    });
    record('3d', 'clearing');
    assert.equal(logs[0].message, 'Puck transition');
    assert.equal(pending.length, 0);
    record('provider', 'native');
    await flush();
    pending[0]({ puckKind: '2d' });
    pending[1]({ puckKind: '3d' });
    await flush();
    assert.equal(logs[2].data.superseded, true);
    assert.equal(logs[2].data.sequence, 1);
    assert.equal(logs[3].data.superseded, false);
});

test('unavailable diagnostic read is logged separately without reporting a new app exception', async () => {
    const logs = [];
    const record = createLocationPuckDiagnostics({
        log: (entry) => logs.push(entry),
        readState: () => {
            throw new Error('private native details');
        },
    });
    record('3d', 'active');
    await flush();
    assert.equal(logs[1].message, 'Puck native snapshot unavailable');
    assert.equal(
        JSON.stringify(logs).includes('private native details'),
        false,
    );
});

test('map wires diagnostics into provider, puck and map attachment transitions', () => {
    const source = readFileSync(
        new URL('../map-canvas.js', import.meta.url),
        'utf8',
    );
    assert.match(source, /recordPuckTransition\('3d', status\)/);
    assert.match(source, /recordPuckTransition\('provider', status\)/);
    assert.match(source, /recordPuckTransition\('map', 'attached'\)/);
    assert.match(
        source,
        /readState: \(\) => getLocationPuck3DStateAsync\(mapViewRef\)/,
    );
});
