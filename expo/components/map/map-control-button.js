import { Pressable } from 'react-native';
import { MAP_CONTROL_BUTTON_SIZE } from './constants';
import { mapLiquidGlassIsAvailable } from './map-liquid-glass';
import { NativeWindGlassView } from './native-components';

export function MapControlButton({
    children,
    className,
    glassTintColor = '#ffffffcc',
    style,
    ...pressableProps
}) {
    const dimensionStyle = {
        height: MAP_CONTROL_BUTTON_SIZE,
        width: MAP_CONTROL_BUTTON_SIZE,
    };

    if (!mapLiquidGlassIsAvailable()) {
        return (
            <Pressable
                className={className}
                style={[dimensionStyle, style]}
                {...pressableProps}
            >
                {children}
            </Pressable>
        );
    }

    return (
        <NativeWindGlassView
            className="border-hairline h-12 w-12 items-center justify-center overflow-hidden rounded-dafSm border-white/45 shadow-[0px_4px_14px_rgba(11,14,18,0.18)]"
            colorScheme="auto"
            glassEffectStyle="regular"
            isInteractive
            style={dimensionStyle}
            tintColor={glassTintColor}
        >
            <Pressable
                className="h-12 w-12 items-center justify-center rounded-dafSm p-0 active:bg-white/15 disabled:opacity-70"
                style={dimensionStyle}
                {...pressableProps}
            >
                {children}
            </Pressable>
        </NativeWindGlassView>
    );
}
