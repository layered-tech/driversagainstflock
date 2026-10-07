import { View } from 'react-native';
import { Icon } from '../design-system/icon';

// Optical sizes account for the different amounts of whitespace in each SVG.
const ICON_SIZES = {
    menu: 25,
    'sliders-horizontal': 22,
    route: 21,
    map: 22,
    navigation: 22,
    x: 26,
    'chevron-left': 28,
    plus: 27,
    minus: 27,
    'locate-fixed': 22,
    pencil: 22,
};

const ICON_OFFSETS = {
    navigation: '-translate-x-px translate-y-px',
    'chevron-left': '-translate-x-px',
};

export function MapControlIcon({ color, name }) {
    const size = ICON_SIZES[name] ?? 22;

    return (
        <View
            className={`h-7 w-7 items-center justify-center ${
                ICON_OFFSETS[name] ?? ''
            }`}
        >
            <Icon
                color={color}
                name={name}
                size={size}
                // Keep a 2pt stroke as the 24-unit SVG scales to each size.
                stroke={48 / size}
            />
        </View>
    );
}
