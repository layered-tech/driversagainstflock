import { useRef, useState } from 'react';
import { View } from 'react-native';
import { DafIconButton } from '../design-system/primitives';

export function AreaRadiusControl({ value, onChange }) {
    const [width, setWidth] = useState(1);
    const currentValue = useRef(value);
    currentValue.current = value;
    const fromTouch = (event) => {
        const next = Math.max(
            1,
            Math.min(
                25,
                Math.round((event.nativeEvent.locationX / width) * 24) + 1,
            ),
        );
        if (next !== currentValue.current) {
            currentValue.current = next;
            onChange(next);
        }
    };
    return (
        <View className="flex-row items-center gap-3">
            <DafIconButton
                icon="minus"
                accessibilityLabel="Decrease radius"
                disabled={value === 1}
                onPress={() => onChange(value - 1)}
            />
            <View
                accessibilityRole="adjustable"
                accessibilityLabel="Radius in miles"
                accessibilityValue={{ min: 1, max: 25, now: value }}
                accessibilityActions={[
                    { name: 'increment' },
                    { name: 'decrement' },
                ]}
                onAccessibilityAction={(event) =>
                    onChange(
                        Math.max(
                            1,
                            Math.min(
                                25,
                                value +
                                    (event.nativeEvent.actionName ===
                                    'increment'
                                        ? 1
                                        : -1),
                            ),
                        ),
                    )
                }
                className="h-11 flex-1 justify-center"
                onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={fromTouch}
                onResponderMove={fromTouch}
            >
                <View
                    pointerEvents="none"
                    className="h-1.5 rounded-full bg-daf-brand/15"
                >
                    <View
                        className="h-1.5 rounded-full bg-daf-brand"
                        style={{ width: `${((value - 1) / 24) * 100}%` }}
                    />
                </View>
                <View
                    pointerEvents="none"
                    className="absolute h-5 w-5 rounded-full border-2 border-white bg-daf-brand"
                    style={{
                        left: Math.max(
                            0,
                            Math.min(
                                width - 20,
                                ((value - 1) / 24) * width - 10,
                            ),
                        ),
                    }}
                />
            </View>
            <DafIconButton
                icon="plus"
                accessibilityLabel="Increase radius"
                disabled={value === 25}
                onPress={() => onChange(value + 1)}
            />
        </View>
    );
}
