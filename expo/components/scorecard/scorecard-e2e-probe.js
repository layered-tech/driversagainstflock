import { Text, View } from 'react-native';
import { APP_ENVIRONMENT } from '../map/config';

function ScorecardE2EProbeValue({ children, testID }) {
    return (
        <Text
            className="font-dafMono text-[8px] leading-[9px] text-white"
            testID={testID}
        >
            {children}
        </Text>
    );
}

export function ScorecardE2EProbe({
    activeSession,
    isHydrated,
    persistedRevision,
    stateRevision,
}) {
    if (APP_ENVIRONMENT !== 'e2e') {
        return null;
    }

    const guidedSessionIsActive = activeSession?.mode === 'guided';
    const storageIsSynced =
        Number.isFinite(stateRevision) &&
        stateRevision > 0 &&
        persistedRevision === stateRevision;

    return (
        <View
            className="absolute bottom-1 right-1 z-50 gap-px rounded bg-black/80 p-1"
            pointerEvents="none"
            testID="e2e-scorecard-probe"
        >
            <ScorecardE2EProbeValue testID="e2e-scorecard-hydrated">
                {isHydrated
                    ? 'scorecard-hydrated'
                    : 'scorecard-hydration-pending'}
            </ScorecardE2EProbeValue>
            <ScorecardE2EProbeValue testID="e2e-scorecard-guided-active">
                {guidedSessionIsActive
                    ? 'scorecard-guided-active'
                    : 'scorecard-guided-inactive'}
            </ScorecardE2EProbeValue>
            <ScorecardE2EProbeValue testID="e2e-scorecard-state-revision">
                {String(stateRevision ?? 0)}
            </ScorecardE2EProbeValue>
            <ScorecardE2EProbeValue testID="e2e-scorecard-persisted-revision">
                {String(persistedRevision ?? 0)}
            </ScorecardE2EProbeValue>
            {storageIsSynced ? (
                <ScorecardE2EProbeValue testID="e2e-scorecard-storage-synced">
                    true
                </ScorecardE2EProbeValue>
            ) : null}
        </View>
    );
}
