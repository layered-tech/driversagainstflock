import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');

function load(file, modules) {
    const { code } = transformSync(
        readFileSync(new URL(file, import.meta.url), 'utf8'),
        {
            configFile: false,
            babelrc: false,
            plugins: [
                [
                    require('@babel/plugin-transform-react-jsx'),
                    { runtime: 'automatic' },
                ],
                require('@babel/plugin-transform-modules-commonjs'),
            ],
        },
    );
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(
        (name) => {
            if (name.endsWith('.ttf')) return name;
            assert.ok(name in modules, `Unexpected dependency ${name}`);
            return modules[name];
        },
        module,
        module.exports,
    );
    return module.exports;
}

for (const [scheme, background] of [
    ['light', '#F5F7F9'],
    ['dark', '#0B0E12'],
    [null, '#F5F7F9'],
]) {
    test(`Areas screens have an opaque background during transitions in ${scheme} mode`, () => {
        let colorScheme = scheme;
        const tokens = load('../../design-system/tokens.js', {
            'react-native': { Platform: { select: (values) => values.ios } },
        });
        const { default: Layout } = load('../../../app/areas/_layout.js', {
            'react/jsx-runtime': require('react/jsx-runtime'),
            'expo-router/stack': { Stack: 'Stack' },
            'expo-font': { useFonts: () => [true, null] },
            'react-native': {
                View: 'View',
                ActivityIndicator: 'ActivityIndicator',
                useColorScheme: () => colorScheme,
            },
            '../../components/design-system/tokens': tokens,
        });
        const options = () => Layout().props.children.props.screenOptions;
        assert.equal(options().contentStyle.backgroundColor, background);
        colorScheme = scheme === 'dark' ? 'light' : 'dark';
        assert.equal(
            options().contentStyle.backgroundColor,
            colorScheme === 'dark' ? '#0B0E12' : '#F5F7F9',
            'The screen background follows theme changes',
        );
    });
}
