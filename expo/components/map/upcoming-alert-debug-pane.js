import { useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import {
    formatUpcomingAlertDebugSnapshot,
    upcomingAlertDebugStore,
} from './upcoming-alert-debug';
import { resetUpcomingAlertDebugHistory } from './upcoming-alert-debug-runtime';

export function UpcomingAlertDebugPane({ compact = false }) {
    const state = useSyncExternalStore(
        upcomingAlertDebugStore.subscribe,
        upcomingAlertDebugStore.getSnapshot,
        upcomingAlertDebugStore.getSnapshot,
    );
    const [copiedSnapshot, setCopiedSnapshot] = useState('');
    const [shareError, setShareError] = useState('');
    const [resetStatus, setResetStatus] = useState('');
    const [resetting, setResetting] = useState(false);
    const resetInFlight = useRef(false);
    const resetLimits = async () => {
        if (resetInFlight.current) return;
        resetInFlight.current = true;
        setResetting(true);
        setResetStatus('');
        try {
            await resetUpcomingAlertDebugHistory();
            setResetStatus(
                'Upcoming warning history reset. Confirmation limits kept.',
            );
        } catch {
            setResetStatus('Warning history reset failed.');
        } finally {
            resetInFlight.current = false;
            setResetting(false);
        }
    };
    if (!state.enabled && compact) return null;
    const latest = state.latest;
    const status =
        latest?.blockers[0] ??
        (latest?.selectedKey
            ? `Selected ${latest.selectedKey} · ${latest.transition}`
            : (latest?.candidates[0]?.blockers[0] ??
              'Waiting for eligible car alerts'));
    if (compact)
        return (
            <View className="max-w-[300px] gap-1 rounded-md bg-neutral-950/90 p-2">
                <Text className="text-xs font-bold text-white">
                    Upcoming alerts
                </Text>
                <Text className="text-[10px] text-amber-200">{status}</Text>
                <Text className="text-[10px] text-white">
                    {latest?.pathSource ?? 'unknown'} ·{' '}
                    {latest?.eligibleCount ?? 0}/{latest?.candidateCount ?? 0}{' '}
                    eligible
                </Text>
            </View>
        );
    return (
        <View
            className="gap-2 rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
            testID="upcoming-alert-debug-pane"
        >
            <Text className="text-sm font-semibold text-neutral-950 dark:text-white">
                Upcoming alert diagnostics
            </Text>
            <Text className="text-xs leading-4 text-neutral-600 dark:text-neutral-400">
                Enable Upcoming Alerts before replaying. Covers ALPR and police
                warnings. Keeps the latest measurements and 60 delivery events
                in memory; no coordinates or route geometry. Turning it off
                retains the snapshot.
            </Text>
            <Text className="text-xs font-semibold text-neutral-950 dark:text-white">
                {state.enabled ? 'Recording' : 'Paused'} ·{' '}
                {latest?.pathSource ?? 'No samples yet'}
            </Text>
            <Text className="text-xs text-neutral-700 dark:text-neutral-300">
                {status}
            </Text>
            {latest ? (
                <View className="gap-1">
                    <Text className="text-xs text-neutral-600 dark:text-neutral-400">
                        Updated {latest.capturedAt}
                        {'\n'}
                        Path: {latest.pathSource} · {latest.pathPointCount}{' '}
                        points{'\n'}
                        ALPR inventory: {latest.alprNodeCount} · history:{' '}
                        {latest.historyCount ?? 'unavailable'}
                        {'\n'}
                        Eligible: {latest.eligibleCount}/{latest.candidateCount}{' '}
                        · transition: {latest.transition}
                    </Text>
                    {latest.blockers.map((reason) => (
                        <Text
                            key={reason}
                            className="text-xs text-amber-700 dark:text-amber-300"
                        >
                            {reason}
                        </Text>
                    ))}
                    {latest.candidates.map((candidate, index) => (
                        <Text
                            key={candidate.key ?? index}
                            className="text-xs text-neutral-700 dark:text-neutral-300"
                        >
                            {candidate.key ?? candidate.type}:{' '}
                            {candidate.geographicMeters ?? '?'} m direct /{' '}
                            {candidate.pathMeters ?? '?'} m along path ·{' '}
                            {candidate.blockers.join('; ') || 'Eligible'}
                        </Text>
                    ))}
                </View>
            ) : null}
            {state.events.slice(-5).map((event, index) => (
                <Text
                    key={`${event.at}-${index}`}
                    className="text-xs text-neutral-600 dark:text-neutral-400"
                >
                    {event.at} · {event.event}
                    {event.alertId == null ? '' : ` #${event.alertId}`}
                </Text>
            ))}
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reset upcoming ALPR and police warning history"
                accessibilityState={{ disabled: resetting, busy: resetting }}
                disabled={resetting}
                className="items-center rounded-md bg-neutral-200 px-3 py-2 disabled:opacity-50 dark:bg-neutral-800"
                onPress={resetLimits}
                testID="upcoming-alert-debug-reset-limits"
            >
                <Text className="text-sm font-semibold text-neutral-950 dark:text-white">
                    {resetting ? 'Resetting…' : 'Reset warning history'}
                </Text>
            </Pressable>
            <Text className="text-xs text-neutral-600 dark:text-neutral-400">
                Allows ALPR and police warnings to repeat on this drive.
                Confirmation cooldowns and queued reports are kept.
            </Text>
            {resetStatus ? (
                <Text
                    accessibilityRole="alert"
                    className="text-xs text-neutral-700 dark:text-neutral-300"
                    testID="upcoming-alert-debug-reset-status"
                >
                    {resetStatus}
                </Text>
            ) : null}
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Capture Upcoming alert diagnostic snapshot"
                className="items-center rounded-md bg-blue-600 px-3 py-2"
                onPress={() =>
                    setCopiedSnapshot(formatUpcomingAlertDebugSnapshot(state))
                }
                testID="upcoming-alert-debug-capture"
            >
                <Text className="text-sm font-semibold text-white">
                    Capture snapshot
                </Text>
            </Pressable>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share Upcoming alert diagnostic snapshot"
                className="items-center rounded-md bg-neutral-200 px-3 py-2 dark:bg-neutral-800"
                onPress={() => {
                    setShareError('');
                    void Share.share({
                        message:
                            copiedSnapshot ||
                            formatUpcomingAlertDebugSnapshot(state),
                    }).catch(() =>
                        setShareError(
                            'Sharing failed. Long-press the captured snapshot to copy it.',
                        ),
                    );
                }}
            >
                <Text className="text-sm font-semibold text-neutral-950 dark:text-white">
                    Share snapshot
                </Text>
            </Pressable>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear Upcoming alert diagnostics"
                className="items-center px-3 py-2"
                onPress={() => {
                    upcomingAlertDebugStore.clear();
                    setCopiedSnapshot('');
                }}
            >
                <Text className="text-xs text-neutral-600 dark:text-neutral-400">
                    Clear diagnostics
                </Text>
            </Pressable>
            {shareError ? (
                <Text
                    accessibilityRole="alert"
                    className="text-xs text-red-700 dark:text-red-300"
                >
                    {shareError}
                </Text>
            ) : null}
            {copiedSnapshot ? (
                <>
                    <Text className="text-xs text-neutral-600 dark:text-neutral-400">
                        Long-press below to copy this frozen snapshot.
                    </Text>
                    <Text
                        selectable
                        className="rounded bg-neutral-100 p-2 font-mono text-[10px] leading-4 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100"
                        testID="upcoming-alert-debug-snapshot"
                    >
                        {copiedSnapshot}
                    </Text>
                </>
            ) : null}
        </View>
    );
}
