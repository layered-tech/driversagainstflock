import { Pressable, View } from 'react-native';
import { Icon } from '../design-system/icon';
import { HighlightedSearchText } from './highlighted-search-text';
import { formatSearchResultDistance } from './search-formatters';

export function PlaceSearchResultRow({
    highlightQuery,
    index,
    onPress,
    result,
    searchSource,
    testIDPrefix,
}) {
    const distanceLabel = formatSearchResultDistance(result.distanceMeters);
    const subtitle = [distanceLabel, result.secondaryText]
        .filter(Boolean)
        .join(' - ');
    const accessibilityLabel = [
        `Use ${result.label}`,
        distanceLabel ? `${distanceLabel} away` : '',
    ]
        .filter(Boolean)
        .join(', ');

    return (
        <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            className="flex-row items-center gap-[13px] rounded-dafMd px-4 py-2.5 active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
            onPress={() => onPress(result)}
            testID={`${testIDPrefix}-${index}-${searchSource}`}
        >
            <View className="h-[38px] w-[38px] items-center justify-center rounded-dafSm bg-daf-violet">
                <Icon color="#ffffff" name="map-pin" size={20} />
            </View>

            <View className="min-w-0 flex-1">
                <HighlightedSearchText
                    className="text-sm font-semibold text-daf-text-primary dark:text-white"
                    highlightQuery={highlightQuery}
                    numberOfLines={1}
                >
                    {result.primaryText}
                </HighlightedSearchText>
                {subtitle ? (
                    <HighlightedSearchText
                        className="mt-0.5 text-xs font-medium text-daf-text-tertiary dark:text-neutral-400"
                        highlightQuery={highlightQuery}
                        numberOfLines={1}
                    >
                        {subtitle}
                    </HighlightedSearchText>
                ) : null}
            </View>
        </Pressable>
    );
}
