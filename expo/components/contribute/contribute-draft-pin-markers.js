import Mapbox from '@rnmapbox/maps';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { dafSemanticColors } from '../design-system/tokens';
import { useMapCanvasContext } from '../map/map-screen-context';

const DRAFT_PIN_MARKER_SIZE = 30;

export function ContributeDraftPinMarkers() {
    const { contributePins, contributePlacementIsActive } =
        useMapCanvasContext();

    if (!contributePlacementIsActive || !(contributePins ?? []).length) {
        return null;
    }

    return (
        <>
            {contributePins.map((pin, pinIndex) => (
                <Mapbox.MarkerView
                    key={pin.id}
                    allowOverlap
                    allowOverlapWithPuck
                    anchor={{ x: 0.5, y: 0.5 }}
                    coordinate={[pin.longitude, pin.latitude]}
                >
                    <View
                        pointerEvents="none"
                        testID={`contribute-draft-pin-${pinIndex}`}
                    >
                        <Svg
                            height={DRAFT_PIN_MARKER_SIZE}
                            viewBox="0 0 30 30"
                            width={DRAFT_PIN_MARKER_SIZE}
                        >
                            <Circle
                                cx={15}
                                cy={15}
                                fill="rgba(255,77,79,0.15)"
                                r={14}
                            />
                            <Circle
                                cx={15}
                                cy={15}
                                fill={dafSemanticColors.markerAlpr}
                                r={7}
                                stroke="#ffffff"
                                strokeWidth={2.5}
                            />
                        </Svg>
                    </View>
                </Mapbox.MarkerView>
            ))}
        </>
    );
}
