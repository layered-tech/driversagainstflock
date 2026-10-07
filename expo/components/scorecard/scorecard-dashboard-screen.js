import { router, useIsFocused } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { TourOverlay } from '../tour-overlay';
import { TourTarget } from '../tour-target';
import { useUserTour } from '../user-tours';
import { useScorecard } from './scorecard-context';
import { getScorecardFuelCostSettings } from './scorecard-engine';
import { ScorecardFuelSettingsModal } from './scorecard-fuel-settings-modal';
import {
    ScorecardPrivacyFooter,
    ScorecardScreenHeader,
} from './scorecard-screen-header';
import { SCORECARD_TOUR } from './scorecard-tour';

const WEEK_BUCKET_COUNT = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function formatNumber(value, maximumFractionDigits = 1) {
    return Number(value ?? 0).toLocaleString(undefined, {
        maximumFractionDigits,
    });
}

function getBackupErrorMessage(error, fallback) {
    return typeof error?.message === 'string' && error.message.trim()
        ? error.message
        : fallback;
}

function getBackupSummaryMessage(backup) {
    const { completedDriveCount, exposureCount, xp } = backup.summary;

    return [
        `${formatNumber(completedDriveCount, 0)} completed ${completedDriveCount === 1 ? 'drive' : 'drives'}`,
        `${formatNumber(xp, 0)} XP`,
        `${formatNumber(exposureCount, 0)} retained exposure ${exposureCount === 1 ? 'event' : 'events'}`,
    ].join(' · ');
}

function getWeeklyCameraCrossings(exposures, now = Date.now()) {
    const buckets = Array.from({ length: WEEK_BUCKET_COUNT }, () => 0);
    const start = now - WEEK_BUCKET_COUNT * WEEK_MS;

    for (const exposure of exposures) {
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
            className="flex-1 items-center rounded-dafMd border border-daf-border bg-white px-2 py-3 active:opacity-70 dark:border-daf-border-dark dark:bg-daf-surface-dark"
            onPress={onPress}
        >
            <Text
                className={`font-dafMono text-[24px] font-bold ${colorClassName || 'text-daf-text-primary dark:text-white'}`}
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
            className={`w-[31.5%] items-center rounded-dafMd border border-daf-border bg-white px-2 py-3 dark:border-daf-border-dark dark:bg-daf-surface-dark ${
                badge.earned ? '' : 'opacity-55'
            }`}
            testID={`scorecard-badge-${badge.id}`}
        >
            <View
                className={`h-10 w-10 items-center justify-center rounded-dafPill border ${
                    badge.earned
                        ? 'bg-daf-brand/12 border-transparent dark:bg-daf-brand/15'
                        : 'border-daf-border bg-daf-surface-alt dark:border-daf-border-dark dark:bg-daf-surface-inverse'
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
    const tour = useUserTour('scorecard');
    const tourTargets = useRef({});
    const tourScrollRef = useRef(null);
    const tourContentRef = useRef(null);
    const screenIsFocused = useIsFocused();
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const theme = getDafTheme(colorScheme);
    const {
        backupFilesAreAvailable,
        badges,
        deleteHistory,
        exportBackup,
        isHydrated,
        level,
        pickBackupForImport,
        resetFuelCostSettings,
        restoreBackup,
        scorecardState,
        secureStorageIsAvailable,
        setFuelCostSettings,
        setTrackingEnabled,
        windowStats,
    } = useScorecard();
    const [backupActionIsPending, setBackupActionIsPending] = useState(false);
    const [fuelSettingsAreVisible, setFuelSettingsAreVisible] = useState(false);
    const weeklyCrossings = useMemo(
        () => getWeeklyCameraCrossings(scorecardState.exposures),
        [scorecardState.exposures],
    );
    const maximumWeeklyCrossings = Math.max(1, ...weeklyCrossings);
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
        windowStats.allDetourCostsPriced && windowStats.avoidedCameraCount > 0
            ? windowStats.extraFuelCost / windowStats.avoidedCameraCount
            : null;
    const bottomPadding = Math.max(insets.bottom + 28, 28);
    const backupActionsAreDisabled =
        backupActionIsPending ||
        !backupFilesAreAvailable ||
        !isHydrated ||
        !secureStorageIsAvailable ||
        Boolean(scorecardState.activeSession);
    useEffect(() => {
        if (
            screenIsFocused &&
            isHydrated &&
            tour.progress?.status === 'pending'
        ) {
            tour.start();
        }
    }, [screenIsFocused, isHydrated, tour.start, tour.progress?.status]);

    const handleExportBackup = async () => {
        setBackupActionIsPending(true);

        try {
            const wasExported = await exportBackup();

            if (wasExported) {
                Alert.alert(
                    'Scorecard backup exported',
                    'Keep the backup file somewhere you trust so it is available after reinstalling or changing devices.',
                );
            }
        } catch (error) {
            Alert.alert(
                'Could not export backup',
                getBackupErrorMessage(
                    error,
                    'The scorecard backup could not be exported.',
                ),
            );
        } finally {
            setBackupActionIsPending(false);
        }
    };

    const handleRestoreBackup = async (backup) => {
        setBackupActionIsPending(true);

        try {
            await restoreBackup(backup);
            Alert.alert(
                'Scorecard restored',
                'The imported scorecard is now stored in encrypted storage on this device.',
            );
        } catch (error) {
            Alert.alert(
                'Could not restore backup',
                getBackupErrorMessage(
                    error,
                    'The imported scorecard could not be saved.',
                ),
            );
        } finally {
            setBackupActionIsPending(false);
        }
    };

    const handleImportBackup = async () => {
        setBackupActionIsPending(true);

        try {
            const backup = await pickBackupForImport();

            if (!backup) {
                return;
            }

            const exportedAt = new Date(backup.exportedAt).toLocaleDateString();

            Alert.alert(
                'Replace scorecard with this backup?',
                `Backup from ${exportedAt}\n${getBackupSummaryMessage(backup)}\n\nImporting replaces the scorecard currently stored on this device.`,
                [
                    { style: 'cancel', text: 'Cancel' },
                    {
                        onPress: () => void handleRestoreBackup(backup),
                        style: 'destructive',
                        text: 'Import and replace',
                    },
                ],
            );
        } catch (error) {
            Alert.alert(
                'Could not import backup',
                getBackupErrorMessage(
                    error,
                    'Choose a valid Drivers Against Flock scorecard backup.',
                ),
            );
        } finally {
            setBackupActionIsPending(false);
        }
    };

    const handleConfirmedDeleteHistory = async () => {
        try {
            await deleteHistory();
        } catch {
            Alert.alert(
                'Could not delete scorecard history',
                'Your encrypted scorecard history is still on this device. Please try again.',
                [
                    { style: 'cancel', text: 'Cancel' },
                    {
                        onPress: () => void handleConfirmedDeleteHistory(),
                        text: 'Try again',
                    },
                ],
            );
        }
    };

    const handleDeleteHistory = () => {
        Alert.alert(
            'Delete encrypted scorecard history?',
            'This permanently removes trips, exposures, lifetime XP, and badges from this device.',
            [
                { style: 'cancel', text: 'Cancel' },
                {
                    onPress: () => void handleConfirmedDeleteHistory(),
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
                ref={tourScrollRef}
            >
                <View
                    className="gap-3.5 px-4 py-[18px]"
                    collapsable={false}
                    ref={tourContentRef}
                >
                    {!secureStorageIsAvailable ? (
                        <View className="rounded-dafLg border border-daf-border bg-white p-5 dark:border-daf-border-dark dark:bg-daf-surface-dark">
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

                    <View className="items-center rounded-dafLg border border-daf-border bg-white px-4 pb-[18px] pt-5 shadow-sm dark:border-daf-border-dark dark:bg-daf-surface-dark">
                        <TourTarget id="privacy-score" targets={tourTargets}>
                            <PrivacyScoreRing
                                score={
                                    isHydrated ? windowStats.privacyScore : null
                                }
                                theme={theme}
                            />
                        </TourTarget>
                        <TourTarget
                            className="w-full items-center"
                            id="level"
                            targets={tourTargets}
                        >
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
                        </TourTarget>
                    </View>

                    <View className="flex-row gap-2">
                        <TourTarget
                            className="flex-1"
                            id="avoided"
                            targets={tourTargets}
                        >
                            <StatTile
                                colorClassName="text-daf-text-brand dark:text-daf-brand"
                                label="avoided"
                                testID="scorecard-stat-avoided"
                                value={formatNumber(
                                    windowStats.avoidedCameraCount,
                                    0,
                                )}
                            />
                        </TourTarget>
                        <TourTarget
                            className="flex-1"
                            id="crossings"
                            targets={tourTargets}
                        >
                            <StatTile
                                colorClassName="text-daf-alert"
                                label="crossings"
                                onPress={() =>
                                    router.push('/scorecard/timeline')
                                }
                                testID="scorecard-stat-crossings"
                                value={formatNumber(
                                    windowStats.cameraCrossingCount,
                                    0,
                                )}
                            />
                        </TourTarget>
                        <TourTarget
                            className="flex-1"
                            id="streak"
                            targets={tourTargets}
                        >
                            <StatTile
                                label="drive streak"
                                testID="scorecard-stat-streak"
                                value={formatNumber(
                                    windowStats.cleanDriveStreak,
                                    0,
                                )}
                            />
                        </TourTarget>
                    </View>

                    <TourTarget
                        className="rounded-dafLg border border-daf-border bg-white px-[15px] py-3.5 dark:border-daf-border-dark dark:bg-daf-surface-dark"
                        id="weekly-crossings"
                        targets={tourTargets}
                    >
                        <View className="mb-3 flex-row items-baseline">
                            <Text className="text-[14.5px] font-bold text-daf-text-primary dark:text-white">
                                Camera crossings per week
                            </Text>
                            <Text className="ml-auto font-dafMono text-[11px] text-daf-text-tertiary dark:text-neutral-400">
                                30-day detail window
                            </Text>
                        </View>
                        <View className="h-[86px] flex-row items-end gap-2">
                            {weeklyCrossings.map((crossingCount, index) => (
                                <View
                                    className={`min-h-[5px] flex-1 rounded-t-[4px] ${
                                        index === weeklyCrossings.length - 1
                                            ? 'bg-daf-alert'
                                            : 'bg-daf-alert/25'
                                    }`}
                                    key={`week-${index}`}
                                    style={{
                                        height: `${Math.max(6, (crossingCount / maximumWeeklyCrossings) * 100)}%`,
                                    }}
                                />
                            ))}
                        </View>
                        <View className="mt-2 flex-row justify-between">
                            <Text className="font-dafMono text-[10.5px] text-daf-text-tertiary dark:text-neutral-400">
                                30 days ago
                            </Text>
                            <Text className="font-dafMono text-[10.5px] font-bold text-daf-alert">
                                This week · {weeklyCrossings.at(-1) ?? 0}
                            </Text>
                        </View>
                    </TourTarget>

                    <TourTarget id="privacy-costs" targets={tourTargets}>
                        <Pressable
                            accessibilityHint="Tap or long press to configure MPG and gas price"
                            accessibilityLabel="Edit privacy cost settings"
                            accessibilityRole="button"
                            className="rounded-dafLg border border-daf-border bg-white px-[15px] py-3.5 active:opacity-80 dark:border-daf-border-dark dark:bg-daf-surface-dark"
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
                                    className="h-8 w-8 shrink-0 items-center justify-center rounded-dafPill bg-daf-brand/10 dark:bg-daf-brand/15"
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
                                        {formatNumber(windowStats.extraMiles)}{' '}
                                        mi
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
                                        {formatNumber(
                                            windowStats.extraGallons,
                                            2,
                                        )}{' '}
                                        gal ·{' '}
                                        {windowStats.allDetourCostsPriced
                                            ? `$${formatNumber(windowStats.extraFuelCost, 2)}`
                                            : 'price unavailable'}
                                    </Text>
                                </View>
                                <View className="my-0.5 h-px bg-daf-border dark:bg-daf-border-dark" />
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
                    </TourTarget>

                    <TourTarget id="badges" targets={tourTargets}>
                        <View className="mb-2.5 flex-row items-baseline px-0.5">
                            <Text className="text-[14.5px] font-bold text-daf-text-primary dark:text-white">
                                Badges
                            </Text>
                            <Text
                                className="ml-auto font-dafMono text-[11px] text-daf-text-tertiary dark:text-neutral-400"
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
                    </TourTarget>

                    <TourTarget id="timeline" targets={tourTargets}>
                        <Pressable
                            accessibilityRole="button"
                            className="flex-row items-center gap-3 rounded-dafMd border border-daf-border bg-white px-3.5 py-3 active:opacity-70 dark:border-daf-border-dark dark:bg-daf-surface-dark"
                            onPress={() => router.push('/scorecard/timeline')}
                            testID="scorecard-open-timeline"
                        >
                            <View className="h-[34px] w-[34px] items-center justify-center rounded-dafSm bg-daf-alert/10">
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
                    </TourTarget>

                    <View className="rounded-dafLg border border-daf-border bg-white px-4 py-3.5 dark:border-daf-border-dark dark:bg-daf-surface-dark">
                        <TourTarget
                            className="flex-row items-center gap-3"
                            id="recording"
                            targets={tourTargets}
                        >
                            <View className="min-w-0 flex-1">
                                <Text className="text-[14px] font-semibold text-daf-text-primary dark:text-white">
                                    Record DAF drives
                                </Text>
                                <Text className="mt-0.5 text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                                    Exposure tracking runs during guided drives,
                                    phone-started Free Drive, and while Android
                                    Auto or CarPlay is connected and the vehicle
                                    is moving. Parked-only connections are not
                                    saved. Stored encrypted on this device.
                                </Text>
                            </View>
                            <Switch
                                accessibilityLabel="Record DAF drives"
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
                        </TourTarget>
                        {scorecardState.activeSession ? (
                            <View className="mt-3 flex-row items-center gap-2 rounded-dafSm bg-daf-brand/10 px-2.5 py-2">
                                <View className="h-2 w-2 rounded-dafPill bg-daf-brand" />
                                <Text className="text-xs font-semibold text-daf-text-brand dark:text-daf-brand">
                                    Recording this drive locally
                                </Text>
                            </View>
                        ) : null}
                        <TourTarget
                            className="mt-3 border-t border-daf-border pt-3 dark:border-daf-border-dark"
                            id="backup"
                            targets={tourTargets}
                        >
                            <Text className="text-[14px] font-semibold text-daf-text-primary dark:text-white">
                                Backup and restore
                            </Text>
                            <Text className="mt-0.5 text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                                Save a scorecard backup for reinstalling or
                                moving to another device. DAF never uploads the
                                file.
                            </Text>
                            <View className="mt-3 flex-row gap-2">
                                <Pressable
                                    accessibilityRole="button"
                                    className={`min-h-hitMin flex-1 flex-row items-center justify-center gap-2 rounded-dafPill border border-daf-brand/30 bg-daf-brand/10 active:opacity-70 ${
                                        backupActionsAreDisabled
                                            ? 'opacity-50'
                                            : ''
                                    }`}
                                    disabled={backupActionsAreDisabled}
                                    onPress={() => void handleExportBackup()}
                                    testID="scorecard-export-backup"
                                >
                                    <Icon
                                        color={dafSemanticColors.brand}
                                        name="download"
                                        size={16}
                                    />
                                    <Text className="text-[13px] font-semibold text-daf-text-brand dark:text-daf-brand">
                                        Export backup
                                    </Text>
                                </Pressable>
                                <Pressable
                                    accessibilityRole="button"
                                    className={`min-h-hitMin flex-1 flex-row items-center justify-center gap-2 rounded-dafPill border border-daf-border bg-daf-surface-alt active:opacity-70 dark:border-daf-border-dark dark:bg-daf-surface-inverse ${
                                        backupActionsAreDisabled
                                            ? 'opacity-50'
                                            : ''
                                    }`}
                                    disabled={backupActionsAreDisabled}
                                    onPress={() => void handleImportBackup()}
                                    testID="scorecard-import-backup"
                                >
                                    <Icon
                                        color={dafSemanticColors.speedOk}
                                        name="upload"
                                        size={16}
                                    />
                                    <Text className="text-[13px] font-semibold text-daf-text-secondary dark:text-neutral-300">
                                        Import backup
                                    </Text>
                                </Pressable>
                            </View>
                            <Text className="mt-2 text-[11px] leading-4 text-daf-amber">
                                Backup files are not encrypted after export.
                                Store them somewhere you trust.
                            </Text>
                            {scorecardState.activeSession ? (
                                <Text className="mt-1 text-[11px] leading-4 text-daf-text-tertiary dark:text-neutral-400">
                                    Finish the active drive before backing up or
                                    restoring.
                                </Text>
                            ) : !backupFilesAreAvailable ? (
                                <Text className="mt-1 text-[11px] leading-4 text-daf-text-tertiary dark:text-neutral-400">
                                    Backup tools require a current native app
                                    build.
                                </Text>
                            ) : null}
                        </TourTarget>
                        <TourTarget id="delete-history" targets={tourTargets}>
                            <Pressable
                                accessibilityRole="button"
                                className="mt-3 min-h-hitMin flex-row items-center justify-center gap-2 rounded-dafPill border border-daf-alert/30 bg-daf-alert/10 active:opacity-70"
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
                        </TourTarget>
                    </View>

                    <TourTarget id="data-handling" targets={tourTargets}>
                        <ScorecardPrivacyFooter />
                    </TourTarget>
                </View>
            </ScrollView>
            <TourOverlay
                contentRef={tourContentRef}
                enabled={
                    screenIsFocused && isHydrated && !fuelSettingsAreVisible
                }
                insets={insets}
                label={SCORECARD_TOUR.label}
                prefix="scorecard-tour"
                restoreScrollOnFinish
                scrollRef={tourScrollRef}
                steps={SCORECARD_TOUR.steps}
                targets={tourTargets}
                tour={tour}
            />
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
