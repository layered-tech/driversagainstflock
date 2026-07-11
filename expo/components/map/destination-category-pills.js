import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import {
    MAP_OVERLAY_LAYOUT_ANIMATION,
    SEARCH_RESULTS_ENTER_ANIMATION,
    SEARCH_RESULTS_EXIT_ANIMATION,
} from './layout-animations';

const DESTINATION_CATEGORIES = [
    {
        key: 'restaurants',
        label: 'Restaurants',
        query: 'restaurants',
    },
    {
        key: 'gas',
        label: 'Gas',
        query: 'gas stations',
    },
    {
        key: 'coffee',
        label: 'Coffee',
        query: 'coffee',
    },
    {
        key: 'hotels',
        label: 'Hotels',
        query: 'hotels',
    },
    {
        key: 'groceries',
        label: 'Groceries',
        query: 'grocery stores',
    },
    {
        key: 'parking',
        label: 'Parking',
        query: 'parking',
    },
];

export function DestinationCategoryPills({ onCategoryPress, searchSource }) {
    return (
        <Animated.View
            entering={SEARCH_RESULTS_ENTER_ANIMATION}
            exiting={SEARCH_RESULTS_EXIT_ANIMATION}
            className="z-50 min-w-0 flex-1 pr-[30px]"
            collapsable={false}
            layout={MAP_OVERLAY_LAYOUT_ANIMATION}
            pointerEvents="box-none"
            testID={`map-destination-categories-${searchSource}`}
        >
            <View className="flex-row flex-wrap items-start gap-x-2 gap-y-[8px] pr-[30px]">
                {DESTINATION_CATEGORIES.map((category) => (
                    <Pressable
                        key={category.key}
                        accessible
                        accessibilityLabel={`Search for ${category.label}`}
                        accessibilityRole="button"
                        className="dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/80 h-[30px] flex-row items-center rounded-dafPill border border-daf-border-glass bg-white/80 px-3 active:opacity-[0.82]"
                        collapsable={false}
                        onPress={() => onCategoryPress(category.query)}
                        testID={`map-destination-category-${category.key}-${searchSource}`}
                    >
                        <Text
                            className="text-[13px] font-medium leading-[17px] text-daf-text-primary dark:text-neutral-100"
                            numberOfLines={1}
                        >
                            {category.label}
                        </Text>
                    </Pressable>
                ))}
            </View>
        </Animated.View>
    );
}
