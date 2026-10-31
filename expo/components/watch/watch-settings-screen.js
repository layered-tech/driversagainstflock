import { requireOptionalNativeModule } from 'expo';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    Platform,
    Pressable,
    ScrollView,
    Switch,
    Text,
    ToastAndroid,
    useColorScheme,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { dafThemes } from '../design-system/tokens';
import { useConnectedWatch } from './use-connected-watch';
import {
    loadWatchHapticPreferences,
    setWatchHapticsEnabled,
    subscribeWatchHaptics,
    watchHapticsEnabled,
} from './watch-haptic-preferences';
import {
    getWatchCameraPreferences,
    loadWatchCameraPreferences,
    setWatchCameraPreferences,
    subscribeWatchCameraPreferences,
} from './watch-camera-preferences';

export function WatchSettingsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const isFocused = useIsFocused();
    const watchConnected = useConnectedWatch(isFocused);
    const theme =
        useColorScheme() === 'dark' ? dafThemes.dark : dafThemes.light;
    const [enabled, setEnabled] = useState(watchHapticsEnabled);
    const [cameraPreferences, setCameraPreferences] = useState(
        getWatchCameraPreferences,
    );
    const [openingPreview, setOpeningPreview] = useState(false);

    useEffect(() => {
        const unsubscribe = subscribeWatchHaptics(setEnabled);
        loadWatchHapticPreferences().catch(() => {});
        return unsubscribe;
    }, []);
    useEffect(() => {
        const unsubscribe =
            subscribeWatchCameraPreferences(setCameraPreferences);
        loadWatchCameraPreferences().catch(() => {});
        return unsubscribe;
    }, []);

    const openPreview = async () => {
        const transport =
            Platform.OS === 'android'
                ? requireOptionalNativeModule('WatchCompanion')
                : null;
        if (!watchConnected || !transport?.openHapticsOnWatch) return;
        setOpeningPreview(true);
        try {
            await transport.openHapticsOnWatch();
            ToastAndroid.show('Check your wrist.', ToastAndroid.SHORT);
        } catch {
            Alert.alert(
                'Watch not connected',
                'Connect your watch and try again.',
            );
        } finally {
            setOpeningPreview(false);
        }
    };

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="watch-settings-screen"
        >
            <View
                className="flex-row items-center gap-3 px-5 pb-4"
                style={{ paddingTop: Math.max(insets.top + 10, 16) }}
            >
                <Pressable
                    accessibilityLabel="Back"
                    accessibilityRole="button"
                    className="h-9 w-9 items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                    onPress={() =>
                        router.canGoBack() ? router.back() : router.replace('/')
                    }
                >
                    <Icon
                        color={theme.text.secondary}
                        name="chevron-left"
                        size={24}
                    />
                </Pressable>
                <Text className="font-dafDisplay text-[22px] font-bold text-daf-text-primary dark:text-white">
                    Watch
                </Text>
            </View>
            <ScrollView
                contentInsetAdjustmentBehavior="automatic"
                contentContainerClassName="gap-5 px-5 pb-8"
            >
                <View className="gap-2">
                    <Text className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                        Maneuver haptics
                    </Text>
                    <View className="rounded-dafMd border border-daf-border bg-white px-4 shadow-[0px_4px_18px_rgba(11,14,18,0.1)] dark:border-daf-border-dark dark:bg-daf-surface-dark">
                        <View className="min-h-12 flex-row items-center gap-2">
                            <Switch
                                accessibilityLabel="Buzz for upcoming turns"
                                value={enabled}
                                onValueChange={(value) =>
                                    setWatchHapticsEnabled(value).catch(() =>
                                        Alert.alert(
                                            'Could not save',
                                            'Try changing this setting again.',
                                        ),
                                    )
                                }
                                trackColor={{
                                    false: '#A9B2BD',
                                    true: '#1FBF6B',
                                }}
                                testID="watch-haptics-toggle"
                            />
                            <Text className="min-w-0 flex-1 text-[15px] font-medium text-daf-text-primary dark:text-white">
                                Buzz for upcoming turns
                            </Text>
                        </View>
                        <Text className="pb-3 text-[12.5px] leading-[18px] text-daf-text-tertiary dark:text-neutral-400">
                            One tap left, two taps right, a long pulse for
                            roundabouts and U-turns. Plays about 10 seconds
                            before the turn.
                        </Text>
                        <View className="h-px bg-daf-border dark:bg-daf-border-dark" />
                        <Pressable
                            accessibilityLabel="Preview patterns on watch"
                            accessibilityRole="button"
                            accessibilityState={{
                                disabled: !watchConnected || openingPreview,
                            }}
                            className="min-h-[52px] flex-row items-center gap-3 active:opacity-70"
                            disabled={!watchConnected || openingPreview}
                            onPress={openPreview}
                            testID="watch-preview-patterns"
                        >
                            <Text className="min-w-0 flex-1 text-[15px] font-semibold text-daf-text-primary dark:text-white">
                                Preview patterns
                            </Text>
                            <Text className="text-[12.5px] text-daf-text-tertiary dark:text-neutral-400">
                                {watchConnected
                                    ? 'On watch'
                                    : 'Watch not connected'}
                            </Text>
                            <Icon
                                color={theme.text.tertiary}
                                name="chevron-right"
                                size={18}
                            />
                        </Pressable>
                    </View>
                </View>
                <View className="gap-2">
                    <Text className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                        Camera alerts
                    </Text>
                    <View className="rounded-dafMd border border-daf-border bg-white px-4 shadow-[0px_4px_18px_rgba(11,14,18,0.1)] dark:border-daf-border-dark dark:bg-daf-surface-dark">
                        <View className="min-h-12 flex-row items-center gap-2">
                            <Switch
                                accessibilityLabel="Alert on wrist"
                                value={cameraPreferences.alertsEnabled}
                                onValueChange={(alertsEnabled) =>
                                    setWatchCameraPreferences({
                                        alertsEnabled,
                                    }).catch(() =>
                                        Alert.alert(
                                            'Could not save',
                                            'Try changing this setting again.',
                                        ),
                                    )
                                }
                                trackColor={{
                                    false: '#A9B2BD',
                                    true: '#1FBF6B',
                                }}
                                testID="watch-camera-alerts-toggle"
                            />
                            <Text className="min-w-0 flex-1 text-[15px] font-medium text-daf-text-primary dark:text-white">
                                Alert on wrist
                            </Text>
                        </View>
                        <Text className="pb-3 text-[12.5px] leading-[18px] text-daf-text-tertiary dark:text-neutral-400">
                            Three quick ticks plus the camera type, road, and
                            distance — about 0.5 mi ahead.
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}
