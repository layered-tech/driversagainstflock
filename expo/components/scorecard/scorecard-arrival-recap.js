import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { DafButton } from '../design-system/primitives';
import { dafSemanticColors } from '../design-system/tokens';
import { useScorecard } from './scorecard-context';
import {
    getScorecardPrivacyScore,
    SCORECARD_FIXED_MPG,
} from './scorecard-engine';

function formatDuration(durationSeconds) {
    const minutes = Math.max(0, Math.round(durationSeconds / 60));

    if (minutes < 60) {
        return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    return `${hours} hr${remainder ? ` ${remainder} min` : ''}`;
}

function formatNumber(value, maximumFractionDigits = 1) {
    return Number(value ?? 0).toLocaleString(undefined, {
        maximumFractionDigits,
    });
}

function RecapStat({ label, testID, tone = 'default', value }) {
    return (
        <View className="flex-1 items-center rounded-dafMd bg-daf-surface-alt px-2 py-2.5 dark:bg-daf-surface-inverse">
            <Text
                className={`font-dafMono text-[21px] font-bold ${
                    tone === 'brand'
                        ? 'text-daf-text-brand dark:text-daf-brand'
                        : tone === 'alert'
                          ? 'text-daf-alert'
                          : 'text-daf-text-primary dark:text-white'
                }`}
                numberOfLines={1}
                testID={testID}
            >
                {value}
            </Text>
            <Text className="text-[11.5px] font-semibold text-daf-text-secondary dark:text-neutral-300">
                {label}
            </Text>
        </View>
    );
}

export function ScorecardArrivalRecap() {
    const insets = useSafeAreaInsets();
    const { dismissRecap, level, pendingRecap, windowStats } = useScorecard();

    if (!pendingRecap) {
        return null;
    }

    const trip = pendingRecap;
    const currentScore = windowStats.privacyScore;
    const scoreBeforeTrip = windowStats.exposureCoverageComplete
        ? getScorecardPrivacyScore(
              Math.max(
                  0,
                  windowStats.avoidedCameraCount - trip.avoidedCameraCount,
              ),
              Math.max(
                  0,
                  windowStats.confirmedReadCount - trip.confirmedReadCount,
              ),
          )
        : null;
    const scoreDelta =
        currentScore !== null && scoreBeforeTrip !== null
            ? currentScore - scoreBeforeTrip
            : null;
    const cleanDrive =
        trip.exposureCoverageComplete && trip.confirmedReadCount === 0;
    const title = !trip.exposureCoverageComplete
        ? 'Arrived · monitoring incomplete'
        : cleanDrive
          ? 'Arrived, unseen'
          : `Arrived · ${trip.confirmedReadCount} ${trip.confirmedReadCount === 1 ? 'read' : 'reads'}`;
    const handleTimelinePress = () => {
        dismissRecap();
        router.push('/scorecard/timeline');
    };

    return (
        <View
            className="absolute inset-0 justify-end"
            pointerEvents="box-none"
            style={{ zIndex: 120 }}
            testID="scorecard-arrival-recap"
        >
            <Pressable
                accessibilityLabel="Arrival recap backdrop"
                className="absolute inset-0 bg-black/25"
            />
            <View
                className="dark:border-daf-border-dark dark:bg-daf-surface-dark rounded-t-dafSheet border-t border-daf-border bg-white px-4 pt-4 shadow-2xl"
                style={{ paddingBottom: Math.max(insets.bottom + 12, 24) }}
            >
                <View className="dark:bg-daf-border-dark mx-auto mb-3 h-1 w-10 rounded-dafPill bg-daf-border-strong" />
                <Text
                    className="font-dafDisplay text-xl font-bold text-daf-text-primary dark:text-white"
                    testID="scorecard-arrival-recap-title"
                >
                    {title}
                </Text>
                <Text
                    className="font-dafMono mt-1 text-xs text-daf-text-tertiary dark:text-neutral-400"
                    testID="scorecard-arrival-recap-trip-summary"
                >
                    {formatDuration(trip.durationSeconds)} ·{' '}
                    {formatNumber(trip.distanceMiles)} mi · explicit guided
                    drive
                </Text>

                <View
                    className={`mt-3 flex-row items-center gap-3 rounded-dafMd px-3.5 py-3 ${
                        cleanDrive
                            ? 'bg-daf-brand/12'
                            : 'bg-daf-surface-alt dark:bg-daf-surface-inverse'
                    }`}
                >
                    <Text className="font-dafMono text-[25px] font-bold text-daf-text-brand dark:text-daf-brand">
                        {scoreDelta === null
                            ? '—'
                            : `${scoreDelta >= 0 ? '+' : ''}${scoreDelta}`}
                    </Text>
                    <View className="min-w-0 flex-1">
                        <Text
                            className="text-sm font-bold text-daf-text-primary dark:text-white"
                            testID="scorecard-arrival-recap-score"
                        >
                            {currentScore === null
                                ? 'Privacy score withheld'
                                : `Privacy score → ${currentScore}`}
                        </Text>
                        <Text
                            className="text-xs text-daf-text-secondary dark:text-neutral-300"
                            testID="scorecard-arrival-recap-coverage"
                        >
                            {cleanDrive
                                ? `Clean drive · streak is now ${windowStats.drivingDayStreak}`
                                : trip.exposureCoverageComplete
                                  ? 'Confirmed cone crossings reduce score'
                                  : 'The ALPR result limit was hit or coverage was unavailable'}
                        </Text>
                    </View>
                    <Icon
                        color={
                            cleanDrive
                                ? dafSemanticColors.brand
                                : dafSemanticColors.warning
                        }
                        name={cleanDrive ? 'shield-check' : 'triangle-alert'}
                        size={21}
                    />
                </View>

                <View className="mt-3 flex-row gap-2">
                    <RecapStat
                        label="avoided"
                        testID="scorecard-arrival-recap-avoided"
                        tone="brand"
                        value={trip.avoidedCameraCount}
                    />
                    <RecapStat
                        label="reads"
                        testID="scorecard-arrival-recap-reads"
                        tone={trip.confirmedReadCount > 0 ? 'alert' : 'default'}
                        value={trip.confirmedReadCount}
                    />
                    <RecapStat
                        label="for privacy"
                        testID="scorecard-arrival-recap-extra-time"
                        value={`+${Math.round(trip.extraDurationSeconds / 60)} min`}
                    />
                </View>

                <View className="mt-3 flex-row items-center gap-2 rounded-dafMd bg-daf-surface-alt px-3 py-2.5 dark:bg-daf-surface-inverse">
                    <Icon
                        color={dafSemanticColors.speedOk}
                        name="fuel"
                        size={16}
                    />
                    <Text className="min-w-0 flex-1 text-xs font-semibold text-daf-text-secondary dark:text-neutral-300">
                        Detour fuel · {SCORECARD_FIXED_MPG} mpg
                    </Text>
                    <Text
                        className="font-dafMono text-xs font-semibold text-daf-text-primary dark:text-white"
                        testID="scorecard-arrival-recap-fuel-cost"
                    >
                        +{formatNumber(trip.extraMiles)} mi ·{' '}
                        {Number.isFinite(trip.extraFuelCost)
                            ? `≈$${formatNumber(trip.extraFuelCost, 2)}`
                            : trip.extraMiles > 0
                              ? 'price unavailable'
                              : '$0.00'}
                    </Text>
                </View>

                <View className="mt-3">
                    <View className="mb-1.5 flex-row justify-between">
                        <Text
                            className="text-xs font-semibold text-daf-text-secondary dark:text-neutral-300"
                            testID="scorecard-arrival-recap-xp"
                        >
                            +{trip.xpEarned} XP
                        </Text>
                        <Text
                            className="font-dafMono text-xs text-daf-text-tertiary dark:text-neutral-400"
                            testID="scorecard-arrival-recap-level-next"
                        >
                            {level.nextLevel
                                ? `${level.xpToNext} to ${level.nextLevel.name}`
                                : 'Maximum level'}
                        </Text>
                    </View>
                    <View className="h-1.5 overflow-hidden rounded-dafPill bg-daf-surface-alt dark:bg-daf-surface-inverse">
                        <View
                            className="h-full rounded-dafPill bg-daf-brand"
                            style={{
                                width: `${Math.round(level.progress * 100)}%`,
                            }}
                        />
                    </View>
                </View>

                <DafButton
                    className="mt-4"
                    onPress={dismissRecap}
                    size="lg"
                    testID="scorecard-arrival-recap-done"
                >
                    Done
                </DafButton>
                <DafButton
                    className="mt-2"
                    onPress={handleTimelinePress}
                    testID="scorecard-arrival-recap-timeline"
                    variant="ghost"
                >
                    View exposure timeline
                </DafButton>
            </View>
        </View>
    );
}
