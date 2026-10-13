import { vars } from 'nativewind';
import {
    Pressable,
    ScrollView,
    Text,
    useColorScheme,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../design-system/icon';
import { getFirstLaunchSupportLayout } from './first-launch-support-layout';

const supportCosts = [
    'OpenStreetMap data sync',
    'Private GraphHopper routing',
    'Google Places search',
];

export function FirstLaunchSupportScreen({ busy, error, onDonate, onDismiss }) {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const layout = getFirstLaunchSupportLayout(width, insets);
    const isDark = useColorScheme() === 'dark';
    const brandColor = isDark ? '#1FBF6B' : '#0F7D45';

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            style={vars(layout.variables)}
            testID="first-launch-support-screen"
        >
            <ScrollView
                contentContainerClassName="grow"
                contentContainerStyle={{
                    paddingTop: layout.paddingTop,
                    paddingBottom: layout.paddingBottom,
                }}
            >
                <View className="mx-auto w-full max-w-[560px] grow px-[var(--support-22)]">
                    <View className="mb-[var(--support-22)] flex-row items-center justify-between">
                        <View className="h-[var(--support-58)] w-[var(--support-58)] items-center justify-center rounded-[var(--support-18)] bg-daf-brand/10 dark:bg-daf-brand/15">
                            <Icon
                                color={brandColor}
                                name="server"
                                size={28 * layout.scale}
                            />
                        </View>
                        <Text className="font-dafMono text-[length:var(--support-11)] uppercase tracking-[0.08em] text-daf-text-tertiary dark:text-neutral-400">
                            One-time ask
                        </Text>
                    </View>
                    <Text
                        accessibilityRole="header"
                        className="mb-[var(--support-12)] font-dafDisplay text-[length:var(--support-32)] font-bold leading-[var(--support-36-8)] tracking-[var(--support-heading-tracking)] text-daf-text-primary dark:text-white"
                    >
                        Your routes stay ours{'\n'}to run
                    </Text>
                    <Text className="mb-[var(--support-18)] text-[length:var(--support-17)] leading-[var(--support-25-5)] text-daf-text-secondary dark:text-neutral-300">
                        We keep our own synced copy of OpenStreetMap and run a
                        private GraphHopper routing server. Your routes stay on
                        our servers — but servers aren&apos;t free.
                    </Text>
                    <View className="mb-[var(--support-18)] flex-row items-center gap-[var(--support-14)] rounded-[var(--support-18)] border border-daf-border bg-daf-surface-card px-[var(--support-16)] py-[var(--support-14)] dark:border-daf-border-dark dark:bg-daf-surface-dark">
                        <View>
                            <Text className="font-dafMono text-[length:var(--support-28)] font-bold leading-[var(--support-28)] tracking-[var(--support-cost-tracking)] text-daf-text-primary dark:text-white">
                                ~$200
                            </Text>
                            <Text className="mt-[var(--support-4)] text-[length:var(--support-12)] text-daf-text-tertiary dark:text-neutral-400">
                                USD / month
                            </Text>
                        </View>
                        <View className="min-w-0 flex-1 gap-[var(--support-6)] border-l border-daf-border pl-[var(--support-14)] dark:border-daf-border-dark">
                            {supportCosts.map((cost) => (
                                <View
                                    className="flex-row items-center gap-[var(--support-8)]"
                                    key={cost}
                                >
                                    <Icon
                                        color={brandColor}
                                        name="check"
                                        size={14 * layout.scale}
                                        stroke={2.5}
                                    />
                                    <Text className="flex-1 text-[length:var(--support-13)] leading-[var(--support-17-55)] text-daf-text-secondary dark:text-neutral-300">
                                        {cost}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>
                    <Text className="mb-[var(--support-18)] text-[length:var(--support-15)] font-semibold leading-[var(--support-22-5)] text-daf-text-primary dark:text-white">
                        A few dollars from a few drivers covers it.
                    </Text>
                    <View className="flex-1" />
                    {error ? (
                        <Text
                            accessibilityLiveRegion="polite"
                            className="mb-[var(--support-12)] text-[length:var(--support-13)] text-daf-danger"
                        >
                            {error}
                        </Text>
                    ) : null}
                    <Pressable
                        accessibilityLabel="Buy Drivers Against Flock a coffee"
                        accessibilityRole="link"
                        accessibilityState={{ disabled: busy, busy }}
                        className="min-h-[var(--support-52)] flex-row items-center justify-center gap-[var(--support-9)] rounded-dafPill bg-[#FFDD00] px-[var(--support-20)] py-[var(--support-15)] active:opacity-80 disabled:opacity-60"
                        disabled={busy}
                        onPress={onDonate}
                        testID="first-launch-support-donate"
                    >
                        <Icon
                            color="#0D0C0C"
                            name="coffee"
                            size={19 * layout.scale}
                            stroke={2.2}
                        />
                        <Text className="text-[length:var(--support-15)] font-bold text-[#0D0C0C]">
                            Buy us a coffee
                        </Text>
                    </Pressable>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ disabled: busy, busy }}
                        className="mt-[var(--support-8)] min-h-[var(--support-46)] items-center justify-center rounded-dafPill px-[var(--support-20)] py-[var(--support-12)] active:bg-daf-surface-alt dark:active:bg-daf-surface-dark"
                        disabled={busy}
                        onPress={onDismiss}
                        testID="first-launch-support-maybe-later"
                    >
                        <Text className="text-[length:var(--support-15)] font-semibold text-daf-text-primary dark:text-white">
                            Maybe later
                        </Text>
                    </Pressable>
                    <Text className="mt-[var(--support-12)] text-center text-[length:var(--support-12)] leading-[var(--support-17)] text-daf-text-tertiary dark:text-neutral-400">
                        Opens Buy Me a Coffee in Safari. Any amount, one time or
                        monthly. You can always find this later under Support
                        DAF.
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}
