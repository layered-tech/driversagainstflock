import 'react-native-gesture-handler';

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useNavigationContainerRef, usePathname } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { useCallback, useEffect, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ContributeProvider } from '../components/contribute/contribute-state';
import { Icon } from '../components/design-system/icon';
import { SharedMapStateProvider } from '../components/map/shared-map-state';
import { AppDrawerContent } from '../components/root/app-drawer-content';
import { AuthCallbackHandler } from '../components/root/auth-callback-handler';
import { DebugDrawer } from '../components/root/debug-drawer';
import { E2EMapApiMockHandler } from '../components/root/e2e-map-api-mock-handler';
import {
    DARK_SYSTEM_BAR_BACKGROUND,
    LIGHT_SYSTEM_BAR_BACKGROUND,
    SystemBars,
} from '../components/root/system-bars';
import { logAnalyticsScreenView } from '../lib/analytics';
import { AuthProvider } from '../lib/auth';
import { installNetworkDebugFetchMonitor } from '../lib/network-debug';
import {
    registerSentryNavigationContainer,
    useSentryRouteTracking,
    withSentryRoot,
} from '../lib/sentry';

installNetworkDebugFetchMonitor();

function RootLayout() {
    const colorScheme = useColorScheme();
    const navigationRef = useNavigationContainerRef();
    const pathname = usePathname();
    const [debugDrawerIsVisible, setDebugDrawerIsVisible] = useState(false);
    const isDarkMode = colorScheme === 'dark';
    const systemBarBackground = isDarkMode
        ? DARK_SYSTEM_BAR_BACKGROUND
        : LIGHT_SYSTEM_BAR_BACKGROUND;

    useSentryRouteTracking();

    useEffect(() => {
        registerSentryNavigationContainer(navigationRef);
    }, [navigationRef]);

    useEffect(() => {
        logAnalyticsScreenView(pathname);
    }, [pathname]);
    const handleCloseDebugDrawer = useCallback(() => {
        setDebugDrawerIsVisible(false);
    }, []);
    const handleOpenDebugDrawer = useCallback(() => {
        setDebugDrawerIsVisible(true);
    }, []);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <BottomSheetModalProvider>
                    <AuthProvider>
                        <AuthCallbackHandler />
                        <E2EMapApiMockHandler />
                        <SystemBars />
                        <SharedMapStateProvider>
                            <ContributeProvider>
                                <View style={{ flex: 1 }}>
                                    <Drawer
                                        drawerContent={(props) => (
                                            <AppDrawerContent
                                                {...props}
                                                onOpenDebugDrawer={
                                                    handleOpenDebugDrawer
                                                }
                                            />
                                        )}
                                        screenOptions={{
                                            drawerActiveTintColor: isDarkMode
                                                ? '#F5F7F9'
                                                : '#11151B',
                                            drawerInactiveTintColor: isDarkMode
                                                ? '#F5F7F9'
                                                : '#11151B',
                                            drawerItemStyle: {
                                                borderRadius: 8,
                                            },
                                            drawerStyle: {
                                                backgroundColor:
                                                    systemBarBackground,
                                            },
                                            headerShown: false,
                                            sceneStyle: {
                                                backgroundColor:
                                                    systemBarBackground,
                                            },
                                        }}
                                    >
                                        <Drawer.Screen
                                            name="index"
                                            options={{
                                                drawerLabel: 'Map',
                                                drawerIcon: ({
                                                    color,
                                                    size,
                                                }) => (
                                                    <Icon
                                                        color={color}
                                                        name="navigation"
                                                        size={size}
                                                    />
                                                ),
                                                title: 'Map',
                                            }}
                                        />
                                        <Drawer.Screen
                                            name="hotlist"
                                            options={{
                                                drawerLabel: 'Hotlist',
                                                drawerIcon: ({
                                                    color,
                                                    size,
                                                }) => (
                                                    <Icon
                                                        color={color}
                                                        name="clock"
                                                        size={size}
                                                    />
                                                ),
                                                title: 'Hotlist',
                                            }}
                                        />
                                        <Drawer.Screen
                                            name="contribute"
                                            options={{
                                                drawerItemStyle: {
                                                    display: 'none',
                                                },
                                                popToTopOnBlur: true,
                                                swipeEnabled: false,
                                                title: 'Contribute',
                                            }}
                                        />
                                        <Drawer.Screen
                                            name="edits"
                                            options={{
                                                drawerItemStyle: {
                                                    display: 'none',
                                                },
                                                popToTopOnBlur: true,
                                                swipeEnabled: false,
                                                title: 'Your edits',
                                            }}
                                        />
                                    </Drawer>
                                    <DebugDrawer
                                        onClose={handleCloseDebugDrawer}
                                        visible={debugDrawerIsVisible}
                                    />
                                </View>
                            </ContributeProvider>
                        </SharedMapStateProvider>
                    </AuthProvider>
                </BottomSheetModalProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}

export default withSentryRoot(RootLayout);
