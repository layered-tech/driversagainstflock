import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
    Pressable,
    ScrollView,
    Switch,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { dafSemanticColors, getDafTheme } from '../design-system/tokens';
import { useScorecard } from './scorecard-context';
import { getScorecardExposureDriveGroups } from './scorecard-drive-exposures';
import {
    ScorecardPrivacyFooter,
    ScorecardScreenHeader,
} from './scorecard-screen-header';

function formatDay(timestamp) {
    return new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        weekday: 'short',
    }).format(new Date(timestamp));
}

function formatTime(timestamp, includeSeconds = false) {
    return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        second: includeSeconds ? '2-digit' : undefined,
    }).format(new Date(timestamp));
}

function formatOperatorTimestamp(timestamp) {
    return new Intl.DateTimeFormat(undefined, {
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
        minute: '2-digit',
        month: '2-digit',
        second: '2-digit',
    }).format(new Date(timestamp));
}

function getLocalDayKey(timestamp) {
    const date = new Date(timestamp);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

function groupDrivesByDay(driveGroups) {
    const groups = new Map();

    for (const driveGroup of driveGroups) {
        const dayKey = getLocalDayKey(driveGroup.endedAt);
        const group = groups.get(dayKey) ?? {
            day: formatDay(driveGroup.endedAt),
            dayKey,
            drives: [],
        };

        group.drives.push(driveGroup);
        groups.set(dayKey, group);
    }

    return [...groups.values()];
}

function formatDriveTitle(group) {
    if (group.active) {
        return 'Drive in progress';
    }

    if (!group.trip) {
        return 'Unfinished drive';
    }

    return group.mode === 'guided' ? 'Guided drive' : 'Free drive';
}

function formatDriveTimeRange(group) {
    const start = formatTime(group.startedAt);
    const end = formatTime(group.endedAt);

    return start === end ? start : `${start}–${end}`;
}

function formatDriveDetails(group) {
    const details = [
        `${group.confirmedCount} confirmed`,
        `${group.possibleCount} possible`,
    ];

    if (group.trip?.durationSeconds > 0) {
        details.push(
            `${Math.max(1, Math.round(group.trip.durationSeconds / 60))} min`,
        );
    }

    if (group.trip?.distanceMiles > 0) {
        details.push(
            `${group.trip.distanceMiles < 10 ? group.trip.distanceMiles.toFixed(1) : Math.round(group.trip.distanceMiles)} mi`,
        );
    }

    return details.join(' · ');
}

function getEventSummary(event) {
    return event.certainty === 'confirmed'
        ? `Confirmed cone crossing · ${event.cameraDirectionLabel ?? 'direction reported'}`
        : 'Possible crossing · camera direction unknown';
}

function StandardEventRow({ event }) {
    const confirmed = event.certainty === 'confirmed';
    const eventSummary = getEventSummary(event);

    return (
        <Pressable
            accessibilityLabel={`${event.label}, ${eventSummary}`}
            accessibilityRole="button"
            className="dark:border-daf-border-dark dark:bg-daf-surface-dark flex-row items-center gap-3 rounded-dafMd border border-daf-border bg-white px-[13px] py-3 active:opacity-70"
            onPress={() =>
                router.push({
                    params: { eventId: event.id },
                    pathname: '/scorecard/event/[eventId]',
                })
            }
            testID={`scorecard-event-${event.id}`}
        >
            <View
                className={`h-3 w-3 rounded-dafPill ${
                    confirmed ? 'bg-daf-alert' : 'bg-daf-amber'
                }`}
                style={{
                    shadowColor: confirmed ? '#FF4D4F' : '#FFB02E',
                    shadowOpacity: 0.35,
                    shadowRadius: 5,
                }}
            />
            <View className="min-w-0 flex-1">
                <Text
                    className="text-[14.5px] font-semibold text-daf-text-primary dark:text-white"
                    numberOfLines={1}
                >
                    {event.label}
                </Text>
                <Text
                    className="text-xs text-daf-text-tertiary dark:text-neutral-400"
                    numberOfLines={1}
                >
                    {eventSummary}
                </Text>
            </View>
            <Text className="font-dafMono text-xs text-daf-text-secondary dark:text-neutral-300">
                {formatTime(event.occurredAt)}
            </Text>
            <Icon
                color={dafSemanticColors.speedOk}
                name="chevron-right"
                size={16}
            />
        </Pressable>
    );
}

function OperatorEventRow({ event }) {
    return (
        <Pressable
            accessibilityLabel={`${event.label}, ${getEventSummary(event)}`}
            accessibilityRole="button"
            className="rounded-dafMd border border-l-[3px] border-[#262E37] border-l-daf-alert bg-[#161B22] px-[13px] py-3 active:opacity-70"
            onPress={() =>
                router.push({
                    params: { eventId: event.id },
                    pathname: '/scorecard/event/[eventId]',
                })
            }
            testID={`scorecard-event-${event.id}`}
        >
            <View className="mb-2 flex-row items-center gap-2">
                <Text className="font-dafMono text-xs font-bold tracking-[0.04em] text-daf-alert">
                    {formatOperatorTimestamp(event.occurredAt)}
                </Text>
                <Text
                    className="font-dafMono ml-auto text-[11px] text-[#828D9B]"
                    numberOfLines={1}
                >
                    {event.osmId ? `OSM ${event.osmId}` : 'NO OSM ID'}
                </Text>
            </View>
            <Text className="font-dafMono text-[12px] font-semibold uppercase text-white">
                {event.label}
            </Text>
            <Text className="font-dafMono mt-1 text-[11px] leading-[16px] text-[#A9B2BD]">
                {event.certainty === 'confirmed'
                    ? 'LOCAL MATCH: DIRECTIONAL CONE CROSSED'
                    : 'LOCAL MATCH: DIRECTION UNKNOWN · POSSIBLE ONLY'}
            </Text>
            <View className="mt-2 rounded-dafSm border border-[#3A434E] bg-[#11151B] px-2.5 py-2">
                <Text className="font-dafMono text-[10.5px] leading-[16px] text-[#828D9B]">
                    PLATE, VEHICLE, HOTLIST, AND AGENCY-SHARING DETAILS ARE NOT
                    AVAILABLE TO DAF. THIS SIMULATION USES ONLY THE PUBLIC
                    CAMERA NODE AND YOUR ON-DEVICE CROSSING.
                </Text>
            </View>
        </Pressable>
    );
}

function DriveTrailButton({ driveId, operatorView }) {
    return (
        <Pressable
            accessibilityLabel="View reconstructed trail for this drive"
            accessibilityRole="button"
            className={`min-h-hitComfy flex-row items-center justify-center gap-2 rounded-dafPill border px-[18px] active:opacity-75 ${
                operatorView
                    ? 'border-[#3A434E] bg-[#11151B]'
                    : 'dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/95 border-daf-border-glass bg-white/95'
            }`}
            onPress={() =>
                router.push({
                    params: { driveId },
                    pathname: '/scorecard/trail',
                })
            }
            testID={`scorecard-open-trail-${driveId}`}
        >
            <Icon
                color={
                    operatorView
                        ? dafSemanticColors.danger
                        : dafSemanticColors.brand
                }
                name="eye"
                size={17}
                stroke={2.4}
            />
            <Text
                className={`text-[15px] font-semibold ${
                    operatorView
                        ? 'text-white'
                        : 'text-daf-text-primary dark:text-white'
                }`}
            >
                View reconstructed trail
            </Text>
        </Pressable>
    );
}

export default function ScorecardTimelineScreen() {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const theme = getDafTheme(colorScheme);
    const { scorecardState, windowStats } = useScorecard();
    const [operatorView, setOperatorView] = useState(false);
    const groupedDays = useMemo(
        () => groupDrivesByDay(getScorecardExposureDriveGroups(scorecardState)),
        [scorecardState],
    );
    const eventCount = scorecardState.exposures.length;
    const bottomPadding = Math.max(insets.bottom + 24, 24);

    return (
        <View
            className={`flex-1 ${
                operatorView
                    ? 'bg-[#0B0E12]'
                    : 'bg-daf-surface-page dark:bg-[#0B0E12]'
            }`}
            testID="scorecard-timeline"
        >
            <ScorecardScreenHeader
                back
                backRoute="index"
                operatorView={operatorView}
                subtitle={
                    operatorView
                        ? `OPERATOR VIEW · ${windowStats.confirmedReadCount} CONFIRMED · 30 DAYS`
                        : `${windowStats.confirmedReadCount} confirmed · ${windowStats.possibleReadCount} possible · ${windowStats.avoidedCameraCount} avoided`
                }
                title="Exposure timeline"
            />
            <View
                className={`flex-row items-center gap-3 border-b px-4 py-3 ${
                    operatorView
                        ? 'border-[#262E37] bg-[#161B22]'
                        : 'dark:border-daf-border-dark dark:bg-daf-surface-dark border-daf-border bg-white'
                }`}
            >
                <View
                    className={`h-[34px] w-[34px] items-center justify-center rounded-dafSm ${
                        operatorView
                            ? 'bg-daf-alert/15'
                            : 'bg-daf-surface-alt dark:bg-daf-surface-inverse'
                    }`}
                >
                    <Icon
                        color={
                            operatorView
                                ? dafSemanticColors.danger
                                : dafSemanticColors.speedOk
                        }
                        name="eye"
                        size={18}
                    />
                </View>
                <View className="min-w-0 flex-1">
                    <Text
                        className={`text-[14.5px] font-semibold ${
                            operatorView
                                ? 'text-white'
                                : 'text-daf-text-primary dark:text-white'
                        }`}
                    >
                        See it like they do
                    </Text>
                    <Text
                        className={`text-xs ${
                            operatorView
                                ? 'text-[#828D9B]'
                                : 'text-daf-text-tertiary dark:text-neutral-400'
                        }`}
                    >
                        A truthful local simulation—no invented plate data
                    </Text>
                </View>
                <Switch
                    accessibilityLabel="See exposures in operator style"
                    onValueChange={setOperatorView}
                    trackColor={{
                        false: theme.border.strong,
                        true: dafSemanticColors.danger,
                    }}
                    value={operatorView}
                    testID="scorecard-operator-view-toggle"
                />
            </View>

            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: bottomPadding }}
            >
                <View className="gap-3 px-4 py-3">
                    {operatorView ? (
                        <View className="border-daf-alert/35 bg-daf-alert/10 flex-row items-start gap-2 rounded-dafMd border px-3 py-2.5">
                            <Icon
                                color={dafSemanticColors.danger}
                                name="triangle-alert"
                                size={15}
                            />
                            <Text className="min-w-0 flex-1 text-xs leading-[18px] text-[#A9B2BD]">
                                Built locally from your recorded DAF drives and
                                public camera nodes. DAF has no plate image,
                                vehicle description, hotlist result, or access
                                to an operator database.
                            </Text>
                        </View>
                    ) : null}

                    {eventCount === 0 ? (
                        <View
                            className={`rounded-dafLg border px-5 py-10 ${
                                operatorView
                                    ? 'border-[#262E37] bg-[#161B22]'
                                    : 'dark:border-daf-border-dark dark:bg-daf-surface-dark border-daf-border bg-white'
                            }`}
                        >
                            <Icon
                                color={
                                    operatorView
                                        ? '#828D9B'
                                        : dafSemanticColors.speedOk
                                }
                                name="shield-check"
                                size={30}
                                style={{ alignSelf: 'center' }}
                            />
                            <Text
                                className={`mt-3 text-center text-base font-bold ${
                                    operatorView
                                        ? 'text-white'
                                        : 'text-daf-text-primary dark:text-white'
                                }`}
                            >
                                No exposure events recorded
                            </Text>
                            <Text
                                className={`mt-1 text-center text-[13px] leading-[19px] ${
                                    operatorView
                                        ? 'text-[#828D9B]'
                                        : 'text-daf-text-secondary dark:text-neutral-300'
                                }`}
                            >
                                Events appear only during recorded DAF drives
                                and expire after 30 days unless you delete them
                                sooner.
                            </Text>
                        </View>
                    ) : (
                        groupedDays.map((dayGroup) => (
                            <View className="gap-2" key={dayGroup.dayKey}>
                                <View className="flex-row items-baseline">
                                    <Text
                                        className={`text-[13px] font-bold ${
                                            operatorView
                                                ? 'text-white'
                                                : 'text-daf-text-primary dark:text-white'
                                        }`}
                                    >
                                        {dayGroup.day}
                                    </Text>
                                    <Text
                                        className={`font-dafMono ml-auto text-[11px] ${
                                            operatorView
                                                ? 'text-[#828D9B]'
                                                : 'text-daf-text-tertiary dark:text-neutral-400'
                                        }`}
                                    >
                                        {dayGroup.drives.length}{' '}
                                        {dayGroup.drives.length === 1
                                            ? 'drive'
                                            : 'drives'}
                                    </Text>
                                </View>
                                <View className="gap-3">
                                    {dayGroup.drives.map((driveGroup) => (
                                        <View
                                            className={`overflow-hidden rounded-dafLg border ${
                                                operatorView
                                                    ? 'border-[#262E37] bg-[#11151B]'
                                                    : 'dark:border-daf-border-dark border-daf-border bg-daf-surface-alt dark:bg-daf-surface-inverse'
                                            }`}
                                            key={driveGroup.driveId}
                                            testID={`scorecard-drive-group-${driveGroup.driveId}`}
                                        >
                                            <View
                                                className={`gap-1 border-b px-3.5 py-3 ${
                                                    operatorView
                                                        ? 'border-[#262E37]'
                                                        : 'dark:border-daf-border-dark border-daf-border'
                                                }`}
                                            >
                                                <View className="flex-row items-baseline gap-3">
                                                    <Text
                                                        className={`min-w-0 flex-1 text-[14px] font-bold ${
                                                            operatorView
                                                                ? 'font-dafMono uppercase text-white'
                                                                : 'text-daf-text-primary dark:text-white'
                                                        }`}
                                                        numberOfLines={1}
                                                    >
                                                        {formatDriveTitle(
                                                            driveGroup,
                                                        )}
                                                    </Text>
                                                    <Text
                                                        className={`font-dafMono text-[11px] ${
                                                            operatorView
                                                                ? 'text-[#A9B2BD]'
                                                                : 'text-daf-text-secondary dark:text-neutral-300'
                                                        }`}
                                                    >
                                                        {formatDriveTimeRange(
                                                            driveGroup,
                                                        )}
                                                    </Text>
                                                </View>
                                                <Text
                                                    className={`text-xs ${
                                                        operatorView
                                                            ? 'font-dafMono text-[#828D9B]'
                                                            : 'text-daf-text-tertiary dark:text-neutral-400'
                                                    }`}
                                                >
                                                    {formatDriveDetails(
                                                        driveGroup,
                                                    )}
                                                </Text>
                                            </View>
                                            <View className="gap-2 p-2.5">
                                                {driveGroup.exposures.map(
                                                    (event) =>
                                                        operatorView ? (
                                                            <OperatorEventRow
                                                                event={event}
                                                                key={event.id}
                                                            />
                                                        ) : (
                                                            <StandardEventRow
                                                                event={event}
                                                                key={event.id}
                                                            />
                                                        ),
                                                )}
                                            </View>
                                            <View
                                                className={`border-t p-2.5 ${
                                                    operatorView
                                                        ? 'border-[#262E37]'
                                                        : 'dark:border-daf-border-dark border-daf-border'
                                                }`}
                                            >
                                                <DriveTrailButton
                                                    driveId={driveGroup.driveId}
                                                    operatorView={operatorView}
                                                />
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        ))
                    )}
                    <ScorecardPrivacyFooter operatorView={operatorView} />
                </View>
            </ScrollView>
        </View>
    );
}
