import { Text, View } from 'react-native';
import { Icon } from '../design-system/icon';

export function RouteWaypoint({
    iconColor,
    label,
    subtitle,
    subtitleTestID,
    title,
    titleTestID,
}) {
    return (
        <View className="flex-row items-start gap-3">
            <View className="bg-daf-brand/12 dark:bg-daf-brand/20 mt-0.5 h-8 w-8 items-center justify-center rounded-[16px]">
                <Icon color={iconColor} name="map-pin" size={13} />
            </View>
            <View className="min-w-0 flex-1">
                <Text className="text-xs font-bold uppercase text-daf-text-tertiary dark:text-neutral-400">
                    {label}
                </Text>
                <Text
                    className="mt-0.5 text-sm font-semibold leading-5 text-daf-text-primary dark:text-white"
                    numberOfLines={2}
                    testID={titleTestID}
                >
                    {title}
                </Text>
                {subtitle ? (
                    <Text
                        className="mt-0.5 text-xs font-medium leading-4 text-daf-text-tertiary dark:text-neutral-400"
                        numberOfLines={2}
                        testID={subtitleTestID}
                    >
                        {subtitle}
                    </Text>
                ) : null}
            </View>
        </View>
    );
}
