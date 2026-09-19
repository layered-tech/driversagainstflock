import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as presencePolicy from '../alpr-presence-policy.js';

const require = createRequire(import.meta.url);
const { code } = require('@babel/core').transformSync(
    readFileSync(
        new URL('../../auto-play-map-status-overlay.js', import.meta.url),
        'utf8',
    ),
    {
        babelrc: false,
        configFile: false,
        plugins: [
            [
                require.resolve('@babel/plugin-transform-react-jsx'),
                { runtime: 'automatic' },
            ],
            require.resolve('@babel/plugin-transform-modules-commonjs'),
        ],
    },
);
let speedLimit = { speedLimitMph: 35 };
const mocks = {
    'react-native': {
        View: 'View',
        Text: 'Text',
        ActivityIndicator: 'ActivityIndicator',
        useColorScheme: () => 'light',
    },
    'react/jsx-runtime': {
        jsx: (type, props) => ({ type, props }),
        jsxs: (type, props) => ({ type, props }),
        Fragment: 'Fragment',
    },
    './auto-play-map-status-layout': {
        getAutoPlaySpeedLimitBadgeSize: () => 50,
        getAutoPlaySpeedLimitOverlayLayout: () => ({
            positionStyle: {},
            alignmentFrameStyle: {},
        }),
    },
    './design-system/tokens': { dafSemanticColors: {} },
    './map/driving-location-road-stack': {
        DrivingLocationRoadStack: 'DrivingLocationRoadStack',
    },
    './map/marker-loading-indicator': {
        MarkerLoadingIndicator: 'MarkerLoadingIndicator',
    },
    './map/navigation-puck-layout': { AUTO_PLAY_NAVIGATION_PUCK_SIZE: 50 },
    './map/speed-limit': {
        SpeedLimitSign: 'SpeedLimitSign',
        useRouteSpeedLimit: () => speedLimit,
        getRouteCurrentSpeedMps: () => 15,
        getCurrentSpeedMph: () => 33,
    },
    './map/speed-limit-layout': { AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE: 50 },
};
const exports = {};
new Function('require', 'exports', code)((name) => {
    assert.ok(mocks[name], name);
    return mocks[name];
}, exports);
const flatten = (node) =>
    !node || typeof node !== 'object'
        ? []
        : [node, ...[node.props?.children].flat(Infinity).flatMap(flatten)];

test('confirmation hides road and speed status, preserves the puck anchor, then restores previous visibility', () => {
    const onLocationAnchorLayout = () => {};
    const props = {
        freeDriveIsActive: true,
        markerLoader: {},
        presentation: { mapControlLayoutInsets: {} },
        viewportMetrics: { cameraPadding: {} },
        onLocationAnchorLayout,
    };
    for (const limit of [{ speedLimitMph: 35 }, null]) {
        speedLimit = limit;
        for (const confirmationIsActive of [false, true, false]) {
            const nodes = flatten(
                exports.AutoPlayMapStatusOverlay({
                    ...props,
                    confirmationIsActive,
                }),
            );
            const stack = nodes.find(
                (node) => node.type === 'DrivingLocationRoadStack',
            );
            assert.ok(stack, 'keep the puck anchor mounted');
            assert.equal(
                stack.props.onLocationAnchorLayout,
                onLocationAnchorLayout,
            );
            assert.equal(
                stack.props.currentRoadPillIsVisible,
                !confirmationIsActive,
            );
            assert.equal(
                nodes.some((node) => node.type === 'SpeedLimitSign'),
                !confirmationIsActive,
            );
        }
    }
    const hidden = flatten(
        exports.AutoPlayMapStatusOverlay({
            ...props,
            confirmationIsActive: false,
            rendersSpeedLimit: false,
            statusChromeIsVisible: false,
        }),
    );
    assert.equal(
        hidden.find((node) => node.type === 'DrivingLocationRoadStack').props
            .currentRoadPillIsVisible,
        false,
    );
    assert.equal(
        hidden.some((node) => node.type === 'SpeedLimitSign'),
        false,
    );
});

test('confirmation highlight renders the real node coordinates and disappears when cleared', () => {
    const { code } = require('@babel/core').transformSync(
        readFileSync(
            new URL('../../auto-play-alpr-presence.js', import.meta.url),
            'utf8',
        ),
        {
            babelrc: false,
            configFile: false,
            plugins: [
                [
                    require.resolve('@babel/plugin-transform-react-jsx'),
                    { runtime: 'automatic' },
                ],
                require.resolve('@babel/plugin-transform-modules-commonjs'),
            ],
        },
    );
    const exports = {};
    new Function('require', 'exports', code)((name) => {
        if (name === './map/alpr-presence-policy') return presencePolicy;
        if (name === '@rnmapbox/maps')
            return { ShapeSource: 'ShapeSource', CircleLayer: 'CircleLayer' };
        if (name === 'react/jsx-runtime') return mocks[name];
        return {};
    }, exports);
    assert.equal(exports.AutoPlayPresenceHighlight({ node: null }), null);
    const node = {
        osm_id: 12634608635,
        longitude: -88.2445066,
        latitude: 43.1099621,
    };
    const highlight = exports.AutoPlayPresenceHighlight({ node });
    assert.equal(highlight.type, 'ShapeSource');
    assert.deepEqual(highlight.props.shape.geometry, {
        type: 'Point',
        coordinates: [node.longitude, node.latitude],
    });
    assert.equal(highlight.props.children.type, 'CircleLayer');
    assert.equal(exports.AutoPlayPresenceHighlight({ node: null }), null);
});
