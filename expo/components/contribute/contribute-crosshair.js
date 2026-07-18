import { View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { dafSemanticColors } from '../design-system/tokens';

const CROSSHAIR_SIZE = 58;

export function ContributeCrosshair() {
    return (
        <View
            className="absolute inset-0 items-center justify-center"
            pointerEvents="none"
            testID="contribute-crosshair"
        >
            <Svg
                fill="none"
                height={CROSSHAIR_SIZE}
                stroke={dafSemanticColors.brand}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.2}
                viewBox="0 0 24 24"
                width={CROSSHAIR_SIZE}
            >
                <Circle cx={12} cy={12} r={10} />
                <Line x1={22} x2={18} y1={12} y2={12} />
                <Line x1={6} x2={2} y1={12} y2={12} />
                <Line x1={12} x2={12} y1={6} y2={2} />
                <Line x1={12} x2={12} y1={22} y2={18} />
                <Circle
                    cx={12}
                    cy={12}
                    fill={dafSemanticColors.brand}
                    r={1.4}
                    stroke="none"
                />
            </Svg>
        </View>
    );
}
