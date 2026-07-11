import { Pressable, Text, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { formatSavedLocationDescription } from './saved-locations';

export function SavedLocationSection({
    icon,
    items,
    label,
    onLocationPress,
    searchIconColor,
    searchSource,
    sectionKey,
}) {
    if (!items.length) {
        return null;
    }

    return (
        <View>
            <Text className="px-4 pb-1.5 pt-3.5 text-[11px] font-bold uppercase tracking-[0.06em] text-daf-text-tertiary dark:text-neutral-400">
                {label}
            </Text>

            <View>
                {items.map((location, index) => {
                    const description =
                        formatSavedLocationDescription(location);
                    const iconIsNeutral = sectionKey.includes('recent');

                    return (
                        <Pressable
                            key={`${sectionKey}-${location.placeId || location.id}-${index}`}
                            accessibilityLabel={[
                                `Use ${location.name}`,
                                description,
                            ]
                                .filter(Boolean)
                                .join(', ')}
                            accessibilityRole="button"
                            className="flex-row items-center gap-[13px] rounded-dafMd px-4 py-2.5 active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                            onPress={() => onLocationPress(location)}
                            testID={`map-search-${sectionKey}-location-${index}-${searchSource}`}
                        >
                            <View
                                className={`h-[38px] w-[38px] items-center justify-center rounded-dafSm ${
                                    iconIsNeutral
                                        ? 'bg-daf-surface-alt dark:bg-daf-surface-inverse'
                                        : 'bg-daf-brand/12 dark:bg-daf-brand/20'
                                }`}
                            >
                                <Icon
                                    color={
                                        iconIsNeutral
                                            ? searchIconColor
                                            : '#167C47'
                                    }
                                    name={icon}
                                    size={19}
                                />
                            </View>

                            <View className="min-w-0 flex-1">
                                <Text
                                    className="text-[15px] font-semibold text-daf-text-primary dark:text-white"
                                    numberOfLines={1}
                                >
                                    {location.name}
                                </Text>
                                {description ? (
                                    <Text
                                        className="mt-0.5 text-[13px] font-medium text-daf-text-tertiary dark:text-neutral-400"
                                        numberOfLines={1}
                                    >
                                        {description}
                                    </Text>
                                ) : null}
                            </View>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}
