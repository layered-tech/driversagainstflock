import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createAutoPlayMapOptionsTemplate } from '../../auto-play-map-options.js';

function createHarness({ loaded = true, failPush = false } = {}) {
    let preferences = {
        mapPreferencesAreLoaded: loaded,
        surveillanceMarkersVisible: true,
        markerClustersEnabled: true,
        cameraConesVisible: true,
        preferPrivateRoutes: false,
        mapTrafficEnabled: false,
        policeAlertsVisible: false,
        mapStyleURL: 'keep-current-style',
    };
    let weatherEnabled = true;
    const preferenceListeners = new Set();
    const weatherListeners = new Set();
    const updates = [];
    const writes = [];
    const errors = [];
    const templates = [];
    const setPreferences = (patch) => {
        writes.push(patch);
        preferences = { ...preferences, ...patch };
        for (const listener of preferenceListeners) listener(preferences);
    };
    const options = {
        ListTemplate: class {
            constructor(config) {
                this.config = config;
                templates.push(this);
            }
            push() {
                return failPush
                    ? Promise.reject(new Error('Push failed'))
                    : Promise.resolve();
            }
            updateSections(section) {
                this.config.sections = section;
                updates.push(section);
                return Promise.resolve();
            }
        },
        getBackHeaderAction: (onPress) => ({
            android: { startHeaderAction: { onPress } },
        }),
        getPreferences: () => preferences,
        setPreferences,
        subscribePreferences(listener) {
            preferenceListeners.add(listener);
            return () => preferenceListeners.delete(listener);
        },
        weatherStore: {
            hydrate: () => Promise.resolve(),
            getSnapshot: () => ({ preferences: { enabled: weatherEnabled } }),
            setEnabled(enabled) {
                weatherEnabled = enabled;
                for (const listener of weatherListeners) listener();
            },
            subscribe(listener) {
                weatherListeners.add(listener);
                return () => weatherListeners.delete(listener);
            },
        },
        mapLayers: [
            { key: 'standard', label: 'Standard', styleURL: 'standard-style' },
            {
                key: 'standard-satellite',
                label: 'Standard Satellite',
                styleURL: 'satellite-style',
            },
        ],
        lightPresets: ['Auto', 'Dawn', 'Day', 'Dusk', 'Night'].map((label) => ({
            key: label.toLowerCase(),
            label,
        })),
        requestIsCurrent: () => true,
        onError: () => errors.push('error'),
    };
    return {
        options,
        setPreferences,
        updates,
        writes,
        errors,
        preferenceListeners,
        weatherListeners,
        templates,
    };
}

async function open(harness) {
    const presentation = createAutoPlayMapOptionsTemplate(harness.options);
    await presentation.pushPromise;
    return presentation;
}

test('car map options show layer and time first, then only weather and Waze toggles', async () => {
    const harness = createHarness();
    const { template } = await open(harness);
    assert.equal(template.config.title.text, 'Map settings');
    const items = template.config.sections.items;
    assert.deepEqual(
        items.map((item) => item.title.text),
        [
            'Map layer',
            "Map's Time of Day",
            'Rain and snow effects',
            'Police reports (Waze)',
        ],
    );
    const labels = items
        .filter((item) => item.type === 'toggle')
        .map((item) => item.title.text);
    const phoneSource = readFileSync(
        new URL('../map-layer-controls.js', import.meta.url),
        'utf8',
    );
    const phoneLabels = [
        ...phoneSource.matchAll(/<SettingSwitchRow\s+label="([^"]+)"/g),
    ].map((match) => match[1]);
    assert.deepEqual(
        labels,
        phoneLabels.filter((label) =>
            ['Rain and snow effects', 'Police reports (Waze)'].includes(label),
        ),
    );
});

test('car settings preserve the phone-only marker, routing, and traffic preferences', async () => {
    const harness = createHarness();
    const { template } = await open(harness);
    for (const row of template.config.sections.items.filter(
        (item) => item.type === 'toggle',
    )) {
        await row.onPress(null, !row.checked);
    }
    assert.deepEqual(harness.writes, [{ policeAlertsVisible: true }]);
    const preferences = harness.options.getPreferences();
    assert.deepEqual(
        [
            preferences.surveillanceMarkersVisible,
            preferences.markerClustersEnabled,
            preferences.cameraConesVisible,
            preferences.preferPrivateRoutes,
            preferences.mapTrafficEnabled,
        ],
        [true, true, true, false, false],
    );
    assert.equal(
        harness.options.getPreferences().mapStyleURL,
        'keep-current-style',
    );
});

test('all toggles update their shared preference and remain set when reopened', async () => {
    const harness = createHarness();
    const { template } = await open(harness);
    for (const label of ['Rain and snow effects', 'Police reports (Waze)']) {
        const row = template.config.sections.items.find(
            (item) => item.title.text === label,
        );
        await row.onPress(null, !row.checked);
    }
    assert.equal(harness.options.getPreferences().policeAlertsVisible, true);
    assert.equal(
        harness.options.weatherStore.getSnapshot().preferences.enabled,
        false,
    );
    template.config.onPopped();
    const reopened = await open(harness);
    assert.deepEqual(
        reopened.template.config.sections.items
            .filter((item) => item.type === 'toggle')
            .map((item) => item.checked),
        [false, true],
    );
});

test('phone changes update the open list, while unrelated weather updates are deduplicated', async () => {
    const harness = createHarness();
    const { template } = await open(harness);
    harness.setPreferences({ policeAlertsVisible: true });
    assert.equal(
        template.config.sections.items.find(
            (item) => item.title.text === 'Police reports (Waze)',
        ).checked,
        true,
    );
    const count = harness.updates.length;
    for (const listener of harness.weatherListeners) listener();
    assert.equal(harness.updates.length, count);
});

test('waits for preferences to load, and releases listeners on dismissal or push failure', async () => {
    const harness = createHarness({ loaded: false });
    const { template } = await open(harness);
    assert.equal(
        template.config.sections.items[0].title.text,
        'Loading map settings',
    );
    harness.setPreferences({ mapPreferencesAreLoaded: true });
    const row = template.config.sections.items.find(
        (item) => item.type === 'toggle',
    );
    template.config.onPopped();
    assert.equal(harness.preferenceListeners.size, 0);
    assert.equal(harness.weatherListeners.size, 0);
    const count = harness.writes.length;
    await row.onPress(null, false);
    assert.equal(harness.writes.length, count);
    const failed = createHarness({ failPush: true });
    await open(failed);
    assert.equal(failed.errors.length, 1);
    assert.equal(failed.preferenceListeners.size, 0);
    assert.equal(failed.weatherListeners.size, 0);
});

test('the sliders button works with or without an active route', async () => {
    const source = readFileSync(
        new URL('../../auto-play.js', import.meta.url),
        'utf8',
    );
    assert.match(source, /sliders: 0xf1de/);
    assert.match(
        source,
        /ROOT_HEADER_MAP_OPTIONS_IMAGE = makeButtonGlyphImage\('sliders'/,
    );
    const start = source.indexOf('function openMapOptionsTemplate(');
    const end = source.indexOf('function openSearchTemplate(', start);
    assert.ok(start >= 0 && end > start);
    for (const [activeNavigationRoute, rootMapTemplateIsReady] of [
        [null, true],
        [{}, true],
        [null, false],
        [{}, false],
    ]) {
        let opened = 0;
        const fn = vm.runInNewContext(`(${source.slice(start, end)})`, {
            activeNavigationRoute,
            rootMapTemplate: {},
            rootMapTemplateIsReady,
            loadAutoPlayModule: () => ({ ListTemplate: null }),
            createAutoPlayMapOptionsTemplate: () => {
                opened++;
                return { pushPromise: Promise.resolve() };
            },
            getBackHeaderAction() {},
            getSharedMapPreferencesState() {},
            setSharedMapPreferencesState() {},
            addSharedMapSettingsStateListener() {},
            weatherStore: {},
            showAutoPlayError() {},
            MAP_LAYER_STYLES: [],
            MAP_LIGHT_PRESET_OPTIONS: [],
        });
        await fn();
        assert.equal(opened, rootMapTemplateIsReady ? 1 : 0);
    }
});

test('map layer and time-of-day choices match the phone and update shared preferences', async () => {
    const harness = createHarness();
    const { template } = await open(harness);
    await template.config.sections.items
        .find((item) => item.title.text === 'Map layer')
        .onPress();
    const layer = harness.templates.at(-1);
    assert.equal(layer.config.sections.type, 'radio');
    assert.deepEqual(
        layer.config.sections.items.map((row) => row.title.text),
        ['Standard', 'Standard Satellite'],
    );
    layer.config.sections.items[1].onPress();
    assert.equal(
        harness.options.getPreferences().mapStyleURL,
        'satellite-style',
    );
    assert.equal(harness.options.getPreferences().mapStyleIsUserSelected, true);
    assert.deepEqual(
        layer.config.sections.items.map((row) => row.selected),
        [false, true],
    );
    layer.config.sections.items[0].onPress();
    assert.equal(
        harness.options.getPreferences().mapStyleIsUserSelected,
        false,
    );
    layer.config.onPopped();
    const stale = layer.config.sections.items[1];
    const count = harness.writes.length;
    stale.onPress();
    assert.equal(harness.writes.length, count);
    await template.config.sections.items
        .find((item) => item.title.text === "Map's Time of Day")
        .onPress();
    const light = harness.templates.at(-1);
    assert.deepEqual(
        light.config.sections.items.map((row) => row.title.text),
        ['Auto', 'Dawn', 'Day', 'Dusk', 'Night'],
    );
    light.config.sections.items[4].onPress();
    assert.equal(
        harness.options.getPreferences().mapLightPresetPreference,
        'night',
    );
    assert.equal(
        harness.options.getPreferences().mapStyleURL,
        'standard-style',
    );
    assert.equal(
        light.config.sections.items.filter((row) => row.selected).length,
        1,
    );
    assert.equal(light.config.sections.items[4].selected, true);
});
