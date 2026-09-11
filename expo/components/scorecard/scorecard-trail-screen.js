import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { dafSemanticColors } from '../design-system/tokens';
import { getDirections } from '../map/api';
import { useScorecard } from './scorecard-context';
import { getScorecardExposureDriveGroup } from './scorecard-drive-exposures';
import { getScorecardFastestTrailLineCollection } from './scorecard-fastest-trail';
import { ScorecardExposureMap } from './scorecard-map';
import {
    ScorecardPrivacyFooter,
    ScorecardScreenHeader,
} from './scorecard-screen-header';

function getTrailPoints(exposures) {
    return exposures
        .filter((exposure) => exposure.certainty === 'confirmed')
        .sort((first, second) => first.occurredAt - second.occurredAt)
        .map((event, index) => ({ event, index: index + 1 }));
}

function formatTrailTime(timestamp) {
    return new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        weekday: 'short',
    }).format(new Date(timestamp));
}

function formatDriveSubtitle(driveGroup) {
    if (!driveGroup) {
        return 'Drive unavailable · camera hits only';
    }

    const mode = driveGroup.active
        ? 'Drive in progress'
        : driveGroup.mode === 'guided'
          ? 'Guided drive'
          : driveGroup.mode === 'free'
            ? 'Free drive'
            : 'Unfinished drive';

    return `${mode} · ${formatTrailTime(driveGroup.startedAt)}`;
}

const EMPTY_TRAIL_LINE_COLLECTION = Object.freeze({
    features: [],
    type: 'FeatureCollection',
});

export default function ScorecardTrailScreen() {
    const insets = useSafeAreaInsets();
    const { driveId: requestedDriveId } = useLocalSearchParams();
    const { scorecardState } = useScorecard();
    const driveGroup = useMemo(
        () => getScorecardExposureDriveGroup(scorecardState, requestedDriveId),
        [requestedDriveId, scorecardState],
    );
    const trailPoints = useMemo(
        () => getTrailPoints(driveGroup?.exposures ?? []),
        [driveGroup],
    );
    const trailExposures = useMemo(
        () =>
            trailPoints.map((point) => ({
                ...point.event,
                sessionId: driveGroup?.driveId,
            })),
        [driveGroup, trailPoints],
    );
    const selectedDriveId = driveGroup?.driveId ?? null;
    const [trailLineResult, setTrailLineResult] = useState({
        collection: EMPTY_TRAIL_LINE_COLLECTION,
        driveId: null,
    });
    const trailLineCollection =
        trailLineResult.driveId === selectedDriveId
            ? trailLineResult.collection
            : EMPTY_TRAIL_LINE_COLLECTION;
    const possibleCount = driveGroup?.possibleCount ?? 0;
    const bottomPadding = Math.max(insets.bottom + 24, 24);

    useEffect(() => {
        const abortController = new AbortController();

        setTrailLineResult({
            collection: EMPTY_TRAIL_LINE_COLLECTION,
            driveId: selectedDriveId,
        });

        void getScorecardFastestTrailLineCollection({
            exposures: trailExposures,
            requestDirections: getDirections,
            signal: abortController.signal,
        }).then((collection) => {
            if (!abortController.signal.aborted) {
                setTrailLineResult({
                    collection,
                    driveId: selectedDriveId,
                });
            }
        });

        return () => abortController.abort();
    }, [selectedDriveId, trailExposures]);

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="scorecard-trail"
        >
            <ScorecardScreenHeader
                back
                backRoute="timeline"
                subtitle={formatDriveSubtitle(driveGroup)}
                title="Reconstructed trail"
            />
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: bottomPadding }}
            >
                <View className="gap-3.5 px-4 py-4">
                    <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark overflow-hidden rounded-dafLg border border-daf-border bg-white">
                        <View className="flex-row items-center gap-3 px-4 py-3.5">
                            <Icon
                                color={dafSemanticColors.danger}
                                name="eye"
                                size={20}
                            />
                            <View className="min-w-0 flex-1">
                                <Text className="font-dafDisplay text-[16px] font-bold text-daf-text-primary dark:text-white">
                                    {driveGroup
                                        ? `What ${trailPoints.length} ${trailPoints.length === 1 ? 'read reveals' : 'reads reveal'}`
                                        : 'No trail to display'}
                                </Text>
                                <Text className="text-xs text-daf-text-secondary dark:text-neutral-300">
                                    Chronology reconstructed from public camera
                                    points and timestamps alone.
                                </Text>
                                {driveGroup ? (
                                    <Text className="font-dafMono mt-1 text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                                        {driveGroup.confirmedCount} confirmed ·{' '}
                                        {possibleCount} possible for this drive
                                    </Text>
                                ) : null}
                            </View>
                        </View>
                        <View className="h-[360px] bg-daf-surface-alt dark:bg-daf-surface-inverse">
                            {trailPoints.length > 0 ? (
                                <ScorecardExposureMap
                                    exposures={trailExposures}
                                    height={360}
                                    lineCollection={trailLineCollection}
                                    numbered
                                    testID="scorecard-trail-map"
                                />
                            ) : (
                                <View className="flex-1 items-center justify-center px-6">
                                    <Icon
                                        color={dafSemanticColors.speedOk}
                                        name="shield-check"
                                        size={32}
                                    />
                                    <Text className="mt-3 text-center text-base font-bold text-daf-text-primary dark:text-white">
                                        {driveGroup
                                            ? 'No confirmed reads to connect'
                                            : 'Drive no longer available'}
                                    </Text>
                                    <Text className="mt-1 text-center text-[13px] leading-[19px] text-daf-text-secondary dark:text-neutral-300">
                                        {driveGroup
                                            ? 'A trail is shown only from confirmed directional-cone crossings.'
                                            : 'Its exposure events may have expired or been deleted. Return to the timeline to choose another drive.'}
                                    </Text>
                                </View>
                            )}
                        </View>
                        <View className="dark:border-daf-border-dark border-t border-daf-border px-4 py-3">
                            <View className="flex-row items-center gap-2">
                                <View className="h-2.5 w-2.5 rounded-dafPill bg-daf-alert" />
                                <Text className="text-xs text-daf-text-secondary dark:text-neutral-300">
                                    A confirmed local cone crossing
                                </Text>
                                <View className="ml-2 w-7 border-t-2 border-dashed border-daf-alert" />
                                <Text className="text-xs text-daf-text-secondary dark:text-neutral-300">
                                    inferred order
                                </Text>
                            </View>
                            <Text className="mt-2 text-xs leading-[18px] text-daf-text-tertiary dark:text-neutral-400">
                                Route lines use the backend's fastest route
                                through captures from the same drive in time
                                order. Returned route geometry is not stored.
                            </Text>
                        </View>
                    </View>

                    {trailPoints.length > 0 ? (
                        <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark rounded-dafLg border border-daf-border bg-white px-4 py-1">
                            {trailPoints.map((point, index) => (
                                <View
                                    className={`flex-row items-center gap-3 py-3 ${
                                        index < trailPoints.length - 1
                                            ? 'dark:border-daf-border-dark border-b border-daf-border'
                                            : ''
                                    }`}
                                    key={point.event.id}
                                >
                                    <View className="h-6 w-6 items-center justify-center rounded-dafPill bg-daf-alert">
                                        <Text className="font-dafMono text-[11px] font-bold text-white">
                                            {point.index}
                                        </Text>
                                    </View>
                                    <View className="min-w-0 flex-1">
                                        <Text
                                            className="text-[13px] font-semibold text-daf-text-primary dark:text-white"
                                            numberOfLines={1}
                                        >
                                            {point.event.label}
                                        </Text>
                                        <Text className="font-dafMono text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                                            {formatTrailTime(
                                                point.event.occurredAt,
                                            )}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    ) : null}

                    {possibleCount > 0 ? (
                        <View className="border-daf-amber/35 bg-daf-amber/10 rounded-dafMd border px-3 py-2.5">
                            <Text className="text-xs leading-[18px] text-daf-text-secondary dark:text-neutral-300">
                                {possibleCount} unknown-direction camera
                                {possibleCount === 1
                                    ? ' event is'
                                    : ' events are'}{' '}
                                omitted because they are not confirmed reads.
                            </Text>
                        </View>
                    ) : null}
                    <ScorecardPrivacyFooter />
                </View>
            </ScrollView>
        </View>
    );
}
