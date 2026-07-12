import {
    faCamera,
    faCodeBranch,
    faCrosshairs,
    faLocationDot,
    faMobileScreen,
    faNetworkWired,
    faRoute,
    faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Pressable,
    ScrollView,
    Text,
    useColorScheme,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { SHOW_MAP_DEBUG_CONTROLS } from '../map/config';
import {
    DEBUG_OVERLAY_ANDROID_AUTO_LOCATION,
    DEBUG_OVERLAY_CAMERA,
    DEBUG_OVERLAY_CAMERA_FOCUS,
    DEBUG_OVERLAY_DIRECTIONS_GEOMETRY,
    DEBUG_OVERLAY_ELECTRONIC_HORIZON,
    DEBUG_OVERLAY_NETWORK,
    DEBUG_OVERLAY_SAFE_AREA,
} from '../map/debug-overlays';
import { useSharedMapState } from '../map/shared-map-state';
import { DebugDrawerToggleRow } from './debug-drawer-toggle-row';

const DEBUG_DRAWER_ANIMATION_MS = 180;
const DEBUG_DRAWER_MAX_WIDTH = 420;
const DEBUG_DRAWER_MIN_WIDTH = 300;

const DEBUG_DRAWER_ITEMS = [
    {
        icon: faMobileScreen,
        key: DEBUG_OVERLAY_SAFE_AREA,
        label: 'Safe Area',
        testID: 'debug-drawer-safe-area-toggle',
    },
    {
        icon: faCrosshairs,
        key: DEBUG_OVERLAY_CAMERA_FOCUS,
        label: 'Camera Focus',
        testID: 'debug-drawer-camera-focus-toggle',
    },
    {
        icon: faCamera,
        key: DEBUG_OVERLAY_CAMERA,
        label: 'Camera Values',
        testID: 'debug-drawer-camera-toggle',
    },
    {
        icon: faNetworkWired,
        key: DEBUG_OVERLAY_NETWORK,
        label: 'Network Requests',
        testID: 'debug-drawer-network-toggle',
    },
    {
        icon: faRoute,
        key: DEBUG_OVERLAY_DIRECTIONS_GEOMETRY,
        label: 'Directions Geometry',
        testID: 'debug-drawer-directions-geometry-toggle',
    },
    {
        icon: faCodeBranch,
        key: DEBUG_OVERLAY_ELECTRONIC_HORIZON,
        label: 'Electronic Horizon',
        testID: 'debug-drawer-electronic-horizon-toggle',
    },
    {
        icon: faLocationDot,
        key: DEBUG_OVERLAY_ANDROID_AUTO_LOCATION,
        label: 'Android Auto Location',
        testID: 'debug-drawer-android-auto-location-toggle',
    },
];

export function DebugDrawer({ onClose, visible }) {
    const {
        debugOverlayVisibility,
        mapPreferencesAreLoaded,
        setDebugOverlayVisibility,
    } = useSharedMapState();
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useWindowDimensions();
    const isDarkMode = colorScheme === 'dark';
    const [shouldRender, setShouldRender] = useState(visible);
    const animationProgressRef = useRef(new Animated.Value(visible ? 1 : 0));
    const drawerWidth = useMemo(
        () =>
            Math.min(
                windowWidth,
                Math.max(
                    DEBUG_DRAWER_MIN_WIDTH,
                    Math.min(DEBUG_DRAWER_MAX_WIDTH, windowWidth * 0.86),
                ),
            ),
        [windowWidth],
    );
    const iconColor = isDarkMode ? '#d4d4d4' : '#525252';
    const panelTranslateX = animationProgressRef.current.interpolate({
        inputRange: [0, 1],
        outputRange: [drawerWidth, 0],
    });
    const scrimOpacity = animationProgressRef.current.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.36],
    });

    useEffect(() => {
        if (visible) {
            setShouldRender(true);
        }

        Animated.timing(animationProgressRef.current, {
            duration: DEBUG_DRAWER_ANIMATION_MS,
            easing: Easing.out(Easing.cubic),
            toValue: visible ? 1 : 0,
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (finished && !visible) {
                setShouldRender(false);
            }
        });
    }, [visible]);

    if (!shouldRender || !SHOW_MAP_DEBUG_CONTROLS) {
        return null;
    }

    return (
        <View
            className="absolute inset-0 z-[100]"
            pointerEvents={visible ? 'auto' : 'none'}
            testID="debug-drawer"
        >
            <Pressable
                accessibilityLabel="Close debug drawer"
                accessibilityRole="button"
                className="absolute inset-0"
                onPress={onClose}
            >
                <Animated.View
                    className="flex-1 bg-black"
                    style={{ opacity: scrimOpacity }}
                />
            </Pressable>
            <Animated.View
                className="absolute bottom-0 right-0 top-0 border-l border-neutral-200 bg-neutral-50 shadow-[0px_0px_24px_rgba(0,0,0,0.24)] dark:border-neutral-800 dark:bg-neutral-950"
                style={{
                    paddingBottom: Math.max(insets.bottom, 16),
                    paddingTop: Math.max(insets.top, 16),
                    transform: [{ translateX: panelTranslateX }],
                    width: drawerWidth,
                }}
            >
                <View className="flex-row items-center justify-between gap-3 border-b border-neutral-200 px-4 pb-3 dark:border-neutral-800">
                    <Text className="text-lg font-bold text-neutral-950 dark:text-white">
                        Debug
                    </Text>
                    <Pressable
                        accessibilityLabel="Close debug drawer"
                        accessibilityRole="button"
                        className="h-9 w-9 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-900"
                        onPress={onClose}
                        testID="debug-drawer-close-button"
                    >
                        <FontAwesomeIcon
                            color={iconColor}
                            icon={faXmark}
                            size={16}
                        />
                    </Pressable>
                </View>
                <ScrollView
                    contentContainerStyle={{
                        gap: 10,
                        padding: 16,
                    }}
                >
                    {DEBUG_DRAWER_ITEMS.map((item) => (
                        <DebugDrawerToggleRow
                            iconColor={iconColor}
                            isDarkMode={isDarkMode}
                            isEnabled={
                                debugOverlayVisibility?.[item.key] === true
                            }
                            item={item}
                            key={item.key}
                            onValueChange={(isEnabled) => {
                                if (mapPreferencesAreLoaded) {
                                    setDebugOverlayVisibility(
                                        item.key,
                                        isEnabled,
                                    );
                                }
                            }}
                        />
                    ))}
                </ScrollView>
            </Animated.View>
        </View>
    );
}
