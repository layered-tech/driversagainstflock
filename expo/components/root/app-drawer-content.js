import {
    DrawerContentScrollView,
    DrawerItem,
    DrawerItemList,
} from '@react-navigation/drawer';
import Constants from 'expo-constants';
import { Alert, Text, useColorScheme, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { APP_ENVIRONMENT } from '../../lib/auth/constants';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import {
    emitSentryTestError,
    triggerSentryNativeCrash,
} from '../../lib/sentry';
import { Icon } from '../design-system/icon';
import { SHOW_MAP_DEBUG_CONTROLS } from '../map/config';
import { useSharedMapState } from '../map/shared-map-state';

const ENVIRONMENT_BADGE_COLORS = {
    development: {
        background: '#D6E7FF',
        text: '#1F6FE0',
    },
    e2e: {
        background: '#ede9fe',
        text: '#6d28d9',
    },
    staging: {
        background: '#ffedd5',
        text: '#c2410c',
    },
};

const appVersion =
    Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? 'unknown';

export function AppDrawerContent({ onOpenDebugDrawer, ...props }) {
    const { debugOverlayIsVisible, mapPreferencesAreLoaded } =
        useSharedMapState();
    const { isAuthenticated, isLoading, isSigningIn, signOut, user } =
        useAuth();
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const isDarkMode = colorScheme === 'dark';
    const drawerTintColor = isDarkMode ? '#A9B2BD' : '#4A5562';
    const authButtonBackgroundColor = isDarkMode
        ? 'rgba(31, 191, 107, 0.14)'
        : 'rgba(23, 23, 23, 0.12)';
    const showEnvironmentLabel = APP_ENVIRONMENT in ENVIRONMENT_BADGE_COLORS;
    const environmentBadge = ENVIRONMENT_BADGE_COLORS[APP_ENVIRONMENT];
    const showDebugDrawerAction =
        SHOW_MAP_DEBUG_CONTROLS && mapPreferencesAreLoaded;
    const showSentryDebugActions =
        SHOW_MAP_DEBUG_CONTROLS &&
        mapPreferencesAreLoaded &&
        debugOverlayIsVisible;
    const userDisplayName = user?.name ?? user?.email;

    const handleAuthPress = async () => {
        if (isLoading || isSigningIn) {
            return;
        }

        try {
            if (isAuthenticated) {
                await signOut();
            }

            props.navigation.closeDrawer();
        } catch (error) {
            Alert.alert('Login failed', error.message || 'Please try again.');
        }
    };
    const handleEmitSentryError = () => {
        const wasSent = emitSentryTestError();

        Alert.alert(
            wasSent ? 'Sentry error emitted' : 'Sentry is not configured',
            wasSent
                ? 'Check the Sentry Issues view for Manual Sentry test error.'
                : 'Set EXPO_PUBLIC_SENTRY_DSN before testing error reporting.',
        );
    };
    const handleNativeCrashPress = () => {
        Alert.alert(
            'Trigger native crash?',
            'The app will close immediately. Reopen it afterward so Sentry can send the crash report.',
            [
                {
                    style: 'cancel',
                    text: 'Cancel',
                },
                {
                    onPress: () => {
                        const willCrash = triggerSentryNativeCrash();

                        if (!willCrash) {
                            Alert.alert(
                                'Sentry is not configured',
                                'Set EXPO_PUBLIC_SENTRY_DSN before testing native crash reporting.',
                            );
                        }
                    },
                    style: 'destructive',
                    text: 'Crash App',
                },
            ],
        );
    };
    const handleDebugPress = () => {
        props.navigation.closeDrawer();
        requestAnimationFrame(() => {
            onOpenDebugDrawer?.();
        });
    };

    return (
        <View className="dark:bg-daf-surface-dark flex-1 bg-white">
            <DrawerContentScrollView {...props}>
                <DrawerItemList {...props} />
            </DrawerContentScrollView>

            <View
                className="px-4 pt-4"
                style={{
                    paddingBottom: Math.max(insets.bottom, 16),
                }}
            >
                <View className="items-center justify-center gap-2 pb-4">
                    {isAuthenticated && userDisplayName ? (
                        <Text
                            className="text-base font-semibold text-daf-text-primary dark:text-white"
                            testID="drawer-auth-footer-user-name"
                        >
                            {userDisplayName}
                        </Text>
                    ) : null}

                    {showEnvironmentLabel ? (
                        <View
                            className="rounded-full px-3 py-1"
                            style={{
                                backgroundColor: environmentBadge.background,
                            }}
                            testID="drawer-auth-footer-environment"
                        >
                            <Text
                                className="text-xs font-bold uppercase"
                                style={{ color: environmentBadge.text }}
                            >
                                {APP_ENVIRONMENT.toUpperCase()}
                            </Text>
                        </View>
                    ) : null}

                    <Text
                        className="text-xs font-bold text-daf-text-secondary dark:text-neutral-300"
                        testID="drawer-auth-footer-app-version"
                    >
                        App Version: {appVersion}
                    </Text>
                </View>

                {showDebugDrawerAction ? (
                    <View className="mb-3">
                        <DrawerItem
                            accessibilityLabel="Open debug settings"
                            icon={({ color, size }) => (
                                <Icon
                                    color={color}
                                    name="sliders-horizontal"
                                    size={size}
                                />
                            )}
                            inactiveTintColor={drawerTintColor}
                            label="Debug"
                            onPress={handleDebugPress}
                            style={{ borderRadius: 8, marginHorizontal: 0 }}
                            testID="drawer-debug-button"
                        />
                    </View>
                ) : null}

                {showSentryDebugActions ? (
                    <View className="mb-3">
                        <DrawerItem
                            accessibilityLabel="Emit Sentry test error"
                            icon={({ color, size }) => (
                                <Icon color={color} name="bug" size={size} />
                            )}
                            inactiveTintColor={drawerTintColor}
                            label="Emit Sentry Error"
                            onPress={handleEmitSentryError}
                            style={{ borderRadius: 8, marginHorizontal: 0 }}
                            testID="drawer-debug-sentry-error-button"
                        />
                        <DrawerItem
                            accessibilityLabel="Trigger Sentry native crash"
                            icon={({ color, size }) => (
                                <Icon
                                    color={color}
                                    name="triangle-alert"
                                    size={size}
                                />
                            )}
                            inactiveBackgroundColor="rgba(239, 68, 68, 0.12)"
                            inactiveTintColor={
                                isDarkMode ? '#fca5a5' : '#b91c1c'
                            }
                            label="Trigger Native Crash"
                            onPress={handleNativeCrashPress}
                            style={{ borderRadius: 8, marginHorizontal: 0 }}
                            testID="drawer-debug-native-crash-button"
                        />
                    </View>
                ) : null}

                {isAuthenticated ? (
                    <DrawerItem
                        accessibilityLabel="Logout"
                        icon={({ color, size }) => (
                            <Icon color={color} name="log-out" size={size} />
                        )}
                        activeBackgroundColor={authButtonBackgroundColor}
                        inactiveBackgroundColor={authButtonBackgroundColor}
                        inactiveTintColor={drawerTintColor}
                        label={
                            isLoading || isSigningIn ? 'Loading...' : 'Logout'
                        }
                        onPress={handleAuthPress}
                        style={{ borderRadius: 8, marginHorizontal: 0 }}
                        testID="drawer-auth-logout-button"
                    />
                ) : null}
            </View>
        </View>
    );
}
