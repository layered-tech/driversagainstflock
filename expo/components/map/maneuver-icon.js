import { View } from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
import { maneuverIcons } from './maneuver-icons.generated';
import {
    getManeuverAccessibilityLabel,
    getManeuverExitNumber,
    getManeuverKind,
} from './maneuver-kind';

export function ManeuverIcon({ maneuver, color, size = 30 }) {
    const kind = getManeuverKind(maneuver);
    const icon = maneuverIcons[kind];
    const exit = getManeuverExitNumber(kind, maneuver?.exit_number);

    return (
        <View
            accessible
            accessibilityLabel={getManeuverAccessibilityLabel(kind, exit)}
            className="shrink-0 items-center justify-center"
        >
            <Svg
                accessible={false}
                width={size}
                height={size}
                viewBox={icon?.viewBox.join(' ') ?? '0 0 20 20'}
                fill="none"
            >
                {icon?.paths.map((path, index) => (
                    <G
                        key={index}
                        transform={
                            kind === 'roundabout'
                                ? 'translate(-3 -3) scale(1.3)'
                                : path.translate
                                  ? `translate(${path.translate.join(' ')})`
                                  : undefined
                        }
                    >
                        <Path
                            d={path.d}
                            fill={path.fill === 'none' ? 'none' : color}
                            fillRule={path.fillRule}
                        />
                    </G>
                ))}
                {exit !== null ? (
                    <SvgText
                        accessible={false}
                        x={10}
                        y={10}
                        textAnchor="middle"
                        alignmentBaseline="central"
                        fontSize={Math.min(6, 12 / String(exit).length)}
                        fontWeight="bold"
                        fill={color}
                    >
                        {exit}
                    </SvgText>
                ) : null}
            </Svg>
        </View>
    );
}
