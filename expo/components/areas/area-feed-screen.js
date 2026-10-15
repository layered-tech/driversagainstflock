import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { DafIconButton } from '../design-system/primitives';
import { AREA_KINDS } from './area-geometry';
import {
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

export const AREA_WINDOWS = [
    { value: '24h', label: '24h' },
    { value: '7', label: '7 days' },
    { value: '30', label: '30 days' },
];
export default function AreaFeedScreen() {
    const { areaId } = useLocalSearchParams();
    const [window, setWindow] = useState('7');
    const { payload, error, loading, reload, loadMore } = useAreaFeed(
        areaId,
        window,
    );
    const { markRead } = useAreas();
    const readThrough = useRef(null);
    const insets = useSafeAreaInsets();
    useEffect(() => {
        if (payload && readThrough.current !== payload.read_through_id) {
            readThrough.current = payload.read_through_id;
            markRead(areaId, payload.read_through_id).catch(() => {
                readThrough.current = null;
            });
        }
    }, [areaId, payload, markRead]);
    const area = payload?.area;
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
                    <DafIconButton
                        icon="bell"
                        accessibilityLabel="Area alert settings"
                        testID="area-alert-settings"
                        onPress={() => router.push(`/areas/${areaId}/alerts`)}
                    />
                }
            />
            <ScrollView
                className="px-4"
                contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                refreshControl={
                    <RefreshControl
                        refreshing={loading && Boolean(payload)}
                        onRefresh={() => reload()}
                        tintColor="#1FBF6B"
                    />
                }
            >
                <DafSegmentedControl
                    options={AREA_WINDOWS}
                    value={window}
                    onChange={setWindow}
                    testIDPrefix="area-window"
                />
                <AreaError message={error} onRetry={() => reload()} />
                {loading && !payload ? <AreaLoading /> : null}
                {payload ? (
                    <>
                        <View className="my-4 flex-row gap-3">
                            {[
                                ['added', 'Added', 'text-daf-alert'],
                                [
                                    'removed',
                                    'Removed',
                                    'text-daf-text-brand dark:text-daf-brand',
                                ],
                            ].map(([key, label, tone]) => (
                                <View
                                    key={key}
                                    className={`${areaCardClass} flex-1 p-4`}
                                >
                                    <Text className="text-[11px] uppercase tracking-[1px] text-daf-text-tertiary dark:text-neutral-400">
                                        {label}
                                    </Text>
                                    <Text
                                        className={`mt-1 font-dafMono text-[28px] font-semibold ${tone}`}
                                    >
                                        {payload.counts[key]}
                                    </Text>
                                </View>
                            ))}
                        </View>
                        {groups.map((group) => (
                            <View key={group.label} className="mb-5">
                                <Text className="mb-2 text-[11px] uppercase tracking-[1px] text-daf-text-tertiary dark:text-neutral-400">
                                    {group.label}
                                </Text>
                                <View className={areaCardClass}>
                                    {group.records.map((change, index) => (
                                        <Pressable
                                            key={change.id}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Camera ${change.kind}, ${change.street}`}
                                            className={`flex-row items-center gap-3 p-4 ${index ? 'border-t border-daf-border dark:border-daf-border-dark' : ''}`}
                                            onPress={() =>
                                                router.push(
                                                    `/areas/${areaId}/change?changeId=${change.id}`,
                                                )
                                            }
                                        >
                                            <View
                                                className={`h-10 w-10 items-center justify-center rounded-dafSm ${change.kind === 'added' ? 'bg-daf-alert/10' : 'bg-daf-brand/10'}`}
                                            >
                                                <Icon
                                                    name={
                                                        change.kind === 'added'
                                                            ? 'plus'
                                                            : 'minus'
                                                    }
                                                    size={20}
                                                    color={
                                                        change.kind === 'added'
                                                            ? '#FF4D4F'
                                                            : '#0F7D45'
                                                    }
                                                />
                                            </View>
                                            <View className="min-w-0 flex-1">
                                                <Text
                                                    className="text-[15px] font-semibold text-daf-text-primary dark:text-white"
                                                    numberOfLines={2}
                                                >
                                                    {change.street}
                                                </Text>
                                                <Text className="mt-1 text-xs text-daf-text-tertiary dark:text-neutral-400">
                                                    {change.kind === 'added'
                                                        ? 'Added'
                                                        : 'Removed'}{' '}
                                                    · {change.operator}
                                                </Text>
                                            </View>
                                            <Text className="font-dafMono text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                                                {new Date(
                                                    change.changed_at,
                                                ).toLocaleTimeString(
                                                    undefined,
                                                    {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    },
                                                )}
                                            </Text>
                                            <Icon
                                                name="chevron-right"
                                                size={14}
                                                color="#828D9B"
                                            />
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
                                <Text className="text-center text-[15px] font-semibold text-daf-text-primary dark:text-white">
                                    No camera changes in this time period.
                                </Text>
                                <Text className="text-center text-xs text-daf-text-tertiary dark:text-neutral-400">
                                    Mapped additions and removals will appear
                                    here.
                                </Text>
                            </View>
                        ) : null}
                        <DafButton
                            className={!changes.length ? 'mt-3' : ''}
                            icon="map"
                            testID="area-view-map"
                            onPress={() =>
                                router.push(
                                    `/areas/${areaId}/map?window=${window}`,
                                )
                            }
                        >
                            {payload.changes.total
                                ? `Show all ${payload.changes.total} on the map`
                                : 'View area on map'}
                        </DafButton>
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
                        <DafButton
                            className="mt-3"
                            icon="bell"
                            variant="ghost"
                            onPress={() =>
                                router.push(`/areas/${areaId}/alerts`)
                            }
                        >
                            Choose alerts for this area
                        </DafButton>
                    </>
                ) : null}
            </ScrollView>
        </View>
    );
}
