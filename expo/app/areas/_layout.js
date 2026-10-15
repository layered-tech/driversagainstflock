import { Stack } from 'expo-router/stack';
import { useFonts } from 'expo-font';
import { ActivityIndicator, View } from 'react-native';

const AREA_FONTS = {
    'HankenGrotesk-Regular': require('../../assets/fonts/HankenGrotesk-Regular.ttf'),
    'HankenGrotesk-Medium': require('../../assets/fonts/HankenGrotesk-Medium.ttf'),
    'HankenGrotesk-SemiBold': require('../../assets/fonts/HankenGrotesk-SemiBold.ttf'),
    'HankenGrotesk-Bold': require('../../assets/fonts/HankenGrotesk-Bold.ttf'),
    'Geist-Bold': require('../../assets/fonts/Geist-Bold.ttf'),
    'JetBrainsMono-Regular': require('../../assets/fonts/JetBrainsMono-Regular.ttf'),
    'JetBrainsMono-SemiBold': require('../../assets/fonts/JetBrainsMono-SemiBold.ttf'),
    'JetBrainsMono-Bold': require('../../assets/fonts/JetBrainsMono-Bold.ttf'),
};

export default function AreasLayout() {
    const [fontsLoaded, fontError] = useFonts(AREA_FONTS);
    return (
        <View className="flex-1 bg-daf-surface-page dark:bg-daf-surface-inverse">
            {!fontsLoaded && !fontError ? (
                <ActivityIndicator className="flex-1" color="#1FBF6B" />
            ) : (
                <Stack
                    screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: 'transparent' },
                    }}
                />
            )}
        </View>
    );
}
