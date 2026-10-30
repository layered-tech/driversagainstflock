import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTourModule } from './tour-test-helpers.mjs';

// Expo Router's focus providers must travel with retained scenes. Otherwise an
// inactive panel inherits the root's focus and can take ownership of the map.
test('retained scenes preserve their route focus instead of inheriting host focus', () => {
    const contexts = [];
    const focusContext = { Provider: Symbol('route-focus') };
    const focusedKeyContext = { Provider: Symbol('focused-key') };
    let published;
    const store = { publish: (id, scene) => (published = scene), release() {} };
    const context = () => ({ Provider: Symbol('navigation-provider') });
    const mocks = {
        react: {
            createContext: () => {
                const value = context();
                contexts.push(value);
                return value;
            },
            forwardRef: (render) => render,
            useContext: (value) =>
                value === contexts[1]
                    ? store
                    : value === focusContext
                      ? false
                      : value === focusedKeyContext
                        ? 'current-map-route'
                        : null,
            useId: () => 'inactive-panel',
            useLayoutEffect: (effect) => effect(),
        },
        'react-native': { Platform: { OS: 'android' }, View: 'View' },
        'react-native-gesture-handler': {},
        'expo-router': { useIsFocused: () => false },
        nativewind: { cssInterop: (component) => component },
        '@rnmapbox/maps': { MapView: 'MapView' },
        './config': { APP_ENVIRONMENT: 'test' },
        './persistent-map-state': {},
        'expo-router/build/react-navigation/core': {
            NavigationContext: context(),
            NavigationRouteContext: context(),
        },
        'expo-router/build/react-navigation/core/useIsFocused': {
            IsFocusedContext: focusContext,
            FocusedRouteKeyContext: focusedKeyContext,
        },
    };
    for (const name of [
        'NavigationBuilderContext',
        'NavigationStateContext',
        'NavigationFocusedRouteStateContext',
    ]) {
        mocks[`expo-router/build/react-navigation/core/${name}`] = {
            [name]: context(),
        };
    }
    mocks['expo-router/build/react-navigation/core/NavigationProvider'] = {
        NamedRouteContextListContext: context(),
    };
    const { PersistentMapScene } = loadTourModule(
        new URL('../persistent-map-host.js', import.meta.url),
        mocks,
    );
    const scene = PersistentMapScene({ children: 'panel' });
    scene.type(scene.props);
    assert.equal(published.focused, false);
    let child = published.children;
    const values = new Map();
    while (child && typeof child === 'object') {
        values.set(child.type, child.props.value);
        child = child.props.children;
    }
    assert.equal(values.get(focusContext.Provider), false);
    assert.equal(values.get(focusedKeyContext.Provider), 'current-map-route');
    assert.equal(child, 'panel');
});
