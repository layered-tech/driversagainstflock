import { Pressable } from 'react-native';
import { NativeNavigationAction } from '../root/native-navigation';
import { MAP_CONTROL_BUTTON_SIZE } from './constants';
import { getDuoRailIcon } from './duo-rail-icons';
import { mapLiquidGlassIsAvailable } from './map-liquid-glass';
import { NativeWindGlassView } from './native-components';

export function MapControlButton({
    children,
    className,
    glassTintColor = '#ffffffcc',
    glassColorScheme = 'auto',
    glassBorderClassName = 'border-white/45',
    style,
    nativeBadge,
    nativeSymbol,
    nativeOrder,
    nativeGroup,
    nativeVisibilityPriority,
    nativeSharesBackground = false,
    nativeOverflowOnly = false,
    ...pressableProps
}) {
    const dimensionStyle = {
        height: MAP_CONTROL_BUTTON_SIZE,
        width: MAP_CONTROL_BUTTON_SIZE,
    };

    const iconName = children?.props?.name;
    const symbol =
        {
            plus: 'plus',
            minus: 'minus',
            'locate-fixed': 'scope',
            pencil: 'pencil',
            navigation: 'location.north',
            menu: 'line.3.horizontal',
            x: 'xmark',
            map: 'map',
            route: 'point.topleft.down.to.point.bottomright.curvepath',
        }[iconName] ?? 'slider.vertical.3';
    const content = !mapLiquidGlassIsAvailable() ? (
        <Pressable
            className={className}
            style={[dimensionStyle, style]}
            {...pressableProps}
        >
            {children}
        </Pressable>
    ) : (
        <NativeWindGlassView
            className={`h-12 w-12 items-center justify-center overflow-hidden rounded-dafSm border-hairline ${glassBorderClassName}`}
            colorScheme={glassColorScheme}
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

    return (
        <NativeNavigationAction
            railOnly
            kind="tool"
            badge={nativeBadge}
            symbol={nativeSymbol ?? symbol}
            icon={getDuoRailIcon(nativeSymbol ?? symbol)}
            tintColor={iconName === 'pencil' ? children.props.color : undefined}
            order={nativeOrder ?? 0}
            group={nativeGroup}
            visibilityPriority={nativeVisibilityPriority}
            sharesBackground={nativeSharesBackground}
            overflowOnly={nativeOverflowOnly}
            label={pressableProps.accessibilityLabel}
            disabled={pressableProps.disabled}
            onPress={pressableProps.onPress}
            testID={pressableProps.testID}
        >
            {content}
        </NativeNavigationAction>
    );
}
