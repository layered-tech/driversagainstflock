import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, useColorScheme, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedProps,
    useSharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import {
    dafSemanticColors,
    dafTypography,
    getDafTheme,
} from '../design-system/tokens';

const AnimatedLine = Animated.createAnimatedComponent(Line);

const COMPASS_DIAL_SIZE = 104;
const COMPASS_DIAL_CENTER = COMPASS_DIAL_SIZE / 2;
const COMPASS_NEEDLE_LENGTH = 33;
const COMPASS_LABELS = [
    { label: 'N', x: 50, y: 17 },
    { label: 'E', x: 87, y: 54 },
    { label: 'S', x: 50, y: 93 },
    { label: 'W', x: 13, y: 54 },
];

function normalizeDialDegrees(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return 0;
    }

    return ((Math.round(numericValue) % 360) + 360) % 360;
}

export function CompassDial({ onChange, testID, value }) {
    const colorScheme = useColorScheme();
    const [displayDegrees, setDisplayDegrees] = useState(() =>
        normalizeDialDegrees(value),
    );
    const angle = useSharedValue(normalizeDialDegrees(value));
    const lastReportedDegrees = useSharedValue(normalizeDialDegrees(value));
    const theme = getDafTheme(colorScheme);

    useEffect(() => {
        const normalizedValue = normalizeDialDegrees(value);

        angle.value = normalizedValue;
        lastReportedDegrees.value = normalizedValue;
        setDisplayDegrees(normalizedValue);
    }, [angle, lastReportedDegrees, value]);

    const handleInteractionEnd = useCallback(
        (degrees) => {
            setDisplayDegrees(degrees);
            onChange?.(degrees);
        },
        [onChange],
    );

    const panGesture = useMemo(() => {
        const updateAngleFromTouch = (event) => {
            'worklet';

            const touchAngle =
                (Math.atan2(
                    event.x - COMPASS_DIAL_CENTER,
                    -(event.y - COMPASS_DIAL_CENTER),
                ) *
                    180) /
                Math.PI;
            const normalizedAngle = (touchAngle + 360) % 360;

            angle.value = normalizedAngle;

            const roundedDegrees = Math.round(normalizedAngle) % 360;

            if (roundedDegrees !== lastReportedDegrees.value) {
                lastReportedDegrees.value = roundedDegrees;
                runOnJS(setDisplayDegrees)(roundedDegrees);
            }
        };

        return Gesture.Pan()
            .minDistance(1)
            .onBegin(updateAngleFromTouch)
            .onUpdate(updateAngleFromTouch)
            .onFinalize(() => {
                runOnJS(handleInteractionEnd)(Math.round(angle.value) % 360);
            });
    }, [angle, handleInteractionEnd, lastReportedDegrees]);

    const needleAnimatedProps = useAnimatedProps(() => {
        const angleRadians = (angle.value * Math.PI) / 180;

        return {
            x2: 50 + COMPASS_NEEDLE_LENGTH * Math.sin(angleRadians),
            y2: 50 - COMPASS_NEEDLE_LENGTH * Math.cos(angleRadians),
        };
    });

    return (
        <View className="dark:border-daf-border-dark dark:bg-daf-surface-dark flex-row items-center gap-3.5 rounded-dafMd border border-daf-border bg-white p-3.5">
            <GestureDetector gesture={panGesture}>
                <View
                    accessibilityLabel="Camera direction dial"
                    accessibilityRole="adjustable"
                    accessibilityValue={{ text: `${displayDegrees} degrees` }}
                    style={{
                        height: COMPASS_DIAL_SIZE,
                        width: COMPASS_DIAL_SIZE,
                    }}
                    testID={testID}
                >
                    <Svg
                        height={COMPASS_DIAL_SIZE}
                        viewBox="0 0 100 100"
                        width={COMPASS_DIAL_SIZE}
                    >
                        <Circle
                            cx="50"
                            cy="50"
                            fill="none"
                            r="44"
                            stroke={theme.border.strong}
                            strokeWidth="2"
                        />
                        {COMPASS_LABELS.map((compassLabel) => (
                            <SvgText
                                fill={theme.text.tertiary}
                                fontFamily={dafTypography.mono.fontFamily}
                                fontSize="11"
                                key={compassLabel.label}
                                textAnchor="middle"
                                x={compassLabel.x}
                                y={compassLabel.y}
                            >
                                {compassLabel.label}
                            </SvgText>
                        ))}
                        <AnimatedLine
                            animatedProps={needleAnimatedProps}
                            stroke={dafSemanticColors.brand}
                            strokeLinecap="round"
                            strokeWidth="3.5"
                            x1="50"
                            y1="50"
                        />
                        <Circle
                            cx="50"
                            cy="50"
                            fill={dafSemanticColors.brand}
                            r="4"
                        />
                    </Svg>
                </View>
            </GestureDetector>
            <View className="min-w-0 flex-1">
                <Text
                    className="font-dafMono text-[22px] font-bold leading-[22px] text-daf-text-primary dark:text-white"
                    testID="contribute-direction-readout"
                >
                    {displayDegrees}°
                </Text>
                <Text className="mt-1 text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                    Drag the needle to the way the camera looks.
                </Text>
            </View>
        </View>
    );
}
