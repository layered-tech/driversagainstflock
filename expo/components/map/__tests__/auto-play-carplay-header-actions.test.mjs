import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {
    getAutoPlayHeaderButtonVisibility,
    getAutoPlayPrimaryLocationHeaderActionTypes,
} from '../../auto-play-template-state.js';

const source = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);

function harness() {
    const pressed = [];
    const context = vm.createContext({
        activeNavigationRoute: null,
        autoPlayPlatform: { usesHeaderExitNavigationButton: true },
        autoPlayPrimaryLocations: { home: {}, work: {} },
        rootMapButtonAppearance: { drivingMapViewMode: 'perspective' },
        getAutoPlayHeaderButtonVisibility,
        getAutoPlayPrimaryLocationHeaderActionTypes,
        getPrimaryLocationLabel: (type) => type,
        makeButtonGlyphImage: (name) => name,
        loadAutoPlayModule: () => ({ Flag: { Persistent: 4 } }),
        getRootHeaderDrivingMapViewButtonImage: () => 'overview',
        getRootHeaderExitNavigationButtonImage: () => 'cancel',
        handleRootHeaderSearchPress: () => pressed.push('search'),
        handleRootHeaderVoiceSearchPress: () => pressed.push('voice'),
        handleRootHeaderDrivingMapViewPress: () => pressed.push('overview'),
        handleRootHeaderExitNavigationPress: () => pressed.push('cancel'),
        openRouteStepsTemplate: () => pressed.push('steps'),
        openMapOptionsTemplate: () => pressed.push('options'),
        handleRootHeaderPrimaryLocationPress: (type) => pressed.push(type),
    });
    vm.runInContext(
        source.slice(
            source.indexOf('const ROOT_HEADER_SEARCH_IMAGE'),
            source.indexOf('function showAutoPlayError('),
        ),
        context,
    );
    return {
        context,
        pressed,
        actions: () => context.getRootMapHeaderActions(),
        pressCarPlayHeader: () => {
            const { ios } = context.getRootMapHeaderActions();
            // The installed native parser reverses the leading group.
            [...ios.leadingNavigationBarButtons]
                .reverse()
                .forEach((button) => button.onPress());
            ios.trailingNavigationBarButtons.forEach((button) =>
                button.onPress(),
            );
        },
    };
}

test('CarPlay idle header opens Search, Options, Home, and Work', () => {
    const h = harness();
    h.pressCarPlayHeader();
    assert.deepEqual(h.pressed, ['search', 'options', 'home', 'work']);
});

test('CarPlay navigating header opens Overview, Cancel, Options, and Steps', () => {
    const h = harness();
    h.actions();
    h.context.activeNavigationRoute = {};
    h.pressCarPlayHeader();
    assert.deepEqual(h.pressed, ['overview', 'cancel', 'options', 'steps']);
    h.pressed.length = 0;
    h.context.activeNavigationRoute = null;
    h.pressCarPlayHeader();
    assert.deepEqual(h.pressed, ['search', 'options', 'home', 'work']);
});

test('CarPlay removes unsaved locations and refreshes when a location is saved', () => {
    const h = harness();
    h.context.autoPlayPrimaryLocations = { home: {} };
    h.pressCarPlayHeader();
    assert.deepEqual(h.pressed, ['search', 'options', 'home']);
    h.pressed.length = 0;
    h.context.autoPlayPrimaryLocations = { work: {} };
    h.pressCarPlayHeader();
    assert.deepEqual(h.pressed, ['search', 'options', 'work']);
    h.pressed.length = 0;
    h.context.autoPlayPrimaryLocations = {};
    h.pressCarPlayHeader();
    assert.deepEqual(h.pressed, ['search', 'options']);
});

test('Android Auto header actions retain persistence and existing callbacks', () => {
    const h = harness();
    for (const button of h.actions().android) {
        assert.equal(button.flags & 4, 4);
        button.onPress();
    }
    assert.deepEqual(h.pressed, ['search', 'home', 'work', 'options']);
});
