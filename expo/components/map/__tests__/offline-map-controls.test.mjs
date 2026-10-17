import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { code } = require('@babel/core').transformSync(
    readFileSync(
        new URL('../offline-map-controls.js', import.meta.url),
        'utf8',
    ),
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

function findToggle(tree) {
    if (!tree || typeof tree !== 'object') return undefined;
    if (Array.isArray(tree)) return tree.map(findToggle).find(Boolean);
    if (tree.props?.testID === 'offline-map-section-toggle') return tree;
    return findToggle(tree.props?.children);
}

for (const statusLabel of [
    'Not downloaded',
    'Downloading 50%',
    'Ready offline',
]) {
    test(`the collapsed offline control exposes ${statusLabel} to screen readers`, () => {
        const modules = {
            react: { useEffect() {}, useState: () => [false, () => {}] },
            'react/jsx-runtime': require('react/jsx-runtime'),
            'react-native': {
                Alert: {},
                Pressable: 'Pressable',
                Text: 'Text',
                View: 'View',
            },
            '../design-system/icon': { Icon: 'Icon' },
            '../tour-target': { TourTarget: 'TourTarget' },
            './offline-map-action-icon': {
                OfflineMapActionIcon: 'OfflineMapActionIcon',
            },
            './offline-map-utils': { OFFLINE_MAX_ZOOM_OPTIONS: [] },
            './use-offline-map-pack': {
                useOfflineMapPack: () => ({ statusLabel }),
            },
        };
        const module = { exports: {} };
        new Function('require', 'module', 'exports', code)(
            (name) => {
                assert.ok(name in modules, `Unexpected dependency ${name}`);
                return modules[name];
            },
            module,
            module.exports,
        );
        const toggle = findToggle(
            module.exports.OfflineMapControls({
                selectedMapLayer: { label: 'Standard' },
            }),
        );
        assert.equal(
            toggle.props.accessibilityLabel,
            'Offline map download options',
        );
        assert.equal(toggle.props.accessibilityState.expanded, false);
        assert.equal(toggle.props.accessibilityValue?.text, statusLabel);
    });
}
