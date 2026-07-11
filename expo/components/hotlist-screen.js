import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../lib/safe-area-insets';
import { Icon } from './design-system/icon';
import { DafButton } from './design-system/primitives';
import { dafSemanticColors } from './design-system/tokens';
import { getHotlist } from './hotlist-api';
import { toggleNearestDrawer } from './map/navigation';

const WINDOW_OPTIONS = [
    { label: '24h', value: '24' },
    { label: '7 days', value: '7' },
    { label: '30 days', value: '30' },
];

function formatRelativeTime(value) {
    if (!value) {
        return 'Sync pending';
    }

    const timestamp = new Date(value).getTime();

    if (Number.isNaN(timestamp)) {
        return 'Sync pending';
    }

    const diffSeconds = Math.max(
        0,
        Math.round((Date.now() - timestamp) / 1000),
    );
    const diffMinutes = Math.floor(diffSeconds / 60);

    if (diffMinutes < 1) {
        return 'just now';
    }

    if (diffMinutes < 60) {
        return `${diffMinutes} min ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);

    if (diffHours < 24) {
        return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);

    if (diffDays < 7) {
        return `${diffDays}d ago`;
    }

    const diffWeeks = Math.floor(diffDays / 7);

    return `${diffWeeks}w ago`;
}

function formatStatLabel(label) {
    if (label === 'Added last 24 hours') {
        return 'Added · 24h';
    }

    if (label === 'Added last 7 days') {
        return 'Added · 7 days';
    }

    if (label === 'Added last 30 days') {
        return 'Added · 30 days';
    }

    return label;
}

function formatCount(value) {
    const number = Number(value ?? 0);

    return Number.isFinite(number) ? number.toLocaleString() : '0';
}

function HotlistSegmentedControl({ onChange, value }) {
    return (
        <View
            className="dark:border-daf-border-dark h-[42px] flex-row rounded-dafPill border border-daf-border bg-daf-surface-alt p-1 dark:bg-daf-surface-inverse"
            testID="hotlist-window-control"
        >
            {WINDOW_OPTIONS.map((option) => {
                const selected = option.value === value;

                return (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        className={`min-h-[34px] flex-1 items-center justify-center rounded-dafPill px-2 ${
                            selected
                                ? 'dark:bg-daf-surface-dark bg-white'
                                : 'bg-transparent'
                        }`}
                        key={option.value}
                        onPress={() => onChange(option.value)}
                        testID={`hotlist-window-${option.value}`}
                    >
                        <Text
                            className={`text-[13px] font-semibold ${
                                selected
                                    ? 'text-daf-text-primary dark:text-white'
                                    : 'text-daf-text-secondary dark:text-neutral-300'
                            }`}
                            numberOfLines={1}
                        >
                            {option.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

function HotlistStatTile({ stat }) {
    return (
        <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark flex-1 rounded-dafMd border border-daf-border bg-white px-3.5 py-3">
            <Text
                className="mb-2 text-[11px] font-bold uppercase leading-[13px] tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400"
                numberOfLines={2}
            >
                {formatStatLabel(stat.label)}
            </Text>
            <Text
                className="font-dafMono mb-1.5 text-[28px] font-semibold leading-[28px] text-daf-text-primary dark:text-white"
                numberOfLines={1}
            >
                {stat.value}
            </Text>
            <Text
                className="text-xs font-medium text-daf-text-tertiary dark:text-neutral-400"
                numberOfLines={1}
            >
                {stat.sub}
            </Text>
        </View>
    );
}

function HotlistNodeRow({ node, testID }) {
    return (
        <View
            className="dark:border-daf-border-dark flex-row items-center gap-[13px] border-t border-daf-border px-4 py-[13px]"
            testID={testID}
        >
            <View className="bg-daf-marker-alpr/15 h-[17px] w-[17px] flex-none items-center justify-center rounded-dafPill">
                <View className="h-[9px] w-[9px] rounded-dafPill bg-daf-marker-alpr" />
            </View>

            <View className="min-w-0 flex-1">
                <Text
                    className="text-[15px] font-semibold leading-[19px] text-daf-text-primary dark:text-white"
                    numberOfLines={1}
                >
                    {node.typeLabel}
                </Text>
                <Text
                    className="text-[13px] leading-[18px] text-daf-text-secondary dark:text-neutral-300"
                    numberOfLines={2}
                >
                    {node.street}
                </Text>
                <Text
                    className="font-dafMono mt-0.5 text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400"
                    numberOfLines={1}
                >
                    {node.osm}
                </Text>
            </View>

            <View className="max-w-[112px] flex-none items-end gap-[3px]">
                <Text
                    className="font-dafMono text-xs leading-[15px] text-daf-text-brand dark:text-daf-brand"
                    numberOfLines={1}
                >
                    {formatRelativeTime(node.updatedAt)}
                </Text>
                <Text
                    className="text-[11px] leading-[14px] text-daf-text-tertiary dark:text-neutral-400"
                    numberOfLines={1}
                >
                    {node.operator}
                </Text>
            </View>
        </View>
    );
}

function HotlistAttribution() {
    return (
        <View className="dark:border-daf-border-dark flex-row items-center gap-[7px] border-t border-daf-border px-4 py-4">
            <Icon color={dafSemanticColors.speedOk} name="map-pin" size={14} />
            <Text className="text-xs text-daf-text-tertiary dark:text-neutral-400">
                Data from OpenStreetMap contributors
            </Text>
        </View>
    );
}

function HotlistEmptyState() {
    return (
        <View className="dark:border-daf-border-dark border-t border-daf-border px-4 py-8">
            <Text className="text-center text-[15px] font-semibold text-daf-text-primary dark:text-white">
                No recent nodes
            </Text>
            <Text className="mt-1 text-center text-[13px] text-daf-text-secondary dark:text-neutral-300">
                Try another window or vendor filter.
            </Text>
        </View>
    );
}

function HotlistErrorState({ message, onRetry }) {
    return (
        <View className="dark:border-daf-border-dark border-t border-daf-border px-4 py-8">
            <Text className="text-center text-[15px] font-semibold text-daf-text-primary dark:text-white">
                Hotlist unavailable
            </Text>
            <Text className="mx-auto mt-1 max-w-[280px] text-center text-[13px] leading-[18px] text-daf-text-secondary dark:text-neutral-300">
                {message}
            </Text>
            <DafButton
                className="mt-4 self-center"
                onPress={onRetry}
                variant="secondary"
            >
                Retry
            </DafButton>
        </View>
    );
}

export default function HotlistScreen() {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const [errorMessage, setErrorMessage] = useState('');
    const [hotlist, setHotlist] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [manufacturer, setManufacturer] = useState('all');
    const [timeWindow, setTimeWindow] = useState('7');
    const isDarkMode = colorScheme === 'dark';
    const headerPaddingTop =
        Platform.OS === 'ios'
            ? Math.max(insets.top + 10, 54)
            : Math.max(insets.top + 10, 16);
    const scrollPaddingBottom = Math.max(insets.bottom + 28, 28);
    const latestLabel = formatRelativeTime(hotlist?.latestSyncedAt);
    const stats = useMemo(() => {
        const payloadStats = hotlist?.stats ?? [];

        if (payloadStats.length >= 2) {
            return payloadStats.slice(0, 2);
        }

        return [
            {
                label: `Added last ${
                    timeWindow === '24'
                        ? '24 hours'
                        : timeWindow === '30'
                          ? '30 days'
                          : '7 days'
                }`,
                sub: '0% vs previous window',
                value: formatCount(hotlist?.manufacturerCounts?.all),
            },
            {
                label: 'Flock readers',
                sub: '0% of added',
                value: formatCount(hotlist?.manufacturerCounts?.flock),
            },
        ];
    }, [hotlist?.manufacturerCounts, hotlist?.stats, timeWindow]);
    const chips = useMemo(() => {
        const counts = hotlist?.manufacturerCounts ?? {};

        return [
            {
                label: `All · ${formatCount(counts.all)}`,
                value: 'all',
            },
            {
                label: `Flock · ${formatCount(counts.flock)}`,
                value: 'flock',
            },
            {
                label: `Other vendors · ${formatCount(counts.other)}`,
                value: 'other',
            },
        ];
    }, [hotlist?.manufacturerCounts]);
    const nodes = hotlist?.nodes?.data ?? [];

    const loadHotlist = useCallback(
        async ({ refresh = false } = {}) => {
            const controller = new AbortController();

            if (refresh) {
                setIsRefreshing(true);
            } else {
                setIsLoading(true);
            }

            try {
                const payload = await getHotlist({
                    manufacturer,
                    signal: controller.signal,
                    timeWindow,
                });

                setHotlist(payload);
                setErrorMessage('');
            } catch (error) {
                if (error?.name !== 'AbortError') {
                    setErrorMessage(
                        error?.message || 'Hotlist could not be loaded.',
                    );
                }
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }

            return () => {
                controller.abort();
            };
        },
        [manufacturer, timeWindow],
    );

    useEffect(() => {
        const controller = new AbortController();

        setIsLoading(true);

        getHotlist({
            manufacturer,
            signal: controller.signal,
            timeWindow,
        })
            .then((payload) => {
                setHotlist(payload);
                setErrorMessage('');
            })
            .catch((error) => {
                if (error?.name !== 'AbortError') {
                    setErrorMessage(
                        error?.message || 'Hotlist could not be loaded.',
                    );
                }
            })
            .finally(() => {
                setIsLoading(false);
                setIsRefreshing(false);
            });

        return () => {
            controller.abort();
        };
    }, [manufacturer, timeWindow]);

    const handleRefresh = useCallback(() => {
        loadHotlist({ refresh: true });
    }, [loadHotlist]);
    const handleDrawerPress = useCallback(() => {
        toggleNearestDrawer(navigation);
    }, [navigation]);

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="hotlist-screen"
        >
            <View
                className="dark:border-daf-border-dark dark:bg-daf-surface-dark border-b border-daf-border bg-white px-4 pb-3.5"
                style={{ paddingTop: headerPaddingTop }}
            >
                <View className="mb-3.5 flex-row items-start justify-between gap-2.5">
                    <Pressable
                        accessibilityLabel="Open menu"
                        accessibilityRole="button"
                        className="dark:border-daf-border-dark mt-0.5 h-10 w-10 items-center justify-center rounded-dafPill border border-daf-border bg-daf-surface-alt active:opacity-[0.82] dark:bg-daf-surface-inverse"
                        onPress={handleDrawerPress}
                        testID="hotlist-drawer-button"
                    >
                        <Icon
                            color={isDarkMode ? '#F4F7FA' : '#0B0E12'}
                            name="menu"
                            size={20}
                        />
                    </Pressable>
                    <View className="min-w-0 flex-1">
                        <Text className="mb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-brand dark:text-daf-brand">
                            Hotlist
                        </Text>
                        <Text className="font-dafDisplay text-lg font-bold leading-5 text-daf-text-primary dark:text-white">
                            Recently added
                        </Text>
                    </View>

                    <View className="dark:border-daf-border-dark mt-0.5 h-[31px] flex-row items-center gap-[7px] rounded-dafPill border border-daf-border bg-daf-surface-alt px-[11px] dark:bg-daf-surface-inverse">
                        <View className="h-1.5 w-1.5 rounded-dafPill bg-daf-text-brand dark:bg-daf-brand" />
                        <Text
                            className="text-xs font-semibold text-daf-text-secondary dark:text-neutral-300"
                            numberOfLines={1}
                        >
                            {latestLabel}
                        </Text>
                    </View>
                </View>

                <HotlistSegmentedControl
                    onChange={setTimeWindow}
                    value={timeWindow}
                />
            </View>

            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: scrollPaddingBottom }}
                refreshControl={
                    <RefreshControl
                        colors={[dafSemanticColors.brand]}
                        onRefresh={handleRefresh}
                        refreshing={isRefreshing}
                        tintColor={dafSemanticColors.brand}
                    />
                }
            >
                <View className="flex-row gap-2.5 px-4 pb-1.5 pt-3.5">
                    {stats.map((stat) => (
                        <HotlistStatTile key={stat.label} stat={stat} />
                    ))}
                </View>

                <ScrollView
                    horizontal
                    className="py-2.5"
                    showsHorizontalScrollIndicator={false}
                >
                    <View className="flex-row gap-2 px-4">
                        {chips.map((chip) => {
                            const selected = chip.value === manufacturer;

                            return (
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityState={{ selected }}
                                    key={chip.value}
                                    onPress={() => setManufacturer(chip.value)}
                                    className={`h-[34px] flex-row items-center rounded-dafPill border px-3 active:opacity-[0.82] ${
                                        selected
                                            ? 'border-daf-brand bg-daf-brand'
                                            : 'dark:border-daf-border-dark dark:bg-daf-surface-dark border-daf-border bg-white'
                                    }`}
                                    testID={`hotlist-chip-${chip.value}`}
                                >
                                    <Text
                                        className={`text-[13px] font-semibold ${
                                            selected
                                                ? 'text-white'
                                                : 'text-daf-text-primary dark:text-white'
                                        }`}
                                        numberOfLines={1}
                                    >
                                        {chip.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </ScrollView>

                {isLoading && !hotlist ? (
                    <View className="dark:border-daf-border-dark items-center border-t border-daf-border px-4 py-10">
                        <ActivityIndicator
                            color={
                                isDarkMode
                                    ? dafSemanticColors.brandHover
                                    : dafSemanticColors.brand
                            }
                        />
                    </View>
                ) : errorMessage ? (
                    <HotlistErrorState
                        message={errorMessage}
                        onRetry={() => loadHotlist()}
                    />
                ) : nodes.length === 0 ? (
                    <HotlistEmptyState />
                ) : (
                    <View>
                        {nodes.map((node, index) => (
                            <HotlistNodeRow
                                key={`${node.id}-${node.osmId ?? index}`}
                                node={node}
                                testID={`hotlist-row-${index}`}
                            />
                        ))}
                    </View>
                )}

                <HotlistAttribution />
            </ScrollView>
        </View>
    );
}
