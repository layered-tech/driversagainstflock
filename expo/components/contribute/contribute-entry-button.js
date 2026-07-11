import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { dafSemanticColors } from '../design-system/tokens';
import {
    MAP_CONTROL_BUTTON_CLASS_NAME,
    MAP_CONTROL_BUTTON_SIZE,
} from '../map/constants';
import { MapControlButton } from '../map/map-control-button';
import { useSharedMapState } from '../map/shared-map-state';
import { useContribute } from './contribute-state';

const CONTRIBUTE_ENTRY_HALO_PADDING = 4;
const CONTRIBUTE_ENTRY_FOOTPRINT_SIZE =
    MAP_CONTROL_BUTTON_SIZE + CONTRIBUTE_ENTRY_HALO_PADDING * 2;

export function ContributeEntryButton() {
    const { drivingModeIsActive } = useSharedMapState();
    const {
        coachMarkIsDismissed,
        contributeStatus,
        dismissCoachMark,
        openStartSheet,
    } = useContribute();
    const [coachMarkHeight, setCoachMarkHeight] = useState(0);

    if (drivingModeIsActive) {
        return null;
    }

    const coachMarkIsVisible =
        !coachMarkIsDismissed && contributeStatus === 'idle';
    // Centers the measured coach mark card against the halo-wrapped button.
    const coachMarkTopOffset =
        (CONTRIBUTE_ENTRY_FOOTPRINT_SIZE - coachMarkHeight) / 2;

    const handleContributePress = () => {
        if (!coachMarkIsDismissed) {
            dismissCoachMark();
        }

        openStartSheet();
    };

    return (
        <View className="relative">
            <View className="bg-daf-brand/15 rounded-dafMd p-1">
                <MapControlButton
                    accessibilityLabel="Add a camera to the map"
                    accessibilityRole="button"
                    className={`${MAP_CONTROL_BUTTON_CLASS_NAME} dark:bg-daf-surface-dark border-daf-brand bg-white`}
                    glassTintColor="rgba(230,249,239,0.78)"
                    onPress={handleContributePress}
                    testID="map-contribute-button"
                >
                    <Icon
                        color={dafSemanticColors.brand}
                        name="pencil"
                        size={20}
                    />
                </MapControlButton>
            </View>
            {coachMarkIsVisible ? (
                <Pressable
                    accessibilityHint="Dismisses this tip."
                    accessibilityLabel="Contribute. Spotted a camera that isn't mapped? Add it."
                    accessibilityRole="button"
                    className="dark:border-daf-border-dark dark:bg-daf-surface-dark absolute right-[62px] w-[198px] rounded-dafMd border border-daf-border bg-white px-3 py-2.5 shadow-[0px_4px_18px_rgba(11,14,18,0.16)]"
                    onLayout={(event) =>
                        setCoachMarkHeight(event.nativeEvent.layout.height)
                    }
                    onPress={dismissCoachMark}
                    style={{
                        opacity: coachMarkHeight > 0 ? 1 : 0,
                        top: coachMarkTopOffset,
                    }}
                    testID="contribute-coach-mark"
                >
                    <Text className="mb-[3px] text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-brand dark:text-daf-brand">
                        Contribute
                    </Text>
                    <Text className="text-[13px] leading-[18px] text-daf-text-primary dark:text-white">
                        Spotted a camera that isn't mapped? Add it.
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}
