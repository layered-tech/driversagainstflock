import { ActivityIndicator, Image, Text, View } from 'react-native';

export function GoogleResultsFooter({ isLoading, searchIconColor, visible }) {
    if (!visible) {
        return null;
    }

    return (
        <View
            accessibilityLabel="Results powered by Google"
            className="min-h-8 flex-row items-center justify-between gap-3 px-2 pb-1 pt-2"
        >
            <View className="flex-row items-start gap-1">
                <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                    Powered by
                </Text>
                <Image
                    accessibilityIgnoresInvertColors
                    resizeMode="contain"
                    source={require('../../assets/images/google_on_white.png')}
                    style={{ height: 16, width: 60 }}
                />
            </View>

            {isLoading ? (
                <View
                    accessibilityLabel="Searching places"
                    accessibilityRole="progressbar"
                    className="flex-row items-center gap-2"
                >
                    <ActivityIndicator color={searchIconColor} size="small" />
                    <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                        Searching
                    </Text>
                </View>
            ) : null}
        </View>
    );
}
