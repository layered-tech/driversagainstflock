import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTourModule } from './tour-test-helpers.mjs';

test('only open Duo corners add 24px beyond native insets, exactly once', () => {
    let duo = true;
    let dimensions = { width: 982, height: 678 };
    let override = null;
    const { useSafeAreaInsets, DUO_CORNER_SAFE_AREA_PADDING } = loadTourModule(
        new URL('../../../lib/safe-area-insets.js', import.meta.url),
        {
            react: {
                createContext: () => ({}),
                createElement() {},
                useContext: () => override,
                useMemo: (calculate) => calculate(),
            },
            'react-native': {
                Platform: { OS: 'ios' },
                useWindowDimensions: () => dimensions,
            },
            'react-native-safe-area-context': {
                useSafeAreaInsets: () => ({
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 84,
                }),
            },
            '../components/root/duo-device-context': {
                useDuoDevice: () => duo,
            },
        },
    );
    assert.equal(DUO_CORNER_SAFE_AREA_PADDING, 24);
    assert.deepEqual(useSafeAreaInsets(), {
        top: 24,
        bottom: 40,
        left: 24,
        right: 108,
    });
    override = { top: 0, bottom: 20, left: 0, right: 0 };
    assert.deepEqual(
        useSafeAreaInsets(),
        override,
        'nested panes have already consumed the safe area',
    );
    assert.deepEqual(
        useSafeAreaInsets({ ignoreOverride: true }),
        {
            top: 24,
            bottom: 40,
            left: 24,
            right: 108,
        },
        'window-level sheets reserve real safe insets even when launched inside a pane',
    );
    override = null;
    dimensions = { width: 466, height: 678 };
    assert.deepEqual(
        useSafeAreaInsets(),
        {
            top: 0,
            bottom: 16,
            left: 0,
            right: 84,
        },
        'closed Duo keeps its original safe-area spacing',
    );
    dimensions = { width: 678, height: 466 };
    assert.equal(
        useSafeAreaInsets().left,
        0,
        'rotating a closed Duo does not add padding',
    );
    dimensions = { width: 678, height: 982 };
    assert.equal(
        useSafeAreaInsets().left,
        24,
        'open portrait posture retains corner padding',
    );
    duo = false;
    assert.deepEqual(useSafeAreaInsets(), {
        top: 0,
        bottom: 16,
        left: 0,
        right: 84,
    });
});
