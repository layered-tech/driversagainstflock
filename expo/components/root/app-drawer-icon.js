import { View } from 'react-native';
import { Icon } from '../design-system/icon';

// Optical sizes balance narrow glyphs against circles and denser silhouettes.
const ICON_SIZES = {
    map: 22,
    gauge: 23,
    flame: 25,
    'circle-help': 22,
    coffee: 23,
    info: 22,
    pencil: 22,
    'log-out': 23,
    user: 24,
    'sliders-horizontal': 22,
    bug: 22,
    'triangle-alert': 24,
};

export function AppDrawerIcon({ color, name }) {
    const size = ICON_SIZES[name] ?? 22;

    return (
        <View
            className={`h-6 w-6 items-center justify-center ${
                name === 'gauge' ? 'translate-y-px' : ''
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
