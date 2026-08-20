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
import { DafButton } from '../design-system/primitives';
import { dafSemanticColors, getDafTheme } from '../design-system/tokens';
import { useScorecard } from './scorecard-context';
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

function groupEventsByDay(exposures) {
    const groups = new Map();

    for (const exposure of [...exposures].sort(
        (first, second) => second.occurredAt - first.occurredAt,
    )) {
        const day = formatDay(exposure.occurredAt);
        const group = groups.get(day) ?? [];

        group.push(exposure);
        groups.set(day, group);
    }

    return [...groups.entries()].map(([day, events]) => ({ day, events }));
}

function getEventSummary(event) {
    return event.certainty === 'confirmed'
        ? `Confirmed cone crossing · ${event.cameraDirectionLabel ?? 'direction reported'}`
        : 'Possible crossing · camera direction unknown · not scored';
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

export default function ScorecardTimelineScreen() {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const theme = getDafTheme(colorScheme);
    const { scorecardState, windowStats } = useScorecard();
    const [operatorView, setOperatorView] = useState(false);
    const groupedEvents = useMemo(
        () => groupEventsByDay(scorecardState.exposures),
        [scorecardState.exposures],
    );
    const eventCount = scorecardState.exposures.length;
    const confirmedEventCount = scorecardState.exposures.filter(
        (event) => event.certainty === 'confirmed',
    ).length;
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
                                Built locally from your explicit DAF drives and
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
                                Events appear only during explicit DAF drives
                                and remain until you delete them.
                            </Text>
                        </View>
                    ) : (
                        groupedEvents.map((group) => (
                            <View key={group.day}>
                                <View className="mb-2 mt-1 flex-row items-baseline">
                                    <Text
                                        className={`text-[13px] font-bold ${
                                            operatorView
                                                ? 'text-white'
                                                : 'text-daf-text-primary dark:text-white'
                                        }`}
                                    >
                                        {group.day}
                                    </Text>
                                    <Text
                                        className={`font-dafMono ml-auto text-[11px] ${
                                            operatorView
                                                ? 'text-[#828D9B]'
                                                : 'text-daf-text-tertiary dark:text-neutral-400'
                                        }`}
                                    >
                                        {group.events.length}{' '}
                                        {group.events.length === 1
                                            ? 'event'
                                            : 'events'}
                                    </Text>
                                </View>
                                <View className="gap-2">
                                    {group.events.map((event) =>
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
                            </View>
                        ))
                    )}

                    {confirmedEventCount > 1 ? (
                        <DafButton
                            icon="eye"
                            onPress={() => router.push('/scorecard/trail')}
                            testID="scorecard-open-trail"
                            variant="secondary"
                        >
                            View reconstructed trail
                        </DafButton>
                    ) : null}
                    <ScorecardPrivacyFooter operatorView={operatorView} />
                </View>
            </ScrollView>
        </View>
    );
}
