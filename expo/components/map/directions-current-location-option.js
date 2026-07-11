import { Pressable, Text, View } from 'react-native';
import { Icon } from '../design-system/icon';

export function DirectionsCurrentLocationOption({ onPress, searchSource }) {
    return (
        <Pressable
            accessibilityLabel="Use Current Location"
            accessibilityRole="button"
            className="flex-row items-center gap-[13px] rounded-dafMd px-4 py-2.5 active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
            onPress={onPress}
            testID={`map-directions-current-location-${searchSource}`}
        >
            <View className="bg-daf-brand/12 dark:bg-daf-brand/20 h-[38px] w-[38px] items-center justify-center rounded-dafSm">
                <Icon color="#167C47" name="locate-fixed" size={19} />
            </View>

            <View className="min-w-0 flex-1">
                <Text
                    className="text-sm font-semibold text-daf-text-primary dark:text-white"
                    numberOfLines={1}
                >
                    Current Location
                </Text>
                <Text
                    className="mt-0.5 text-xs font-medium text-daf-text-tertiary dark:text-neutral-400"
                    numberOfLines={1}
                >
                    Use your device location
                </Text>
            </View>
        </Pressable>
    );
}
