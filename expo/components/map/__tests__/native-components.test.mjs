import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');

test('the persistent bottom sheet resolves themed styles before passing them to the library', () => {
    const module = { exports: {} };
    const source = transformSync(
        readFileSync(
            new URL('../native-components.js', import.meta.url),
            'utf8',
        ),
        {
            babelrc: false,
            configFile: false,
            plugins: [
                [
                    require('@babel/plugin-transform-react-jsx'),
                    { runtime: 'automatic' },
                ],
                require('@babel/plugin-transform-modules-commonjs'),
            ],
        },
    ).code;
    const mocks = {
        '@gorhom/bottom-sheet': {
            __esModule: true,
            default: 'BottomSheet',
            BottomSheetModal: 'BottomSheetModal',
            BottomSheetFlatList: 'BottomSheetFlatList',
            BottomSheetScrollView: 'BottomSheetScrollView',
            BottomSheetView: 'BottomSheetView',
        },
        '@rnmapbox/maps': { MapView: 'MapView' },
        'expo-glass-effect': { GlassView: 'GlassView' },
        nativewind: {
            cssInterop: (component, mapping) => ({
                component,
                mapping,
                resolvesStyles: true,
            }),
            remapProps: (component, mapping) => ({
                component,
                mapping,
                resolvesStyles: false,
            }),
        },
        react: { forwardRef: (fn) => fn },
        'react-native': {},
        './responsive-map-layout': {},
        './safe-area-view-with-bottom-offset': {},
    };
    new Function('require', 'module', 'exports', source)(
        (name) => mocks[name],
        module,
        module.exports,
    );

    const sheet = module.exports.NativeWindBottomSheet;
    assert.equal(sheet.component, 'BottomSheet');
    assert.equal(
        sheet.resolvesStyles,
        true,
        'Gorhom renders its background without NativeWind, so deferred class placeholders leave the default white background',
    );
    assert.deepEqual(sheet.mapping, {
        backgroundClassName: 'backgroundStyle',
        handleIndicatorClassName: 'handleIndicatorStyle',
    });
});
