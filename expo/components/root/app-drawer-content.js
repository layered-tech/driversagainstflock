import Constants from 'expo-constants';
import {
    DrawerContentScrollView,
    DrawerItem,
    useDrawerStatus,
} from 'expo-router/drawer';
import { Alert, Text, useColorScheme, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { APP_ENVIRONMENT } from '../../lib/auth/constants';
import {
    emitSentryTestError,
    triggerSentryNativeCrash,
} from '../../lib/sentry';
import { Icon } from '../design-system/icon';
import { SHOW_MAP_DEBUG_CONTROLS } from '../map/config';
import { useSharedMapState } from '../map/shared-map-state';
import {
    getDrawerActiveRouteName,
    HELP_AND_LEGAL_DRAWER_ITEMS,
    PRIMARY_DRAWER_ITEMS,
} from './app-drawer-items';

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

function DrawerNavigationItem({
    activeRouteName,
    icon,
    isDarkMode,
    label,
    onPress,
    routeName,
    testID,
}) {
    const isFocused = activeRouteName === routeName;

    return (
        <DrawerItem
            accessibilityLabel={label}
            activeBackgroundColor={
                isDarkMode ? 'rgba(31, 191, 107, 0.18)' : '#E6F9EF'
            }
            activeTintColor={isDarkMode ? '#56CF8E' : '#0F7D45'}
            focused={isFocused}
            icon={({ color, size }) => (
                <Icon color={color} name={icon} size={size} />
            )}
            inactiveBackgroundColor="transparent"
            inactiveTintColor={isDarkMode ? '#F5F7F9' : '#11151B'}
            label={label}
            labelStyle={{
                fontSize: 15,
                fontWeight: isFocused ? '700' : '600',
            }}
            onPress={onPress}
            style={{
                borderRadius: 10,
                marginHorizontal: 0,
                marginVertical: 0,
            }}
            testID={testID}
        />
    );
}

export function AppDrawerContent({ onOpenDebugDrawer, ...props }) {
    const { debugOverlayIsVisible, mapPreferencesAreLoaded } =
        useSharedMapState();
    const {
        isAuthenticated,
        isLoading,
        isSigningIn,
        signInWithOpenStreetMap,
        signOut,
        user,
    } = useAuth();
    const colorScheme = useColorScheme();
    const drawerIsOpen = useDrawerStatus() === 'open';
    const isDarkMode = colorScheme === 'dark';
    const drawerTintColor = isDarkMode ? '#F5F7F9' : '#11151B';
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
    const activeRouteName = getDrawerActiveRouteName(props.state);
    const drawerAuthLabel =
        isLoading || isSigningIn
            ? 'Loading...'
            : isAuthenticated
              ? 'Logout'
              : 'Login with OpenStreetMap';

    const handleAuthPress = async () => {
        if (isLoading || isSigningIn) {
            return;
        }

        try {
            if (isAuthenticated) {
                await signOut();
            } else {
                await signInWithOpenStreetMap();
            }
        } catch (error) {
            Alert.alert(
                isAuthenticated ? 'Logout failed' : 'Login failed',
                error.message || 'Please try again.',
            );
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
    const handleYourEditsPress = () => {
        props.navigation.navigate('edits', { screen: 'index' });
        props.navigation.closeDrawer();
    };
    const handleDrawerRoutePress = (routeName) => {
        props.navigation.navigate(routeName);
        props.navigation.closeDrawer();
    };

    return (
        <View
            className="dark:bg-daf-surface-dark flex-1 bg-white"
            testID={drawerIsOpen ? 'app-drawer-open' : undefined}
        >
            <DrawerContentScrollView
                {...props}
                contentContainerStyle={{ paddingBottom: 8 }}
            >
                <View className="px-0 pt-2.5">
                    {PRIMARY_DRAWER_ITEMS.map((item) => (
                        <DrawerNavigationItem
                            activeRouteName={activeRouteName}
                            isDarkMode={isDarkMode}
                            key={item.routeName}
                            onPress={() =>
                                handleDrawerRoutePress(item.routeName)
                            }
                            {...item}
                        />
                    ))}
                </View>

                <View className="dark:bg-daf-border-dark mx-5 my-2.5 h-px bg-daf-border" />
                <Text className="px-5 pb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                    Help &amp; legal
                </Text>
                <View>
                    {HELP_AND_LEGAL_DRAWER_ITEMS.map((item) => (
                        <DrawerNavigationItem
                            activeRouteName={activeRouteName}
                            isDarkMode={isDarkMode}
                            key={item.routeName}
                            onPress={() =>
                                handleDrawerRoutePress(item.routeName)
                            }
                            testID={`drawer-${item.routeName}-button`}
                            {...item}
                        />
                    ))}
                </View>

                {isAuthenticated ? (
                    <View className="mt-3">
                        <View className="dark:bg-daf-border-dark mx-5 mb-2.5 h-px bg-daf-border" />
                        <Text className="px-5 pb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                            Your account
                        </Text>
                        {userDisplayName ? (
                            <Text
                                className="px-5 pb-2 text-sm font-semibold text-daf-text-primary dark:text-white"
                                testID="drawer-auth-footer-user-name"
                            >
                                {userDisplayName}
                            </Text>
                        ) : null}
                        <DrawerNavigationItem
                            activeRouteName={activeRouteName}
                            icon="pencil"
                            isDarkMode={isDarkMode}
                            label="Your Edits"
                            onPress={handleYourEditsPress}
                            routeName="edits"
                            testID="drawer-your-edits-button"
                        />
                        <DrawerNavigationItem
                            activeRouteName={activeRouteName}
                            icon="log-out"
                            isDarkMode={isDarkMode}
                            label="Logout"
                            onPress={handleAuthPress}
                            routeName="logout"
                            testID="drawer-auth-logout-button"
                        />
                    </View>
                ) : null}

                {showDebugDrawerAction || showSentryDebugActions ? (
                    <View className="mt-3">
                        <View className="dark:bg-daf-border-dark mx-5 mb-2.5 h-px bg-daf-border" />
                        <Text className="px-5 pb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                            Developer
                        </Text>
                        {showDebugDrawerAction ? (
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
                                labelStyle={{ fontSize: 15, fontWeight: '600' }}
                                onPress={handleDebugPress}
                                style={{
                                    borderRadius: 10,
                                    marginHorizontal: 0,
                                    marginVertical: 0,
                                }}
                                testID="drawer-debug-button"
                            />
                        ) : null}

                        {showSentryDebugActions ? (
                            <>
                                <DrawerItem
                                    accessibilityLabel="Emit Sentry test error"
                                    icon={({ color, size }) => (
                                        <Icon
                                            color={color}
                                            name="bug"
                                            size={size}
                                        />
                                    )}
                                    inactiveTintColor={drawerTintColor}
                                    label="Emit Sentry Error"
                                    labelStyle={{
                                        fontSize: 15,
                                        fontWeight: '600',
                                    }}
                                    onPress={handleEmitSentryError}
                                    style={{
                                        borderRadius: 10,
                                        marginHorizontal: 0,
                                        marginVertical: 0,
                                    }}
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
                                    labelStyle={{
                                        fontSize: 15,
                                        fontWeight: '600',
                                    }}
                                    onPress={handleNativeCrashPress}
                                    style={{
                                        borderRadius: 10,
                                        marginHorizontal: 0,
                                        marginVertical: 0,
                                    }}
                                    testID="drawer-debug-native-crash-button"
                                />
                            </>
                        ) : null}
                    </View>
                ) : null}

                {!isAuthenticated ? (
                    <View className="mt-3">
                        <View className="dark:bg-daf-border-dark mx-5 mb-2.5 h-px bg-daf-border" />
                        <DrawerItem
                            accessibilityLabel="Login with OpenStreetMap"
                            activeBackgroundColor={authButtonBackgroundColor}
                            activeTintColor={drawerTintColor}
                            icon={({ color, size }) => (
                                <Icon color={color} name="user" size={size} />
                            )}
                            inactiveBackgroundColor={authButtonBackgroundColor}
                            inactiveTintColor={drawerTintColor}
                            label={drawerAuthLabel}
                            labelStyle={{ fontSize: 15, fontWeight: '600' }}
                            onPress={handleAuthPress}
                            style={{
                                borderRadius: 10,
                                marginHorizontal: 0,
                                marginVertical: 0,
                            }}
                            testID="drawer-auth-login-button"
                        />
                    </View>
                ) : null}
            </DrawerContentScrollView>

            <View
                className="items-center px-[22px] pt-3"
                style={{
                    paddingBottom: 16,
                }}
            >
                {showEnvironmentLabel ? (
                    <View
                        className="mb-2 rounded-dafPill px-2.5 py-1"
                        style={{ backgroundColor: environmentBadge.background }}
                        testID="drawer-auth-footer-environment"
                    >
                        <Text
                            className="text-[11px] font-bold uppercase"
                            style={{ color: environmentBadge.text }}
                        >
                            {APP_ENVIRONMENT.toUpperCase()}
                        </Text>
                    </View>
                ) : null}
                <Text
                    className="font-dafMono text-center text-[11px] text-daf-text-tertiary dark:text-neutral-400"
                    testID="drawer-auth-footer-app-version"
                >
                    {appVersion}
                </Text>
            </View>
        </View>
    );
}
