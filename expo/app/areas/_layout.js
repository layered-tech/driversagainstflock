import { Stack } from 'expo-router/stack';
import { View } from 'react-native';

export default function AreasLayout() {
    return (
        <View className="flex-1 bg-daf-surface-page dark:bg-daf-surface-inverse">
            <Stack
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: 'transparent' },
                }}
            />
        </View>
    );
}
