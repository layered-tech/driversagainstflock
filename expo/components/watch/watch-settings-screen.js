import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import {
    Alert,
    Platform,
    Pressable,
    ScrollView,
    Switch,
    Text,
    View,
} from 'react-native';
import { InformationHeader } from '../information/information-screen';
import {
    loadWatchHapticPreferences,
    setWatchHapticsEnabled,
    subscribeWatchHaptics,
    watchHapticsEnabled,
} from './watch-haptic-preferences';

const patterns = [
    { label: 'Left', description: 'One short tap', pattern: 'left' },
    { label: 'Right', description: 'Two short taps', pattern: 'right' },
    {
        label: 'Roundabout / U-turn',
        description: 'One longer pulse',
        pattern: 'neutral',
    },
];

export function WatchSettingsScreen() {
    const [enabled, setEnabled] = useState(watchHapticsEnabled);
    const [previewing, setPreviewing] = useState(null);
    useEffect(() => {
        const unsubscribe = subscribeWatchHaptics(setEnabled);
        loadWatchHapticPreferences().catch(() => {});
        return unsubscribe;
    }, []);

    const preview = async (pattern) => {
        const transport =
            Platform.OS === 'android'
                ? requireOptionalNativeModule('WatchCompanion')
                : null;
        if (!transport) {
            Alert.alert(
                'Watch unavailable',
                'Connect a Wear OS watch to preview the pattern.',
            );
            return;
        }
        setPreviewing(pattern);
        try {
            const now = Date.now();
            await transport.sendHapticCue(
                JSON.stringify({
                    version: 1,
                    id: `preview:${now}:${pattern}`,
                    pattern,
                    preview: true,
                    issuedAt: now,
                    expiresAt: now + 5_000,
                }),
            );
        } catch {
            Alert.alert(
                'Preview unavailable',
                'Check that your watch is connected, then try again.',
            );
        } finally {
            setPreviewing(null);
        }
    };

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="watch-settings-screen"
        >
            <InformationHeader title="Watch" />
            <ScrollView
                contentInsetAdjustmentBehavior="automatic"
                contentContainerClassName="gap-5 px-4 pb-8 pt-5"
            >
                <View className="gap-1 px-1">
                    <Text className="font-dafDisplay text-xl font-bold text-daf-text-primary dark:text-white">
                        Maneuver haptics
                    </Text>
                    <Text className="text-sm leading-5 text-daf-text-secondary dark:text-neutral-300">
                        The watch gives one advance cue for each turn while you
                        follow a route.
                    </Text>
                </View>
                <View className="overflow-hidden rounded-dafMd border border-daf-border bg-white dark:border-daf-border-dark dark:bg-daf-surface-dark">
                    <View className="min-h-[64px] flex-row items-center gap-4 px-4 py-3">
                        <View className="min-w-0 flex-1 gap-0.5">
                            <Text className="text-[15px] font-semibold text-daf-text-primary dark:text-white">
                                Turn vibrations
                            </Text>
                            <Text className="text-xs text-daf-text-tertiary dark:text-neutral-400">
                                System interruption settings still apply.
                            </Text>
                        </View>
                        <Switch
                            accessibilityLabel="Turn vibrations"
                            value={enabled}
                            onValueChange={(value) => {
                                setWatchHapticsEnabled(value).catch(() =>
                                    Alert.alert(
                                        'Could not save',
                                        'Try changing this setting again.',
                                    ),
                                );
                            }}
                            testID="watch-haptics-toggle"
                        />
                    </View>
                </View>
                <View className="gap-2">
                    <Text className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                        Preview on watch
                    </Text>
                    <View className="overflow-hidden rounded-dafMd border border-daf-border bg-white dark:border-daf-border-dark dark:bg-daf-surface-dark">
                        {patterns.map(({ label, description, pattern }) => (
                            <Pressable
                                key={pattern}
                                accessibilityRole="button"
                                accessibilityLabel={`Preview ${label} haptic`}
                                disabled={previewing !== null}
                                onPress={() => preview(pattern)}
                                className="min-h-[60px] flex-row items-center gap-3 border-b border-daf-border px-4 py-3 active:bg-daf-surface-alt dark:border-daf-border-dark dark:active:bg-daf-surface-inverse"
                                testID={`watch-preview-${pattern}`}
                            >
                                <View className="min-w-0 flex-1 gap-0.5">
                                    <Text className="text-[15px] font-semibold text-daf-text-primary dark:text-white">
                                        {label}
                                    </Text>
                                    <Text className="text-xs text-daf-text-tertiary dark:text-neutral-400">
                                        {description}
                                    </Text>
                                </View>
                                <Text className="text-sm font-semibold text-daf-brand">
                                    {previewing === pattern
                                        ? 'Sending…'
                                        : 'Preview'}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}
