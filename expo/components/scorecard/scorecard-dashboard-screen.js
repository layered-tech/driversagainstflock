import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
    Alert,
    Pressable,
    ScrollView,
    Switch,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { dafSemanticColors, getDafTheme } from '../design-system/tokens';
import { useScorecard } from './scorecard-context';
import { getScorecardFuelCostSettings } from './scorecard-engine';
import { ScorecardFuelSettingsModal } from './scorecard-fuel-settings-modal';
import {
    ScorecardPrivacyFooter,
    ScorecardScreenHeader,
} from './scorecard-screen-header';

const WEEK_BUCKET_COUNT = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function formatNumber(value, maximumFractionDigits = 1) {
    return Number(value ?? 0).toLocaleString(undefined, {
        maximumFractionDigits,
    });
}

function getWeeklyConfirmedReads(exposures, now = Date.now()) {
    const buckets = Array.from({ length: WEEK_BUCKET_COUNT }, () => 0);
    const start = now - WEEK_BUCKET_COUNT * WEEK_MS;

    for (const exposure of exposures) {
        if (exposure.certainty !== 'confirmed') {
            continue;
        }

        const index = Math.floor((exposure.occurredAt - start) / WEEK_MS);

        if (index >= 0 && index < buckets.length) {
            buckets[index] += 1;
        }
    }

    return buckets;
}

function PrivacyScoreRing({ score, theme }) {
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const resolvedScore = Number.isFinite(score) ? score : 0;

    return (
        <View className="h-[148px] w-[148px] items-center justify-center">
            <Svg
                height={148}
                style={{
                    position: 'absolute',
                    transform: [{ rotate: '-90deg' }],
                }}
                viewBox="0 0 120 120"
                width={148}
            >
                <Circle
                    cx="60"
                    cy="60"
                    fill="none"
                    r={radius}
                    stroke={theme.surface.cardAlt}
                    strokeWidth="11"
                />
                <Circle
                    cx="60"
                    cy="60"
                    fill="none"
                    r={radius}
                    stroke={theme.text.brand}
                    strokeDasharray={`${(circumference * resolvedScore) / 100} ${circumference}`}
                    strokeLinecap="round"
                    strokeWidth="11"
                />
            </Svg>
            <Text
                className="font-dafMono text-[44px] font-bold leading-[46px] text-daf-text-primary dark:text-white"
                testID="scorecard-privacy-score"
            >
                {Number.isFinite(score) ? score : '—'}
            </Text>
            <Text className="text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                Privacy score
            </Text>
        </View>
    );
}

function StatTile({ colorClassName = '', label, onPress, testID, value }) {
    const Container = onPress ? Pressable : View;

    return (
        <Container
            accessibilityRole={onPress ? 'button' : undefined}
            className="dark:border-daf-border-dark dark:bg-daf-surface-dark flex-1 items-center rounded-dafMd border border-daf-border bg-white px-2 py-3 active:opacity-70"
            onPress={onPress}
        >
            <Text
                className={`font-dafMono text-2xl font-bold ${colorClassName || 'text-daf-text-primary dark:text-white'}`}
                testID={testID}
            >
                {value}
            </Text>
            <Text className="mt-0.5 text-[11.5px] font-semibold text-daf-text-secondary dark:text-neutral-300">
                {label}
            </Text>
        </Container>
    );
}

function BadgeCard({ badge }) {
    return (
        <View
            accessibilityLabel={`${badge.name} badge, ${badge.earned ? 'earned' : 'locked'}`}
            accessible
            className={`dark:border-daf-border-dark dark:bg-daf-surface-dark w-[31.5%] items-center rounded-dafMd border border-daf-border bg-white px-2 py-3 ${
                badge.earned ? '' : 'opacity-55'
            }`}
            testID={`scorecard-badge-${badge.id}`}
        >
            <View
                className={`h-10 w-10 items-center justify-center rounded-dafPill border ${
                    badge.earned
                        ? 'bg-daf-brand/12 dark:bg-daf-brand/15 border-transparent'
                        : 'dark:border-daf-border-dark border-daf-border bg-daf-surface-alt dark:bg-daf-surface-inverse'
                }`}
            >
                <Icon
                    color={
                        badge.earned
                            ? dafSemanticColors.brand
                            : dafSemanticColors.speedOk
                    }
                    name={badge.icon}
                    size={21}
                />
            </View>
            <Text className="mt-2 text-center text-[12.5px] font-bold leading-4 text-daf-text-primary dark:text-white">
                {badge.name}
            </Text>
            <Text className="mt-1 text-center text-[10.5px] leading-[14px] text-daf-text-tertiary dark:text-neutral-400">
                {badge.caption}
            </Text>
        </View>
    );
}

export default function ScorecardDashboardScreen() {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const theme = getDafTheme(colorScheme);
    const {
        badges,
        deleteHistory,
        isHydrated,
        level,
        resetFuelCostSettings,
        scorecardState,
        secureStorageIsAvailable,
        setFuelCostSettings,
        setTrackingEnabled,
        windowStats,
    } = useScorecard();
    const [fuelSettingsAreVisible, setFuelSettingsAreVisible] = useState(false);
    const weeklyReads = useMemo(
        () => getWeeklyConfirmedReads(scorecardState.exposures),
        [scorecardState.exposures],
    );
    const maximumWeeklyReads = Math.max(1, ...weeklyReads);
    const earnedBadgeCount = badges.filter((badge) => badge.earned).length;
    const exposureCount = scorecardState.exposures.length;
    const fuelCostSettings = getScorecardFuelCostSettings(
        scorecardState.settings,
    );
    const usesCustomFuelCosts = fuelCostSettings.gasPricePerGallon !== null;
    const suggestedGasPricePerGallon =
        scorecardState.activeSession?.gasPrice ??
        [...scorecardState.trips]
            .reverse()
            .find((trip) => Number.isFinite(trip.gasPrice))?.gasPrice ??
        null;
    const costPerAvoidedCamera =
        windowStats.priceCoverageComplete && windowStats.avoidedCameraCount > 0
            ? windowStats.extraFuelCost / windowStats.avoidedCameraCount
            : null;
    const bottomPadding = Math.max(insets.bottom + 28, 28);

    const handleDeleteHistory = () => {
        Alert.alert(
            'Delete encrypted scorecard history?',
            'This permanently removes trips, exposures, lifetime XP, and badges from this device.',
            [
                { style: 'cancel', text: 'Cancel' },
                {
                    onPress: () => void deleteHistory(),
                    style: 'destructive',
                    text: 'Delete',
                },
            ],
        );
    };

    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="scorecard-dashboard"
        >
            <ScorecardScreenHeader subtitle="Last 30 days" title="Scorecard" />
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: bottomPadding }}
            >
                <View className="gap-3.5 px-4 py-[18px]">
                    {!secureStorageIsAvailable ? (
                        <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark rounded-dafLg border border-daf-border bg-white p-5">
                            <Text className="text-center text-base font-bold text-daf-text-primary dark:text-white">
                                Secure storage required
                            </Text>
                            <Text className="mt-2 text-center text-[13px] leading-[19px] text-daf-text-secondary dark:text-neutral-300">
                                Scorecard recording is available only in the
                                native iOS and Android app. No web fallback is
                                used because it would not meet the encryption
                                requirement.
                            </Text>
                        </View>
                    ) : null}

                    <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark items-center rounded-dafLg border border-daf-border bg-white px-4 pb-[18px] pt-5 shadow-sm">
                        <PrivacyScoreRing
                            score={isHydrated ? windowStats.privacyScore : null}
                            theme={theme}
                        />
                        {!windowStats.exposureCoverageComplete &&
                        windowStats.trips.length > 0 ? (
                            <Text
                                className="mt-1 text-center text-xs text-daf-amber"
                                testID="scorecard-coverage-incomplete"
                            >
                                Score withheld because camera coverage was
                                incomplete for at least one drive.
                            </Text>
                        ) : null}
                        <View className="mt-3.5 flex-row items-center gap-2">
                            <Icon
                                color={theme.text.brand}
                                name="ghost"
                                size={18}
                            />
                            <Text
                                className="font-dafDisplay text-base font-bold text-daf-text-primary dark:text-white"
                                testID="scorecard-level"
                            >
                                Level {level.level} · {level.name}
                            </Text>
                        </View>
                        <View className="mt-3 w-full">
                            <View className="mb-1.5 flex-row justify-between">
                                <Text
                                    className="text-xs font-semibold text-daf-text-secondary dark:text-neutral-300"
                                    testID="scorecard-level-xp"
                                >
                                    {formatNumber(level.xp, 0)} XP
                                </Text>
                                <Text
                                    className="font-dafMono text-xs text-daf-text-tertiary dark:text-neutral-400"
                                    testID="scorecard-level-next"
                                >
                                    {level.nextLevel
                                        ? `${formatNumber(level.xpToNext, 0)} to ${level.nextLevel.name}`
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
                    </View>

                    <View className="flex-row gap-2">
                        <StatTile
                            colorClassName="text-daf-text-brand dark:text-daf-brand"
                            label="avoided"
                            testID="scorecard-stat-avoided"
                            value={formatNumber(
                                windowStats.avoidedCameraCount,
                                0,
                            )}
                        />
                        <StatTile
                            colorClassName="text-daf-alert"
                            label="reads"
                            onPress={() => router.push('/scorecard/timeline')}
                            testID="scorecard-stat-confirmed"
                            value={formatNumber(
                                windowStats.confirmedReadCount,
                                0,
                            )}
                        />
                        <StatTile
                            label="drive streak"
                            testID="scorecard-stat-streak"
                            value={formatNumber(
                                windowStats.cleanDriveStreak,
                                0,
                            )}
                        />
                    </View>

                    {windowStats.possibleReadCount > 0 ? (
                        <View className="border-daf-amber/35 bg-daf-amber/10 flex-row items-start gap-2 rounded-dafMd border px-3 py-2.5">
                            <Icon
                                color={dafSemanticColors.warning}
                                name="triangle-alert"
                                size={15}
                            />
                            <Text className="min-w-0 flex-1 text-xs leading-[18px] text-daf-text-secondary dark:text-neutral-300">
                                {windowStats.possibleReadCount}{' '}
                                unknown-direction camera
                                {windowStats.possibleReadCount === 1
                                    ? ' crossing is'
                                    : ' crossings are'}{' '}
                                shown in the timeline but excluded from score.
                            </Text>
                        </View>
                    ) : null}

                    <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark rounded-dafLg border border-daf-border bg-white px-[15px] py-3.5">
                        <View className="mb-3 flex-row items-baseline">
                            <Text className="text-[14.5px] font-bold text-daf-text-primary dark:text-white">
                                Confirmed reads per week
                            </Text>
                            <Text className="font-dafMono ml-auto text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                                30-day detail window
                            </Text>
                        </View>
                        <View className="h-[86px] flex-row items-end gap-2">
                            {weeklyReads.map((readCount, index) => (
                                <View
                                    className={`min-h-[5px] flex-1 rounded-t-[4px] ${
                                        index === weeklyReads.length - 1
                                            ? 'bg-daf-alert'
                                            : 'bg-daf-alert/25'
                                    }`}
                                    key={`week-${index}`}
                                    style={{
                                        height: `${Math.max(6, (readCount / maximumWeeklyReads) * 100)}%`,
                                    }}
                                />
                            ))}
                        </View>
                        <View className="mt-2 flex-row justify-between">
                            <Text className="font-dafMono text-[10.5px] text-daf-text-tertiary dark:text-neutral-400">
                                30 days ago
                            </Text>
                            <Text className="font-dafMono text-[10.5px] font-bold text-daf-alert">
                                This week · {weeklyReads.at(-1) ?? 0}
                            </Text>
                        </View>
                    </View>

                    <Pressable
                        accessibilityHint="Tap or long press to configure MPG and gas price"
                        accessibilityLabel="Edit privacy cost settings"
                        accessibilityRole="button"
                        className="dark:border-daf-border-dark dark:bg-daf-surface-dark rounded-dafLg border border-daf-border bg-white px-[15px] py-3.5 active:opacity-80"
                        delayLongPress={450}
                        onLongPress={() => setFuelSettingsAreVisible(true)}
                        onPress={() => setFuelSettingsAreVisible(true)}
                        testID="scorecard-privacy-costs"
                    >
                        <View className="mb-2.5 flex-row items-center gap-2">
                            <Icon
                                color={dafSemanticColors.speedOk}
                                name="fuel"
                                size={17}
                            />
                            <View className="min-w-0 flex-1 gap-0.5">
                                <Text className="text-[14.5px] font-bold text-daf-text-primary dark:text-white">
                                    What privacy costs you
                                </Text>
                                <Text className="font-dafMono text-[10.5px] text-daf-text-tertiary dark:text-neutral-400">
                                    {formatNumber(
                                        fuelCostSettings.fuelEconomyMpg,
                                        1,
                                    )}{' '}
                                    mpg ·{' '}
                                    {usesCustomFuelCosts
                                        ? `$${formatNumber(fuelCostSettings.gasPricePerGallon, 2)}/gal custom`
                                        : 'AAA state rates'}
                                </Text>
                            </View>
                            <View
                                className="bg-daf-brand/10 dark:bg-daf-brand/15 h-8 w-8 shrink-0 items-center justify-center rounded-dafPill"
                                testID="scorecard-privacy-costs-edit-handle"
                            >
                                <Icon
                                    color={dafSemanticColors.brand}
                                    name="pencil"
                                    size={14}
                                />
                            </View>
                        </View>
                        <View className="gap-2">
                            <View className="flex-row">
                                <Text className="flex-1 text-[13px] text-daf-text-secondary dark:text-neutral-300">
                                    Extra miles
                                </Text>
                                <Text
                                    className="font-dafMono text-[13px] font-semibold text-daf-text-primary dark:text-white"
                                    testID="scorecard-extra-miles"
                                >
                                    {formatNumber(windowStats.extraMiles)} mi
                                </Text>
                            </View>
                            <View className="flex-row">
                                <Text className="flex-1 text-[13px] text-daf-text-secondary dark:text-neutral-300">
                                    Extra fuel
                                </Text>
                                <Text
                                    className="font-dafMono text-[13px] font-semibold text-daf-text-primary dark:text-white"
                                    testID="scorecard-fuel-cost"
                                >
                                    {formatNumber(windowStats.extraGallons, 2)}{' '}
                                    gal ·{' '}
                                    {windowStats.priceCoverageComplete
                                        ? `$${formatNumber(windowStats.extraFuelCost, 2)}`
                                        : 'price unavailable'}
                                </Text>
                            </View>
                            <View className="dark:bg-daf-border-dark my-0.5 h-px bg-daf-border" />
                            <View className="flex-row">
                                <Text className="flex-1 text-[13px] font-semibold text-daf-text-primary dark:text-white">
                                    Per camera avoided
                                </Text>
                                <Text
                                    className="font-dafMono text-[13px] font-bold text-daf-text-brand dark:text-daf-brand"
                                    testID="scorecard-cost-per-avoided"
                                >
                                    {costPerAvoidedCamera === null
                                        ? '—'
                                        : `$${formatNumber(costPerAvoidedCamera, 2)}`}
                                </Text>
                            </View>
                        </View>
                    </Pressable>

                    <View>
                        <View className="mb-2.5 flex-row items-baseline px-0.5">
                            <Text className="text-[14.5px] font-bold text-daf-text-primary dark:text-white">
                                Badges
                            </Text>
                            <Text
                                className="font-dafMono ml-auto text-[11px] text-daf-text-tertiary dark:text-neutral-400"
                                testID="scorecard-badge-count"
                            >
                                {earnedBadgeCount} of {badges.length}
                            </Text>
                        </View>
                        <View className="flex-row flex-wrap justify-between gap-y-2.5">
                            {badges.map((badge) => (
                                <BadgeCard badge={badge} key={badge.id} />
                            ))}
                        </View>
                    </View>

                    <Pressable
                        accessibilityRole="button"
                        className="dark:border-daf-border-dark dark:bg-daf-surface-dark flex-row items-center gap-3 rounded-dafMd border border-daf-border bg-white px-3.5 py-3 active:opacity-70"
                        onPress={() => router.push('/scorecard/timeline')}
                        testID="scorecard-open-timeline"
                    >
                        <View className="bg-daf-alert/10 h-[34px] w-[34px] items-center justify-center rounded-dafSm">
                            <Icon
                                color={dafSemanticColors.danger}
                                name="calendar"
                                size={18}
                            />
                        </View>
                        <View className="min-w-0 flex-1">
                            <Text className="text-[14.5px] font-semibold text-daf-text-primary dark:text-white">
                                Exposure timeline
                            </Text>
                            <Text className="text-xs text-daf-text-tertiary dark:text-neutral-400">
                                {exposureCount === 0
                                    ? 'No local exposure events'
                                    : `${exposureCount} local ${exposureCount === 1 ? 'event' : 'events'}, newest first`}
                            </Text>
                        </View>
                        <Icon
                            color={dafSemanticColors.speedOk}
                            name="chevron-right"
                            size={16}
                        />
                    </Pressable>

                    <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark rounded-dafLg border border-daf-border bg-white px-4 py-3.5">
                        <View className="flex-row items-center gap-3">
                            <View className="min-w-0 flex-1">
                                <Text className="text-[14px] font-semibold text-daf-text-primary dark:text-white">
                                    Record explicit DAF drives
                                </Text>
                                <Text className="mt-0.5 text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                                    Guided and user-started free drives only.
                                    Stored encrypted on this device.
                                </Text>
                            </View>
                            <Switch
                                accessibilityLabel="Record explicit DAF drives"
                                disabled={!secureStorageIsAvailable}
                                onValueChange={setTrackingEnabled}
                                trackColor={{
                                    false: theme.border.strong,
                                    true: dafSemanticColors.brand,
                                }}
                                value={
                                    secureStorageIsAvailable &&
                                    scorecardState.settings.enabled
                                }
                                testID="scorecard-tracking-toggle"
                            />
                        </View>
                        {scorecardState.activeSession ? (
                            <View className="bg-daf-brand/10 mt-3 flex-row items-center gap-2 rounded-dafSm px-2.5 py-2">
                                <View className="h-2 w-2 rounded-dafPill bg-daf-brand" />
                                <Text className="text-xs font-semibold text-daf-text-brand dark:text-daf-brand">
                                    Recording this drive locally
                                </Text>
                            </View>
                        ) : null}
                        <Pressable
                            accessibilityRole="button"
                            className="min-h-hitMin border-daf-alert/30 bg-daf-alert/10 mt-3 flex-row items-center justify-center gap-2 rounded-dafPill border active:opacity-70"
                            onPress={handleDeleteHistory}
                            testID="scorecard-delete-history"
                        >
                            <Icon
                                color={dafSemanticColors.danger}
                                name="trash"
                                size={16}
                            />
                            <Text className="text-[13px] font-semibold text-daf-alert">
                                Delete encrypted scorecard history
                            </Text>
                        </Pressable>
                    </View>

                    <ScorecardPrivacyFooter />
                </View>
            </ScrollView>
            <ScorecardFuelSettingsModal
                fuelEconomyMpg={fuelCostSettings.fuelEconomyMpg}
                gasPricePerGallon={fuelCostSettings.gasPricePerGallon}
                onDismiss={() => setFuelSettingsAreVisible(false)}
                onReset={resetFuelCostSettings}
                onSave={setFuelCostSettings}
                suggestedGasPricePerGallon={suggestedGasPricePerGallon}
                visible={fuelSettingsAreVisible}
            />
        </View>
    );
}
