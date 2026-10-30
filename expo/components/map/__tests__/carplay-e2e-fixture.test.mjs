import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { createCarPlayVoiceSearchController } from '../../auto-play-carplay-voice-search.js';
import {
    getE2ECarPlayCommandFromURL,
    getE2EMockFlagsFromURL,
} from '../../root/e2e-map-api-mock-url.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const source = transformSync(
    readFileSync(new URL('../carplay-e2e-fixture.js', import.meta.url), 'utf8'),
    {
        babelrc: false,
        configFile: false,
        plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    },
).code;
function fixture(environment = 'e2e') {
    const writes = [],
        logs = [],
        cachedPlaces = [];
    const module = { exports: {} };
    const modules = {
        './config': { APP_ENVIRONMENT: environment },
        './place-details-cache': {
            setCachedPlaceDetails: async (...args) => cachedPlaces.push(args),
        },
        './saved-locations': {
            savePrimaryLocation: async (...args) => writes.push(args),
            addRecentLocation: async (...args) => writes.push(args),
            loadSearchSavedLocations: async () => ({ favoriteLocations: [] }),
            toggleFavoriteLocation: async (...args) => writes.push(args),
        },
    };
    new Function('require', 'module', 'exports', 'console', source)(
        (name) => modules[name],
        module,
        module.exports,
        { info: (line) => logs.push(line) },
    );
    return { ...module.exports, writes, logs, cachedPlaces };
}

test('route rendering commands await real native map snapshots with platform-specific markers', async () => {
    for (const platform of ['android-auto', 'carplay']) {
        const f = fixture();
        let called = false;
        await f.runCarPlayE2ECommand(
            JSON.stringify({ command: 'route-render' }),
            () => assert.fail('Not JS state'),
            null,
            platform,
            null,
            async () => {
                called = true;
                return { zoom: 12, renderedRouteKeys: ['ideal'] };
            },
        );
        assert.ok(called);
        assert.equal(
            f.logs[0],
            `[E2E] ${platform}-route-render {"zoom":12,"renderedRouteKeys":["ideal"]}`,
        );
    }
    assert.equal(
        getE2ECarPlayCommandFromURL(
            'driversagainstflock://e2e-carplay?command=route-render',
        ).requestType,
        'carplay',
    );
});

test('fixed voice transcripts run through the voice controller once after Voice is pressed', async () => {
    const f = fixture(),
        queries = [];
    const native = {
        stopVoiceInput() {},
        startVoiceInput() {
            assert.fail('The E2E case must not open the microphone');
        },
    };
    for (const transcript of ['Walmart', 'Walmart Delafield']) {
        await f.runCarPlayE2ECommand(
            JSON.stringify({ command: 'voice', transcript }),
        );
        const controller = createCarPlayVoiceSearchController({
            getHybridVoice: () => f.getCarPlayE2EVoice(native),
            onVoiceNavigation: (_, query, type) => queries.push([query, type]),
        });
        controller.start({
            onFallback: () => assert.fail('E2E transcript should be available'),
        });
        await new Promise((done) => setImmediate(done));
        assert.equal(f.getCarPlayE2EVoice(native), native);
    }
    assert.deepEqual(queries, [
        ['Walmart', 'search'],
        ['Walmart Delafield', 'search'],
    ]);
    assert.equal(
        f.logs.filter((line) => line.startsWith('[E2E] carplay-voice-consumed'))
            .length,
        2,
    );
});

test('fixture commands cannot alter saved places or replace voice input outside E2E', async () => {
    for (const environment of ['development', 'production']) {
        const f = fixture(environment),
            native = {};
        assert.equal(
            await f.runCarPlayE2ECommand(JSON.stringify({ command: 'seed' })),
            false,
        );
        assert.equal(
            await f.runCarPlayE2ECommand(
                JSON.stringify({ command: 'voice', transcript: 'Walmart' }),
            ),
            false,
        );
        assert.equal(f.getCarPlayE2EVoice(native), native);
        assert.equal(
            await f.runCarPlayE2ECommand(
                JSON.stringify({ command: 'locations', locations: 'none' }),
            ),
            false,
        );
        assert.deepEqual(f.writes, []);
        assert.deepEqual(f.cachedPlaces, []);
    }
});

test('seeded saved places have cached details so synthetic IDs never require live place lookup', async () => {
    for (const platform of ['carplay', 'android-auto']) {
        const f = fixture();
        await f.runCarPlayE2ECommand(
            JSON.stringify({ command: 'seed' }),
            null,
            null,
            platform,
        );
        assert.equal(f.cachedPlaces.length, 4);
        for (const write of f.writes) {
            const location = write.at(-1);
            const cached = f.cachedPlaces.find(
                ([id]) => id === location.id,
            )?.[1];
            assert.ok(cached, location.id);
            assert.equal(cached.id, location.id);
            assert.equal(cached.displayName.text, location.name);
            assert.deepEqual(cached.location, {
                latitude: location.latitude,
                longitude: location.longitude,
            });
        }
    }
});

test('Dashboard fixtures select Home, Work, both or neither through saved-location persistence', async () => {
    for (const [locations, expected] of [
        ['both', [true, true]],
        ['home', [true, false]],
        ['work', [false, true]],
        ['none', [false, false]],
    ]) {
        const f = fixture();
        const url = `driversagainstflock://e2e-carplay?command=locations&locations=${locations}`;
        await f.runCarPlayE2ECommand(getE2ECarPlayCommandFromURL(url).query);
        assert.deepEqual(
            f.writes.map(([type]) => type),
            ['home', 'work'],
        );
        assert.deepEqual(
            f.writes.map(([, location]) => Boolean(location)),
            expected,
        );
        assert.match(f.logs.at(-1), /carplay-locations-set/);
    }
    for (const locations of ['', 'invalid']) {
        assert.equal(
            getE2ECarPlayCommandFromURL(
                `driversagainstflock://e2e-carplay?command=locations&locations=${locations}`,
            ),
            null,
        );
        await assert.rejects(
            fixture().runCarPlayE2ECommand(
                JSON.stringify({ command: 'locations', locations }),
            ),
            /Unsupported/,
        );
    }
});

test('fixture seeds all four saved-place categories and reset removes an unused transcript', async () => {
    const f = fixture();
    await f.runCarPlayE2ECommand(JSON.stringify({ command: 'seed' }));
    assert.equal(f.writes.length, 4);
    assert.deepEqual(
        f.writes.slice(0, 2).map(([type]) => type),
        ['home', 'work'],
    );
    await f.runCarPlayE2ECommand(
        JSON.stringify({ command: 'voice', transcript: 'Walmart' }),
    );
    let reset = 0;
    await f.runCarPlayE2ECommand(
        JSON.stringify({ command: 'reset' }),
        null,
        async () => {
            reset++;
        },
    );
    const native = {};
    assert.equal(f.getCarPlayE2EVoice(native), native);
    assert.equal(reset, 1);
});

test('CarPlay setup links do not turn on API mocks or accept arbitrary transcripts', () => {
    const url =
        'driversagainstflock://e2e-carplay?command=voice&transcript=Walmart%20Delafield';
    assert.equal(
        JSON.parse(getE2ECarPlayCommandFromURL(url).query).transcript,
        'Walmart Delafield',
    );
    assert.equal(getE2EMockFlagsFromURL(url).mocksAreEnabled, false);
    for (const value of [
        'https://example.com/e2e-carplay?command=seed',
        'driversagainstflock://e2e-carplay?command=voice&transcript=other',
        'driversagainstflock://e2e-carplay?command=execute',
    ])
        assert.equal(getE2ECarPlayCommandFromURL(value), null);
});

test('CarPlay state distinguishes the saved appearance from the preset Mapbox actually rendered', () => {
    const autoPlay = readFileSync(
        new URL('../../auto-play.js', import.meta.url),
        'utf8',
    );
    const preferences = {
        mapStyleURL: 'satellite-style',
        mapLightPresetPreference: 'night',
    };
    const appearance = { mapLightPreset: 'day' };
    const context = vm.createContext({
        e2eMapApiMocksCanBeEnabled: () => true,
        require: () => ({ runCarPlayE2ECommand: (_, snapshot) => snapshot() }),
        getAutoPlayState: () => ({}),
        getSharedMapPreferencesState: () => preferences,
        getRootMapButtons: () => [],
        MAP_LAYER_STYLES: [
            { key: 'standard', styleURL: 'standard-style' },
            { key: 'standard-satellite', styleURL: 'satellite-style' },
        ],
        rootMapButtonAppearance: appearance,
        autoPlayPrimaryLocations: {},
        routePreviewIsVisible: false,
        getDirectionsRouteOptions: () => [],
    });
    vm.runInContext(
        autoPlay
            .slice(
                autoPlay.indexOf('export function dispatchAutoPlayE2ECommand('),
                autoPlay.indexOf('function replayPendingVoiceNavigation('),
            )
            .replace('export function', 'function'),
        context,
    );
    const snapshot = context.dispatchAutoPlayE2ECommand({
        requestType: 'carplay',
    });
    assert.equal(snapshot.mapLayer, 'standard-satellite');
    assert.equal(snapshot.mapLightPresetPreference, 'night');
    assert.equal(snapshot.appliedMapLightPreset, 'day');
    appearance.mapLightPreset = 'night';
    preferences.mapStyleURL = 'standard-style';
    const updated = context.dispatchAutoPlayE2ECommand({
        requestType: 'carplay',
    });
    assert.equal(updated.mapLayer, 'standard');
    assert.equal(updated.appliedMapLightPreset, 'night');
});

test('Android Auto reuses saved fixtures with separate proof markers', async () => {
    const f = fixture();
    await f.runCarPlayE2ECommand(
        JSON.stringify({ command: 'seed' }),
        null,
        null,
        'android-auto',
    );
    assert.equal(f.writes.length, 4);
    assert.equal(f.logs.at(-1), '[E2E] android-auto-seeded');
    await f.runCarPlayE2ECommand(
        JSON.stringify({ command: 'state' }),
        () => ({ previewVisible: true }),
        null,
        'android-auto',
    );
    assert.equal(
        f.logs.at(-1),
        '[E2E] android-auto-state {"previewVisible":true}',
    );
    let reset = false;
    await f.runCarPlayE2ECommand(
        JSON.stringify({ command: 'reset' }),
        null,
        async () => {
            reset = true;
        },
        'android-auto',
    );
    assert.equal(reset, true);
    assert.equal(f.logs.at(-1), '[E2E] android-auto-ui-reset');
});

test('Android Auto recognized queries use the voice request path only in E2E', async () => {
    for (const environment of ['e2e', 'development', 'production']) {
        const f = fixture(environment);
        const queries = [];
        for (const query of ['Walmart', 'Walmart Delafield']) {
            const handled = await f.runCarPlayE2ECommand(
                JSON.stringify({ command: 'search', query }),
                null,
                null,
                'android-auto',
                (value) => queries.push(value),
            );
            assert.equal(handled, environment === 'e2e');
        }
        assert.deepEqual(
            queries,
            environment === 'e2e' ? ['Walmart', 'Walmart Delafield'] : [],
        );
    }
    const f = fixture();
    await assert.rejects(
        f.runCarPlayE2ECommand(
            JSON.stringify({ command: 'search', query: 'arbitrary' }),
            null,
            null,
            'android-auto',
            () => assert.fail('invalid query'),
        ),
        /Unsupported/,
    );
});
