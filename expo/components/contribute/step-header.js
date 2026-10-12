import { Platform, Pressable, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';

export function ContributeStepPill({ children }) {
    return (
        <View className="h-[26px] items-center justify-center rounded-dafPill bg-daf-brand/15 px-[9px]">
            <Text
                className="font-dafMono text-[11px] font-semibold tracking-[0.04em] text-daf-text-brand dark:text-daf-brand"
                numberOfLines={1}
            >
                {children}
            </Text>
        </View>
    );
}

export function ContributePageHeader({ onBack, badge, testID, title }) {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const isDarkMode = colorScheme === 'dark';
    const headerPaddingTop =
        Platform.OS === 'ios'
            ? Math.max(insets.top + 10, 54)
            : Math.max(insets.top + 10, 16);

    return (
        <View
            className="flex-row items-center gap-1.5 border-b border-daf-border bg-white px-3 pb-3 dark:border-daf-border-dark dark:bg-daf-surface-dark"
            style={{ paddingTop: headerPaddingTop }}
            testID={testID}
        >
            <Pressable
                accessibilityLabel="Back"
                accessibilityRole="button"
                className="h-[50px] w-[50px] items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-inverse"
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
                className="min-w-0 flex-1 font-dafDisplay text-[18px] font-bold leading-6 text-daf-text-primary dark:text-white"
                numberOfLines={1}
            >
                {title}
            </Text>
            {badge ? <ContributeStepPill>{badge}</ContributeStepPill> : null}
        </View>
    );
}
