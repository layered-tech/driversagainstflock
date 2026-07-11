import { Platform, Pressable, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';

export function ContributeStepPill({ step }) {
    return (
        <View className="dark:border-daf-border-dark h-[26px] items-center justify-center rounded-dafPill border border-daf-border bg-daf-surface-alt px-[9px] dark:bg-daf-surface-inverse">
            <Text
                className="font-dafMono text-[11px] font-semibold tracking-[0.04em] text-daf-text-secondary dark:text-neutral-300"
                numberOfLines={1}
            >
                Step {step} of 4
            </Text>
        </View>
    );
}

export function ContributePageHeader({ onBack, step, testID, title }) {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const isDarkMode = colorScheme === 'dark';
    const headerPaddingTop =
        Platform.OS === 'ios'
            ? Math.max(insets.top + 10, 54)
            : Math.max(insets.top + 10, 16);

    return (
        <View
            className="dark:border-daf-border-dark dark:bg-daf-surface-dark flex-row items-center gap-1.5 border-b border-daf-border bg-white px-3 pb-3"
            style={{ paddingTop: headerPaddingTop }}
            testID={testID}
        >
            <Pressable
                accessibilityLabel="Back"
                accessibilityRole="button"
                className="h-10 w-10 items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
                hitSlop={6}
                onPress={onBack}
                testID="contribute-back-button"
            >
                <Icon
                    color={isDarkMode ? '#F4F7FA' : '#0B0E12'}
                    name="chevron-left"
                    size={20}
                />
            </Pressable>
            <Text
                className="font-dafDisplay min-w-0 flex-1 text-lg font-bold leading-6 text-daf-text-primary dark:text-white"
                numberOfLines={1}
            >
                {title}
            </Text>
            <ContributeStepPill step={step} />
        </View>
    );
}
