import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { dafSemanticColors } from '../design-system/tokens';
import {
    MAP_CONTROL_BUTTON_CLASS_NAME,
    MAP_CONTROL_BUTTON_SIZE,
} from '../map/constants';
import { MapControlButton } from '../map/map-control-button';
import { MapControlIcon } from '../map/map-control-icon';
import { useSharedMapState } from '../map/shared-map-state';
import { useContribute } from './contribute-state';

const CONTRIBUTE_ENTRY_HALO_PADDING = 4;
const CONTRIBUTE_ENTRY_FOOTPRINT_SIZE =
    MAP_CONTROL_BUTTON_SIZE + CONTRIBUTE_ENTRY_HALO_PADDING * 2;

export function ContributeEntryButton({ isDarkMapLayer = false }) {
    const { drivingModeIsActive } = useSharedMapState();
    const {
        coachMarkIsDismissed,
        contributeStatus,
        dismissCoachMark,
        openStartSheet,
        storedDraftSummary,
        resumeStoredDraft,
    } = useContribute();
    const [dismissedDraftKey, setDismissedDraftKey] = useState(null);
    const [coachMarkHeight, setCoachMarkHeight] = useState(0);

    if (drivingModeIsActive) {
        return null;
    }

    const draftKey = storedDraftSummary
        ? `${storedDraftSummary.updatedAt ?? ''}:${storedDraftSummary.pinCount}:${storedDraftSummary.label}`
        : null;
    const coachMarkIsVisible =
        (storedDraftSummary
            ? dismissedDraftKey !== draftKey
            : !coachMarkIsDismissed) && contributeStatus === 'idle';
    // Centers the measured coach mark card against the halo-wrapped button.
    const coachMarkTopOffset =
        (CONTRIBUTE_ENTRY_FOOTPRINT_SIZE - coachMarkHeight) / 2;

    const handleContributePress = () => {
        if (!coachMarkIsDismissed) {
            dismissCoachMark();
        }

        if (storedDraftSummary) {
            resumeStoredDraft();
        } else {
            openStartSheet();
        }
    };

    return (
        <View className="relative">
            <View className="rounded-dafMd bg-daf-brand/15 p-1">
                <MapControlButton
                    accessibilityLabel={
                        storedDraftSummary
                            ? `Resume draft changeset, ${storedDraftSummary.pinCount} pending changes`
                            : 'Edit the map'
                    }
                    accessibilityRole="button"
                    className={`${MAP_CONTROL_BUTTON_CLASS_NAME} border-daf-brand ${isDarkMapLayer ? 'bg-daf-surface-dark' : 'bg-white'}`}
                    glassTintColor={
                        isDarkMapLayer
                            ? 'rgba(23,23,23,0.78)'
                            : 'rgba(230,249,239,0.78)'
                    }
                    glassColorScheme={isDarkMapLayer ? 'dark' : 'light'}
                    glassBorderClassName="border-daf-brand"
                    onPress={handleContributePress}
                    testID="map-contribute-button"
                >
                    <MapControlIcon
                        color={dafSemanticColors.brand}
                        name="pencil"
                    />
                </MapControlButton>
                {storedDraftSummary ? (
                    <View
                        testID="contribute-draft-count"
                        className={`absolute -right-1 -top-1 h-7 min-w-7 items-center justify-center rounded-full border-2 bg-daf-brand px-1.5 ${isDarkMapLayer ? 'border-daf-surface-dark' : 'border-white'}`}
                    >
                        <Text className="font-dafMono text-[13px] font-bold text-white">
                            {storedDraftSummary.pinCount}
                        </Text>
                    </View>
                ) : null}
            </View>
            {coachMarkIsVisible ? (
                <Pressable
                    accessibilityHint="Dismisses this tip."
                    accessibilityLabel={
                        storedDraftSummary
                            ? 'Draft changeset. Dismiss tip'
                            : 'Contribute. Edit the map.'
                    }
                    accessibilityRole="button"
                    className={`absolute right-[62px] w-[198px] rounded-dafMd border px-3 py-2.5 shadow-[0px_4px_18px_rgba(11,14,18,0.16)] ${isDarkMapLayer ? 'border-daf-border-dark bg-daf-surface-dark' : 'border-daf-border bg-white'}`}
                    onLayout={(event) =>
                        setCoachMarkHeight(event.nativeEvent.layout.height)
                    }
                    onPress={() => {
                        if (storedDraftSummary) setDismissedDraftKey(draftKey);
                        dismissCoachMark();
                    }}
                    style={{
                        opacity: coachMarkHeight > 0 ? 1 : 0,
                        top: coachMarkTopOffset,
                    }}
                    testID="contribute-coach-mark"
                >
                    <Text
                        className={`mb-[3px] text-[11px] font-bold uppercase tracking-[0.06em] ${isDarkMapLayer ? 'text-daf-brand' : 'text-daf-text-brand'}`}
                    >
                        {storedDraftSummary ? 'Draft changeset' : 'Contribute'}
                    </Text>
                    <Text
                        className={`text-[13px] leading-[18px] ${isDarkMapLayer ? 'text-white' : 'text-daf-text-primary'}`}
                    >
                        {storedDraftSummary
                            ? `${storedDraftSummary.pinCount} ${storedDraftSummary.pinCount === 1 ? 'change' : 'changes'} pending — ${storedDraftSummary.label}. Tap the pencil to resume.`
                            : "Spotted a camera that isn't mapped — or one that's gone? Edit the map."}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}
