import { useFonts } from 'expo-font';
import { forwardRef } from 'react';
import { Platform, Text, TextInput } from 'react-native';
import { areaTextClassName } from '../areas/area-typography';
import { useDuoDevice } from '../root/duo-device-context';

const DUO_FONTS = {
    'HankenGrotesk-Regular': require('../../assets/fonts/HankenGrotesk-Regular.ttf'),
    'HankenGrotesk-Medium': require('../../assets/fonts/HankenGrotesk-Medium.ttf'),
    'HankenGrotesk-SemiBold': require('../../assets/fonts/HankenGrotesk-SemiBold.ttf'),
    'HankenGrotesk-Bold': require('../../assets/fonts/HankenGrotesk-Bold.ttf'),
    'Geist-Bold': require('../../assets/fonts/Geist-Bold.ttf'),
    'JetBrainsMono-Regular': require('../../assets/fonts/JetBrainsMono-Regular.ttf'),
    'JetBrainsMono-SemiBold': require('../../assets/fonts/JetBrainsMono-SemiBold.ttf'),
    'JetBrainsMono-Bold': require('../../assets/fonts/JetBrainsMono-Bold.ttf'),
};

export function DuoTypographyProvider({ children }) {
    const [loaded, error] = useFonts(DUO_FONTS);
    const railEdge = useDuoDevice();
    return (railEdge || Platform?.isPad) && !loaded && !error ? null : children;
}

export const DuoText = forwardRef(function DuoText(
    { className, ...props },
    ref,
) {
    const railEdge = useDuoDevice();
    return (
        <Text
            {...props}
            ref={ref}
            className={
                railEdge || Platform?.isPad
                    ? areaTextClassName(className)
                    : className
            }
        />
    );
});

export const DuoTextInput = forwardRef(function DuoTextInput(
    { className, ...props },
    ref,
) {
    const railEdge = useDuoDevice();
    return (
        <TextInput
            {...props}
            ref={ref}
            className={
                railEdge || Platform?.isPad
                    ? areaTextClassName(className)
                    : className
            }
        />
    );
});
