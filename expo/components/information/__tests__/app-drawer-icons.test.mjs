import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { iconPaths } from '../../design-system/icon-paths.js';
import { loadTourModule } from '../../map/__tests__/tour-test-helpers.mjs';
import * as drawerItems from '../../root/app-drawer-items.js';

const { AppDrawerIcon } = loadTourModule(
    new URL('../../root/app-drawer-icon.js', import.meta.url),
    {
        'react-native': { View: 'View' },
        '../design-system/icon': { Icon: 'Icon' },
    },
);

function drawerRows(node) {
    if (Array.isArray(node)) {
        return node.flatMap(drawerRows);
    }

    if (!node || typeof node !== 'object') {
        return [];
    }

    if (node.type === 'DrawerItem') {
        return [node];
    }

    return drawerRows(
        typeof node.type === 'function'
            ? node.type(node.props)
            : node.props?.children,
    );
}

describe('Navigation drawer icons', () => {
    test('keeps the label column and stroke weight consistent for every icon', () => {
        const names = [
            ...drawerItems.PRIMARY_DRAWER_ITEMS.map(({ icon }) => icon),
            ...drawerItems.HELP_AND_LEGAL_DRAWER_ITEMS.map(({ icon }) => icon),
            'pencil',
            'log-out',
            'user',
            'sliders-horizontal',
            'bug',
            'triangle-alert',
        ];

        for (const name of names) {
            const wrapper = AppDrawerIcon({ name, color: '#56CF8E' });
            const icon = wrapper.props.children;

            assert.match(wrapper.props.className, /h-6 w-6/);
            assert.equal(icon.props.name, name);
            assert.equal(icon.props.color, '#56CF8E');
            assert.ok(iconPaths[name]?.length > 0);
            assert.ok(icon.props.size >= 20 && icon.props.size <= 26);
            assert.ok(
                Math.abs((icon.props.stroke * icon.props.size) / 24 - 2) <
                    0.0001,
            );
        }
    });

    test('balances narrow glyphs and centers the open-bottom gauge', () => {
        const render = (name) => AppDrawerIcon({ name });
        const size = (name) => render(name).props.children.props.size;

        assert.ok(size('flame') > size('circle-help'));
        assert.ok(size('user') > size('info'));
        assert.equal(size('circle-help'), size('info'));
        assert.match(render('gauge').props.className, /translate-y-px/);
        assert.doesNotMatch(render('info').props.className, /translate/);
    });

    test('uses optical icons for navigation, authentication, and developer rows in both themes', () => {
        for (const isAuthenticated of [false, true]) {
            for (const theme of ['light', 'dark']) {
                const { AppDrawerContent } = loadTourModule(
                    new URL(
                        '../../root/app-drawer-content.js',
                        import.meta.url,
                    ),
                    {
                        'expo-constants': { nativeAppVersion: 'test' },
                        'expo-router/drawer': {
                            DrawerContentScrollView: 'ScrollView',
                            DrawerItem: 'DrawerItem',
                            useDrawerStatus: () => 'open',
                        },
                        'react-native': {
                            Alert: {},
                            Text: 'Text',
                            View: 'View',
                            useColorScheme: () => theme,
                        },
                        '../../lib/auth': {
                            useAuth: () => ({ isAuthenticated }),
                        },
                        '../../lib/auth/constants': {
                            APP_ENVIRONMENT: 'development',
                        },
                        '../../lib/crashlytics': {},
                        '../design-system/icon': { Icon: 'Icon' },
                        '../map/config': { SHOW_MAP_DEBUG_CONTROLS: true },
                        '../map/shared-map-state': {
                            useSharedMapState: () => ({
                                debugOverlayIsVisible: true,
                                mapPreferencesAreLoaded: true,
                            }),
                        },
                        '../scorecard/scorecard-context': {
                            useScorecard: () => ({ isHydrated: false }),
                        },
                        './app-drawer-icon': { AppDrawerIcon },
                        './app-drawer-items': drawerItems,
                    },
                );
                const rows = drawerRows(
                    AppDrawerContent({
                        state: { index: 0, routes: [{ name: 'index' }] },
                        navigation: {},
                    }),
                );
                const expectedNames = [
                    ...drawerItems.PRIMARY_DRAWER_ITEMS.map(({ icon }) => icon),
                    ...drawerItems.HELP_AND_LEGAL_DRAWER_ITEMS.map(
                        ({ icon }) => icon,
                    ),
                    ...(isAuthenticated ? ['pencil', 'log-out'] : []),
                    'sliders-horizontal',
                    'bug',
                    'triangle-alert',
                    ...(!isAuthenticated ? ['user'] : []),
                ];

                assert.deepEqual(
                    rows.map((row) => {
                        const color = row.props.focused
                            ? row.props.activeTintColor
                            : row.props.inactiveTintColor;
                        const icon = row.props.icon({ color, size: 24 });

                        assert.equal(icon.type, AppDrawerIcon);
                        assert.equal(icon.props.color, color);

                        return icon.props.name;
                    }),
                    expectedNames,
                );
            }
        }
    });
});
