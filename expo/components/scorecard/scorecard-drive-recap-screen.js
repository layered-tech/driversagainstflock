import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { DuoText as Text } from '../design-system/duo-typography';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import {
    getScorecardPrivacyScore,
    getScorecardWindowStats,
} from './scorecard-engine';
import { useScorecard } from './scorecard-context';
import {
    ScorecardPrivacyFooter,
    ScorecardScreenHeader,
} from './scorecard-screen-header';

function Metric({
    label,
    value,
    tone = 'text-daf-text-primary dark:text-white',
}) {
    return (
        <View className="min-w-[45%] flex-1 gap-1 rounded-dafMd bg-daf-surface-alt px-3 py-3 dark:bg-daf-surface-inverse">
            <Text className={`font-dafMono text-2xl font-bold ${tone}`}>
                {value}
            </Text>
            <Text className="text-xs text-daf-text-secondary dark:text-neutral-300">
                {label}
            </Text>
        </View>
    );
}

export default function ScorecardDriveRecapScreen() {
    const { driveId } = useLocalSearchParams();
    const { scorecardState } = useScorecard();
    const insets = useSafeAreaInsets();
    const trip = scorecardState.trips.find(
        (item) => String(item.id) === String(driveId),
    );
    const stats = trip
        ? getScorecardWindowStats(
              {
                  ...scorecardState,
                  trips: scorecardState.trips.filter(
                      (item) => item.endedAt <= trip.endedAt,
                  ),
              },
              trip.endedAt,
          )
        : null;
    const crossings = trip
        ? trip.confirmedReadCount + trip.possibleReadCount
        : 0;
    const previousScore =
        trip && stats
            ? getScorecardPrivacyScore(
                  Math.max(
                      0,
                      stats.avoidedCameraCount - trip.avoidedCameraCount,
                  ),
                  Math.max(0, stats.cameraCrossingCount - crossings),
              )
            : null;
    const scoreDelta =
        stats?.privacyScore !== null && previousScore !== null
            ? stats.privacyScore - previousScore
            : null;
    const duration = trip
        ? `${Math.floor(trip.durationSeconds / 60)}:${String(Math.round(trip.durationSeconds % 60)).padStart(2, '0')}`
        : '—';
    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="scorecard-drive-recap"
        >
            <ScorecardScreenHeader
                back
                backRoute="timeline"
                title="Drive recap"
                subtitle={
                    trip
                        ? new Date(trip.endedAt).toLocaleString()
                        : 'Local Scorecard history'
                }
            />
            <ScrollView
                contentContainerStyle={{
                    paddingBottom: Math.max(insets.bottom + 24, 24),
                }}
            >
                <View className="gap-4 px-4 py-5">
                    {!trip ? (
                        <Text className="text-base text-daf-text-secondary dark:text-neutral-300">
                            This drive is no longer available on your phone.
                        </Text>
                    ) : (
                        <>
                            <View className="gap-1 rounded-dafLg border border-daf-border bg-white px-4 py-5 dark:border-daf-border-dark dark:bg-daf-surface-dark">
                                <Text className="text-xs font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                                    {trip.completion === 'cancelled'
                                        ? 'Route canceled'
                                        : 'Drive complete'}
                                </Text>
                                <Text
                                    className="font-dafMono text-[32px] font-bold text-daf-text-brand dark:text-daf-brand"
                                    testID="drive-recap-privacy-score"
                                >
                                    {scoreDelta === null
                                        ? '—'
                                        : `${scoreDelta >= 0 ? '+' : ''}${scoreDelta}`}{' '}
                                    → {stats?.privacyScore ?? '—'}
                                </Text>
                                <Text className="text-sm text-daf-text-secondary dark:text-neutral-300">
                                    Privacy score
                                </Text>
                            </View>
                            <View className="flex-row flex-wrap gap-2">
                                <Metric label="Duration" value={duration} />
                                <Metric
                                    label="Distance"
                                    value={`${trip.distanceMiles.toFixed(1)} mi`}
                                />
                                <Metric
                                    label="Avoided cameras"
                                    value={String(trip.avoidedCameraCount)}
                                    tone="text-daf-text-brand dark:text-daf-brand"
                                />
                                <Metric
                                    label="Camera crossings"
                                    value={String(crossings)}
                                    tone={
                                        crossings
                                            ? 'text-daf-alert'
                                            : 'text-daf-text-primary dark:text-white'
                                    }
                                />
                                <Metric
                                    label="Earned XP"
                                    value={`+${trip.xpEarned}`}
                                    tone="text-daf-text-brand dark:text-daf-brand"
                                />
                            </View>
                            <Text className="text-xs text-daf-text-tertiary dark:text-neutral-400">
                                {trip.confirmedReadCount} confirmed ·{' '}
                                {trip.possibleReadCount} possible crossing
                                {crossings === 1 ? '' : 's'}
                            </Text>
                        </>
                    )}
                    <ScorecardPrivacyFooter />
                </View>
            </ScrollView>
        </View>
    );
}
