import { useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import {
    formatPresenceDebugSnapshot,
    presenceDebugStore,
} from './alpr-presence-debug';
import { resetPresenceDebugLimits } from './alpr-presence-runtime';

export function AlprPresenceDebugPane({ compact = false }) {
    const state = useSyncExternalStore(
        presenceDebugStore.subscribe,
        presenceDebugStore.getSnapshot,
        presenceDebugStore.getSnapshot,
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
            await resetPresenceDebugLimits();
            setResetStatus(
                'Cooldowns and drive budget reset. Queued reports kept.',
            );
        } catch {
            setResetStatus(
                'Reset failed. Cooldowns and budget were not reset.',
            );
        } finally {
            resetInFlight.current = false;
            setResetting(false);
        }
    };
    if (!state.enabled && compact) return null;
    const latest = state.latest;
    const status =
        latest?.blockers[0] ??
        latest?.pass?.reason ??
        'Waiting for car map samples';
    if (compact)
        return (
            <View className="max-w-[300px] gap-1 rounded-md bg-neutral-950/90 p-2">
                <Text className="text-xs font-bold text-white">
                    ALPR confirmation · {latest?.phase ?? 'waiting'}
                </Text>
                <Text className="text-[10px] text-amber-200">{status}</Text>
                <Text className="text-[10px] text-white">
                    Node{' '}
                    {latest?.targetNodeId ??
                        latest?.inventory.targets[0]?.osmNodeId ??
                        '—'}{' '}
                    · road {latest?.location.confidence ?? '—'} · clear{' '}
                    {latest?.path.maneuverSeconds ?? '—'}s
                </Text>
            </View>
        );
    return (
        <View
            className="gap-2 rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
            testID="alpr-presence-debug-pane"
        >
            <Text className="text-sm font-semibold text-neutral-950 dark:text-white">
                ALPR confirmation diagnostics
            </Text>
            <Text className="text-xs leading-4 text-neutral-600 dark:text-neutral-400">
                Enable ALPR Confirmation before replaying. Keeps the latest
                measurements and 60 decision events in memory; no coordinates or
                route geometry. Turning it off retains the snapshot.
            </Text>
            <Text className="text-xs font-semibold text-neutral-950 dark:text-white">
                {state.enabled ? 'Recording' : 'Paused'} ·{' '}
                {latest?.phase ?? 'No samples yet'}
            </Text>
            <Text className="text-xs text-neutral-700 dark:text-neutral-300">
                {status}
            </Text>
            {latest ? (
                <>
                    <Text className="text-xs text-neutral-600 dark:text-neutral-400">
                        Updated {latest.capturedAt}
                        {'\n'}Node:{' '}
                        {latest.targetNodeId ??
                            latest.inventory.targets[0]?.osmNodeId ??
                            'none'}
                        {'\n'}Road confidence (diagnostic):{' '}
                        {latest.location.confidence ?? 'unknown'}
                        {'\n'}
                        GPS: {latest.location.accuracyMeters ?? 'unknown'} m ·
                        age {latest.location.ageMs ?? 'unknown'} ms{'\n'}
                        Maneuver clearance:{' '}
                        {latest.path.navigationActive
                            ? `${latest.path.maneuverSeconds ?? 'unknown'} s / 30 s`
                            : 'Not applicable — no active route'}
                        {'\n'}Inventory: {latest.inventory.status} ·{' '}
                        {latest.inventory.nodeCount} cameras{'\n'}Budget:{' '}
                        {latest.limits.promptsThisDrive ?? 'unknown'} / 15 ·
                        cooldown {latest.limits.globalCooldownSeconds} s
                    </Text>
                    {latest.blockers.map((reason) => (
                        <Text
                            className="text-xs text-amber-700 dark:text-amber-300"
                            key={reason}
                        >
                            • {reason}
                        </Text>
                    ))}
                </>
            ) : null}
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reset ALPR confirmation cooldowns and budget"
                accessibilityState={{ disabled: resetting, busy: resetting }}
                disabled={resetting}
                className="items-center rounded-md bg-neutral-200 px-3 py-2 disabled:opacity-50 dark:bg-neutral-800"
                onPress={resetLimits}
                testID="alpr-presence-debug-reset-limits"
            >
                <Text className="text-sm font-semibold text-neutral-950 dark:text-white">
                    {resetting ? 'Resetting…' : 'Reset cooldowns and budget'}
                </Text>
            </Pressable>
            <Text className="text-xs text-neutral-600 dark:text-neutral-400">
                Resets the drive budget and both global and same-node cooldowns.
                Queued reports are kept.
            </Text>
            {resetStatus ? (
                <Text
                    accessibilityRole="alert"
                    className="text-xs text-neutral-700 dark:text-neutral-300"
                    testID="alpr-presence-debug-reset-status"
                >
                    {resetStatus}
                </Text>
            ) : null}
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Capture ALPR confirmation diagnostic snapshot"
                className="items-center rounded-md bg-blue-600 px-3 py-2"
                onPress={() =>
                    setCopiedSnapshot(formatPresenceDebugSnapshot(state))
                }
                testID="alpr-presence-debug-capture"
            >
                <Text className="text-sm font-semibold text-white">
                    Capture snapshot
                </Text>
            </Pressable>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share ALPR confirmation diagnostic snapshot"
                className="items-center rounded-md bg-neutral-200 px-3 py-2 dark:bg-neutral-800"
                onPress={() => {
                    setShareError('');
                    void Share.share({
                        message:
                            copiedSnapshot ||
                            formatPresenceDebugSnapshot(state),
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
                accessibilityLabel="Clear ALPR confirmation diagnostics"
                className="items-center px-3 py-2"
                onPress={() => {
                    presenceDebugStore.clear();
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
                        testID="alpr-presence-debug-snapshot"
                    >
                        {copiedSnapshot}
                    </Text>
                </>
            ) : null}
        </View>
    );
}
