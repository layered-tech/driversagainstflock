import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHookHarness, loadTourModule } from './tour-test-helpers.mjs';

test('Duo identification survives opening and rotating out of vertical rail mode', () => {
    const hooks = createHookHarness();
    let edge = 'trailing';
    const { DuoDeviceProvider } = loadTourModule(
        new URL('../../root/duo-device-context.js', import.meta.url),
        {
            react: {
                ...hooks.react,
                createContext: () => ({ Provider: 'Provider' }),
            },
            'react-native': {
                Platform: { OS: 'ios' },
                useWindowDimensions: () => ({ width: 466, height: 678 }),
            },
            'expo-status-bar': { useVerticalBarEdgeIOS: () => edge },
        },
    );
    const render = () =>
        hooks.render(() => DuoDeviceProvider({ children: 'App' }));
    assert.equal(render().props.value, true);
    edge = null;
    assert.equal(render().props.value, true);
    assert.equal(render().props.children, 'App');
});

for (const [name, platform, isPad, width, height, expected] of [
    ['fresh open portrait Duo', 'ios', false, 678, 982, true],
    ['ordinary landscape iPhone', 'ios', false, 932, 430, false],
    ['iPad', 'ios', true, 834, 1194, false],
    ['open Android foldable', 'android', false, 800, 844, true],
    ['Pixel Fold inner display', 'android', false, 852, 883, true],
    ['closed Android foldable', 'android', false, 412, 915, false],
    ['landscape Android phone', 'android', false, 915, 412, false],
]) {
    test(`${name} selects its intended layout without a vertical rail`, () => {
        const hooks = createHookHarness();
        const { DuoDeviceProvider } = loadTourModule(
            new URL('../../root/duo-device-context.js', import.meta.url),
            {
                react: {
                    ...hooks.react,
                    createContext: () => ({ Provider: 'Provider' }),
                },
                'react-native': {
                    Platform: { OS: platform, isPad },
                    useWindowDimensions: () => ({ width, height }),
                },
                'expo-status-bar': { useVerticalBarEdgeIOS: () => null },
            },
        );
        assert.equal(
            hooks.render(() => DuoDeviceProvider({ children: 'App' })).props
                .value,
            expected,
        );
    });
}

test('Android returns to phone layout when folded and restores panes when reopened', () => {
    const hooks = createHookHarness();
    let dimensions = { width: 852, height: 883 };
    const { DuoDeviceProvider } = loadTourModule(
        new URL('../../root/duo-device-context.js', import.meta.url),
        {
            react: {
                ...hooks.react,
                createContext: () => ({ Provider: 'Provider' }),
            },
            'react-native': {
                Platform: { OS: 'android', isPad: false },
                useWindowDimensions: () => dimensions,
            },
            'expo-status-bar': { useVerticalBarEdgeIOS: () => null },
        },
    );
    const render = () =>
        hooks.render(() => DuoDeviceProvider({ children: 'App' }));
    assert.equal(render().props.value, true);
    dimensions = { width: 412, height: 915 };
    assert.equal(render().props.value, false);
    dimensions = { width: 883, height: 852 };
    assert.equal(render().props.value, true);
});
