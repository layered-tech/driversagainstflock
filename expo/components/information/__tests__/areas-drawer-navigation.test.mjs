import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTourModule } from '../../map/__tests__/tour-test-helpers.mjs';
import * as drawerItems from '../../root/app-drawer-items.js';

const { AppDrawerContent } = loadTourModule(
    new URL('../../root/app-drawer-content.js', import.meta.url),
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
            useColorScheme: () => 'light',
        },
        '../../lib/auth': { useAuth: () => ({ isAuthenticated: false }) },
        '../../lib/auth/constants': { APP_ENVIRONMENT: 'development' },
        '../../lib/crashlytics': {},
        '../areas/areas-context': { useAreas: () => ({ unreadCount: 0 }) },
        '../design-system/icon': { Icon: 'Icon' },
        '../map/config': { SHOW_MAP_DEBUG_CONTROLS: false },
        '../map/shared-map-state': { useSharedMapState: () => ({}) },
        '../scorecard/scorecard-context': {
            useScorecard: () => ({ isHydrated: false }),
        },
        './app-drawer-icon': { AppDrawerIcon: 'AppDrawerIcon' },
        './app-drawer-items': drawerItems,
    },
);

function findItem(node, testID) {
    if (Array.isArray(node)) {
        return node.map((child) => findItem(child, testID)).find(Boolean);
    }
    if (!node || typeof node !== 'object') {
        return undefined;
    }
    if (node.props?.testID === testID) {
        return node;
    }
    return findItem(node.props?.children, testID);
}

for (const screen of ['[areaId]/index', '[areaId]/map', '[areaId]/alerts']) {
    test(`My areas opens the list when the saved screen is ${screen}`, () => {
        const calls = [];
        const tree = AppDrawerContent({
            state: {
                index: 0,
                routes: [
                    { name: 'index' },
                    {
                        name: 'areas',
                        state: { index: 0, routes: [{ name: screen }] },
                    },
                ],
            },
            navigation: {
                navigate: (...args) => calls.push(args),
                closeDrawer: () => calls.push('close'),
            },
        });

        findItem(tree, 'drawer-areas-button').props.onPress();
        assert.deepEqual(calls, [['areas', { screen: 'index' }], 'close']);

        calls.length = 0;
        findItem(tree, 'drawer-index-button').props.onPress();
        assert.deepEqual(calls, [['index'], 'close']);
    });
}
