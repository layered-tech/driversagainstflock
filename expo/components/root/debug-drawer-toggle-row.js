import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { Switch, Text, View } from 'react-native';

export function DebugDrawerToggleRow({
    iconColor,
    isDarkMode,
    isEnabled,
    item,
    onValueChange,
}) {
    return (
        <View className="flex-row items-center gap-3 rounded-md border border-neutral-200 bg-white px-3 py-3 dark:border-neutral-800 dark:bg-neutral-900">
            <View className="h-9 w-9 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-800">
                <FontAwesomeIcon color={iconColor} icon={item.icon} size={16} />
            </View>
            <View className="min-w-0 flex-1">
                <Text
                    className="text-sm font-semibold text-neutral-950 dark:text-white"
                    numberOfLines={1}
                >
                    {item.label}
                </Text>
            </View>
            <Switch
                accessibilityLabel={`${item.label} debug overlay`}
                ios_backgroundColor={isDarkMode ? '#525252' : '#d4d4d4'}
                onValueChange={onValueChange}
                thumbColor="#ffffff"
                trackColor={{
                    false: isDarkMode ? '#525252' : '#d4d4d4',
                    true: '#2563eb',
                }}
                value={isEnabled}
                testID={item.testID}
            />
        </View>
    );
}
