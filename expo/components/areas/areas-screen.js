import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { ALERT_MODES, AREA_KINDS } from './area-geometry';
import {
    AreaAddButton,
    AreaBadge as DafBadge,
    areaCardClass,
    AreaError,
    AreaHeader,
    AreaLoading,
    AreaPrivacy,
    AreaSegmentedControl as DafSegmentedControl,
    AreaText as Text,
} from './area-ui';
import { useAreas } from './areas-context';

export default function AreasScreen() {
    const { areas, loading, error, refresh, timeWindow, setTimeWindow } =
        useAreas();
    const insets = useSafeAreaInsets();
    useFocusEffect(
        useCallback(() => {
            refresh();
        }, [refresh]),
    );
    const total = areas.reduce(
        (sum, area) => sum + area.counts.added + area.counts.removed,
        0,
    );
    return (
        <View className="flex-1" testID="areas-screen">
            <AreaHeader
                root
                title="My areas"
                trailing={areas.length ? <AreaAddButton /> : null}
            />
            <ScrollView
                contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                className={areas.length ? 'px-4' : 'px-[22px]'}
                refreshControl={
                    <RefreshControl
                        refreshing={loading && areas.length > 0}
                        onRefresh={refresh}
                        tintColor="#1FBF6B"
                    />
                }
            >
                <AreaError message={error} onRetry={refresh} />
                {loading && !areas.length ? <AreaLoading /> : null}
                {!loading && !error && !areas.length ? (
                    <>
                        <View className="pb-[26px] pt-7">
                            <View className="mb-5 h-[58px] w-[58px] items-center justify-center rounded-dafLg bg-daf-brand/10">
                                <Icon
                                    name="map-pin"
                                    size={28}
                                    color="#1FBF6B"
                                />
                            </View>
                            <Text className="font-dafDisplay text-[32px] font-bold leading-[37px] text-daf-text-primary dark:text-white">
                                Keep an eye on the places you drive
                            </Text>
                            <Text className="mt-3 text-[17px] leading-[25px] text-daf-text-secondary dark:text-neutral-300">
                                Pick a city, a ZIP, or a shape on the map. We’ll
                                tell you when a camera shows up there — or comes
                                down.
                            </Text>
                        </View>
                        <Text className="mb-2 text-[11px] uppercase tracking-[1px] text-daf-text-tertiary dark:text-neutral-400">
                            Add an area
                        </Text>
                        <View className={`${areaCardClass} px-4`}>
                            {[
                                [
                                    'search',
                                    'search',
                                    'Search a city, county or ZIP',
                                    'Oakland, Alameda County, 94601…',
                                ],
                                [
                                    'around',
                                    'locate-fixed',
                                    'Around your location',
                                    'A radius you choose, 1–25 mi',
                                ],
                                [
                                    'draw',
                                    'pencil',
                                    'Draw on the map',
                                    'Your neighborhood, your commute, your call',
                                ],
                            ].map(([mode, icon, title, description], index) => (
                                <Pressable
                                    key={mode}
                                    accessibilityRole="button"
                                    className={`flex-row items-center gap-3 py-4 ${index ? 'border-t border-daf-border dark:border-daf-border-dark' : ''}`}
                                    onPress={() =>
                                        router.push(`/areas/add?mode=${mode}`)
                                    }
                                >
                                    <View className="h-[38px] w-[38px] items-center justify-center rounded-dafSm bg-daf-surface-alt dark:bg-daf-surface-inverse">
                                        <Icon
                                            name={icon}
                                            size={19}
                                            color="#828D9B"
                                        />
                                    </View>
                                    <View className="min-w-0 flex-1">
                                        <Text className="text-[15px] font-semibold text-daf-text-primary dark:text-white">
                                            {title}
                                        </Text>
                                        <Text className="mt-1 text-xs text-daf-text-tertiary dark:text-neutral-400">
                                            {description}
                                        </Text>
                                    </View>
                                    <Icon
                                        name="chevron-right"
                                        size={16}
                                        color="#828D9B"
                                    />
                                </Pressable>
                            ))}
                        </View>
                    </>
                ) : null}
                {areas.length ? (
                    <View className="mb-[14px] mt-[6px] flex-row items-center justify-between gap-[12px]">
                        <Text className="min-w-0 flex-1 text-xs text-daf-text-tertiary dark:text-neutral-400">
                            {areas.length}{' '}
                            {areas.length === 1 ? 'area' : 'areas'} · {total}{' '}
                            changes{' '}
                            {timeWindow === '24h'
                                ? 'in 24 hours'
                                : timeWindow === '30'
                                  ? 'in 30 days'
                                  : 'this week'}
                        </Text>
                        <DafSegmentedControl
                            compact
                            options={[
                                { value: '24h', label: '24h' },
                                { value: '7', label: '7 days' },
                                { value: '30', label: '30 days' },
                            ]}
                            value={timeWindow}
                            onChange={setTimeWindow}
                        />
                    </View>
                ) : null}
                {areas.map((area) => (
                    <View
                        key={area.id}
                        className={`${areaCardClass} mb-[10px] px-[16px] py-[14px]`}
                    >
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`View ${area.name}`}
                            testID={`area-card-${area.id}`}
                            onPress={() => router.push(`/areas/${area.id}`)}
                        >
                            <View className="flex-row items-center gap-[12px]">
                                <View className="min-w-0 flex-1">
                                    <View className="flex-row items-center gap-[8px]">
                                        <Text
                                            className="min-w-0 shrink text-[16px] font-semibold text-daf-text-primary dark:text-white"
                                            numberOfLines={1}
                                        >
                                            {area.name}
                                        </Text>
                                        <DafBadge kind>
                                            {AREA_KINDS[area.kind]}
                                        </DafBadge>
                                    </View>
                                    <Text
                                        className="mt-[3px] text-xs text-daf-text-tertiary dark:text-neutral-400"
                                        numberOfLines={1}
                                    >
                                        {area.definition} · {area.camera_count}{' '}
                                        cameras mapped
                                    </Text>
                                </View>
                                <Icon
                                    name="chevron-right"
                                    size={18}
                                    color="#828D9B"
                                />
                            </View>
                        </Pressable>
                        <View className="mt-[12px] flex-row flex-wrap items-center gap-[8px]">
                            {area.counts.added ? (
                                <DafBadge tone="alert">
                                    +{area.counts.added} added
                                </DafBadge>
                            ) : null}
                            {area.counts.removed ? (
                                <DafBadge tone="brand">
                                    −{area.counts.removed} removed
                                </DafBadge>
                            ) : null}
                            {!area.counts.added && !area.counts.removed ? (
                                <Text className="text-xs text-daf-text-tertiary dark:text-neutral-400">
                                    {timeWindow === '7'
                                        ? 'Quiet week. Zero new boxes.'
                                        : 'No changes in this period.'}
                                </Text>
                            ) : null}
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Alerts for ${area.name}`}
                                className="ml-auto min-h-[24px] flex-row items-center gap-[5px]"
                                onPress={() =>
                                    router.push(`/areas/${area.id}/alerts`)
                                }
                            >
                                <Icon name="bell" size={14} color="#828D9B" />
                                <Text className="text-xs text-daf-text-tertiary dark:text-neutral-400">
                                    {
                                        ALERT_MODES.find(
                                            (mode) =>
                                                mode.value === area.alert_mode,
                                        )?.label
                                    }
                                </Text>
                                {area.unread_count ? (
                                    <DafBadge tone="brand">
                                        {area.unread_count} new
                                    </DafBadge>
                                ) : null}
                            </Pressable>
                        </View>
                    </View>
                ))}
                <AreaPrivacy />
            </ScrollView>
        </View>
    );
}
