import { useDuoPaneContent } from '../root/duo-device-context';
import { DuoText as Text } from '../design-system/duo-typography';
import {
    FullWidthSafeAreaBand,
    NativeNavigationAction,
    useDuoRailEdge,
} from '../root/native-navigation';
import { Platform, Pressable, useColorScheme, View } from 'react-native';
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

export function ContributePageHeader({
    onBack,
    badge,
    testID,
    title,
    onLayout,
}) {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const railEdge = useDuoRailEdge();
    const inDuoPane = useDuoPaneContent();
    const isDarkMode = colorScheme === 'dark';
    const headerPaddingTop =
        Platform.OS === 'ios'
            ? Math.max(insets.top + 10, railEdge || inDuoPane ? 14 : 54)
            : Math.max(insets.top + 10, 16);

    return (
        <FullWidthSafeAreaBand
            gutter={12}
            className="flex-row items-center gap-1.5 border-b border-daf-border bg-white pb-3 dark:border-daf-border-dark dark:bg-daf-surface-dark"
            style={{ paddingTop: headerPaddingTop }}
            testID={testID}
            onLayout={onLayout}
        >
            <NativeNavigationAction railOnly kind="back" priority={100}>
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
            </NativeNavigationAction>
            <Text
                className="min-w-0 flex-1 font-dafDisplay text-[18px] font-bold leading-6 text-daf-text-primary dark:text-white"
                numberOfLines={1}
            >
                {title}
            </Text>
            {badge ? <ContributeStepPill>{badge}</ContributeStepPill> : null}
        </FullWidthSafeAreaBand>
    );
}
