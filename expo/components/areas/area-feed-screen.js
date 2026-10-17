import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Pressable,
    RefreshControl,
    ScrollView,
    useColorScheme,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { AREA_KINDS } from './area-geometry';
import {
    AREA_WINDOWS,
    AreaButton as DafButton,
    areaCardClass,
    AreaError,
    AreaHeader,
    AreaLoading,
    AreaSegmentedControl as DafSegmentedControl,
    AreaText as Text,
} from './area-ui';
import { useAreas } from './areas-context';
import { useAreaFeed } from './use-area-feed';

export default function AreaFeedScreen() {
    const { areaId } = useLocalSearchParams();
    const [window, setWindow] = useState('7');
    const { payload, error, loading, reload, loadMore } = useAreaFeed(
        areaId,
        window,
    );
    const { areas, markRead } = useAreas();
    const readThrough = useRef(null);
    const insets = useSafeAreaInsets();
    const dark = useColorScheme() === 'dark';
    useEffect(() => {
        if (payload && readThrough.current !== payload.read_through_id) {
            readThrough.current = payload.read_through_id;
            markRead(areaId, payload.read_through_id).catch(() => {
                readThrough.current = null;
            });
        }
    }, [areaId, payload, markRead]);
    const area =
        payload?.area ??
        areas.find((item) => String(item.id) === String(areaId));
    const changes = payload?.changes.data ?? [];
    const groups = [];
    for (const change of changes) {
        const date = new Date(change.changed_at);
        const today = date.toDateString() === new Date().toDateString();
        const label = today
            ? 'Today'
            : date.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
              });
        let group = groups[groups.length - 1];
        if (group?.label !== label) {
            group = { label, records: [] };
            groups.push(group);
        }
        group.records.push(change);
    }
    return (
        <View className="flex-1" testID="area-feed-screen">
            <AreaHeader
                title={area?.name ?? 'Area changes'}
                subtitle={
                    area
                        ? `${AREA_KINDS[area.kind]} · ${area.camera_count} cameras mapped`
                        : undefined
                }
                trailing={
                    <Pressable
                        accessibilityRole="button"
                        className="h-[40px] w-[40px] items-center justify-center"
                        accessibilityLabel="Area alert settings"
                        testID="area-alert-settings"
                        onPress={() => router.push(`/areas/${areaId}/alerts`)}
                    >
                        <Icon
                            name="bell"
                            size={20}
                            color={dark ? '#F5F7F9' : '#11151B'}
                        />
                    </Pressable>
                }
            />
            <View className="px-[16px] pt-[8px]">
                <DafSegmentedControl
                    options={AREA_WINDOWS}
                    value={window}
                    onChange={setWindow}
                    testIDPrefix="area-window"
                />
            </View>
            {payload ? (
                <View className="flex-row gap-[10px] px-[16px] pb-[4px] pt-[14px]">
                    {[
                        ['added', 'Added', 'text-[#E5383B]'],
                        [
                            'removed',
                            'Removed',
                            'text-daf-text-brand dark:text-daf-brand-hover',
                        ],
                    ].map(([key, label, tone]) => (
                        <View
                            key={key}
                            className="flex-1 rounded-dafMd border border-daf-border bg-white px-[14px] py-[12px] dark:border-daf-border-dark dark:bg-daf-surface-dark"
                        >
                            <Text className="mb-[6px] text-[11px] uppercase tracking-[0.66px] text-daf-text-tertiary">
                                {label}
                            </Text>
                            <Text
                                className={`font-dafMono text-[28px] font-semibold leading-[28px] tracking-[-0.56px] ${tone}`}
                            >
                                {payload.counts[key]}
                            </Text>
                        </View>
                    ))}
                </View>
            ) : null}
            <ScrollView
                className="flex-1 px-[16px] pt-[8px]"
                contentContainerStyle={{ paddingBottom: 40 }}
                refreshControl={
                    <RefreshControl
                        refreshing={loading && Boolean(payload)}
                        onRefresh={() => reload()}
                        tintColor="#1FBF6B"
                    />
                }
            >
                <AreaError message={error} onRetry={() => reload()} />
                {loading && !payload ? <AreaLoading /> : null}
                {payload ? (
                    <>
                        {groups.map((group) => (
                            <View
                                key={group.label}
                                className="mb-[6px] mt-[10px]"
                            >
                                <Text className="mb-[6px] text-[11px] uppercase tracking-[0.66px] text-daf-text-tertiary">
                                    {group.label}
                                </Text>
                                <View
                                    className={`${areaCardClass} overflow-hidden`}
                                >
                                    {group.records.map((change, index) => (
                                        <Pressable
                                            key={change.id}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Camera ${change.kind}, ${change.street}`}
                                            className={`min-h-[60px] flex-row items-center gap-[12px] px-[14px] py-[12px] ${index ? 'border-t border-daf-border dark:border-daf-border-dark' : ''}`}
                                            onPress={() =>
                                                router.push(
                                                    `/areas/${areaId}/change?changeId=${change.id}`,
                                                )
                                            }
                                        >
                                            <View
                                                className={`h-[32px] w-[32px] items-center justify-center rounded-dafSm ${change.kind === 'added' ? 'bg-daf-alert/10' : 'bg-daf-brand/10 dark:bg-daf-brand/[0.16]'}`}
                                            >
                                                <Icon
                                                    name={
                                                        change.kind === 'added'
                                                            ? 'plus'
                                                            : 'minus'
                                                    }
                                                    size={16}
                                                    color={
                                                        change.kind === 'added'
                                                            ? '#E5383B'
                                                            : dark
                                                              ? '#2FC177'
                                                              : '#0F7D45'
                                                    }
                                                />
                                            </View>
                                            <View className="min-w-0 flex-1">
                                                <Text
                                                    className="text-[15px] font-semibold text-daf-text-primary dark:text-daf-text-inverse"
                                                    numberOfLines={1}
                                                >
                                                    {change.street}
                                                </Text>
                                                <Text
                                                    className="mt-[2px] text-xs text-daf-text-tertiary"
                                                    numberOfLines={1}
                                                >
                                                    {change.kind === 'added'
                                                        ? 'Added'
                                                        : 'Removed'}{' '}
                                                    · {change.operator}
                                                </Text>
                                            </View>
                                            <Text className="font-dafMono text-[12px] text-daf-text-tertiary">
                                                {new Date(
                                                    change.changed_at,
                                                ).toLocaleTimeString(
                                                    undefined,
                                                    {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        hour12: false,
                                                    },
                                                )}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>
                        ))}
                        {!changes.length ? (
                            <View
                                className={`${areaCardClass} items-center gap-3 p-8`}
                            >
                                <Icon
                                    name="shield-check"
                                    size={32}
                                    color="#1FBF6B"
                                />
                                <Text className="text-center text-[15px] font-semibold text-daf-text-primary dark:text-daf-text-inverse">
                                    No camera changes in this time period.
                                </Text>
                                <Text className="text-center text-xs text-daf-text-tertiary dark:text-daf-text-tertiary">
                                    Mapped additions and removals will appear
                                    here.
                                </Text>
                            </View>
                        ) : null}
                        {payload.changes.current_page <
                        payload.changes.last_page ? (
                            <DafButton
                                className="mt-3"
                                variant="secondary"
                                loading={loading}
                                onPress={loadMore}
                            >
                                Load more changes
                            </DafButton>
                        ) : null}
                    </>
                ) : null}
            </ScrollView>
            {payload ? (
                <View
                    className="border-t border-daf-border bg-white px-[16px] pt-[10px] dark:border-daf-border-dark dark:bg-daf-surface-dark"
                    style={{ paddingBottom: insets.bottom + 10 }}
                    testID="area-feed-footer"
                >
                    <DafButton
                        className="mb-[8px]"
                        variant="secondary"
                        testID="area-view-all-nodes"
                        onPress={() =>
                            router.push(`/areas/${areaId}/map?view=all`)
                        }
                    >
                        View Area on Map
                    </DafButton>
                    {payload.changes.total ? (
                        <DafButton
                            variant="secondary"
                            testID="area-view-map"
                            onPress={() =>
                                router.push(
                                    `/areas/${areaId}/map?window=${window}`,
                                )
                            }
                        >
                            {`Show ${payload.changes.total} ${payload.changes.total === 1 ? 'change' : 'changes'} on the map`}
                        </DafButton>
                    ) : null}
                </View>
            ) : null}
        </View>
    );
}
