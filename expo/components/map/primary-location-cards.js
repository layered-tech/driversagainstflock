import { Pressable, Text, View } from 'react-native';
import { Icon } from '../design-system/icon';
import {
    getPrimaryLocationLabel,
    PRIMARY_LOCATION_HOME,
    PRIMARY_LOCATION_WORK,
} from './primary-locations';

const PRIMARY_LOCATION_CARDS = [
    {
        icon: 'home',
        type: PRIMARY_LOCATION_HOME,
    },
    {
        icon: 'briefcase',
        type: PRIMARY_LOCATION_WORK,
    },
];

export function PrimaryLocationCards({
    onLocationLongPress,
    onLocationPress,
    primaryLocations,
    searchSource,
}) {
    return (
        <View className="flex-row gap-2.5 px-4 pb-2 pt-3.5">
            {PRIMARY_LOCATION_CARDS.map(({ icon, type }) => {
                const label = getPrimaryLocationLabel(type);
                const location = primaryLocations[type];
                const subtitle = location
                    ? location.name || location.address || 'Saved destination'
                    : 'One tap from anywhere';

                return (
                    <Pressable
                        key={type}
                        accessibilityHint={
                            location
                                ? `Loads directions to this saved destination. Long press to unset ${label}.`
                                : `Search for a place to save as ${label}.`
                        }
                        accessibilityLabel={
                            location ? `${label}, ${subtitle}` : `Set ${label}`
                        }
                        accessibilityRole="button"
                        className={`min-w-0 flex-1 gap-2.5 rounded-dafMd border p-3 active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse ${
                            location
                                ? 'dark:border-daf-border-dark dark:bg-daf-surface-dark border-daf-border bg-white'
                                : 'dark:border-daf-border-dark border-dashed border-daf-border-strong bg-transparent'
                        }`}
                        onLongPress={
                            location
                                ? () => onLocationLongPress(type)
                                : undefined
                        }
                        onPress={() => onLocationPress(type)}
                        testID={`map-search-primary-location-${type}-${searchSource}`}
                    >
                        <View
                            className={`h-[34px] w-[34px] items-center justify-center rounded-dafSm ${
                                location
                                    ? 'bg-daf-brand/12 dark:bg-daf-brand/20'
                                    : 'bg-daf-surface-alt dark:bg-daf-surface-inverse'
                            }`}
                        >
                            <Icon
                                color={location ? '#167C47' : '#828D9B'}
                                name={icon}
                                size={18}
                            />
                        </View>

                        <View className="min-w-0">
                            <Text
                                className={`text-[15px] font-semibold ${
                                    location
                                        ? 'text-daf-text-primary dark:text-white'
                                        : 'text-daf-text-brand dark:text-daf-brand'
                                }`}
                                numberOfLines={1}
                            >
                                {location ? label : `Set ${label}`}
                            </Text>
                            <Text
                                className="mt-0.5 text-[12.5px] font-medium text-daf-text-tertiary dark:text-neutral-400"
                                numberOfLines={1}
                            >
                                {subtitle}
                            </Text>
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
}
