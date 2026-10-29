import { Stack } from 'expo-router/stack';
import { DuoPaneScreen } from '../../components/root/duo-pane-screen';
import { useFonts } from 'expo-font';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { getDafTheme } from '../../components/design-system/tokens';

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

function screenLayout({ children, route }) {
    return ['index', '[areaId]/index', '[areaId]/alerts'].includes(
        route.name,
    ) ? (
        <DuoPaneScreen>{children}</DuoPaneScreen>
    ) : (
        children
    );
}

export default function AreasLayout() {
    const theme = getDafTheme(useColorScheme());
    const [fontsLoaded, fontError] = useFonts(AREA_FONTS);
    return (
        <View className="flex-1 bg-daf-surface-page dark:bg-daf-surface-inverse">
            {!fontsLoaded && !fontError ? (
                <ActivityIndicator className="flex-1" color="#1FBF6B" />
            ) : (
                <Stack
                    screenLayout={screenLayout}
                    screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: theme.surface.page },
                    }}
                />
            )}
        </View>
    );
}
