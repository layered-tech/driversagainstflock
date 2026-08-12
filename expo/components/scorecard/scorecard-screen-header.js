import { router, useNavigation } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { dafSemanticColors } from '../design-system/tokens';
import { toggleNearestDrawer } from '../map/navigation';

export function ScorecardScreenHeader({
    back = false,
    backRoute = null,
    operatorView = false,
    subtitle,
    title,
    trailing,
}) {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const paddingTop =
        Platform.OS === 'ios'
            ? Math.max(insets.top + 10, 54)
            : Math.max(insets.top + 10, 16);
    const iconColor = operatorView ? '#A9B2BD' : dafSemanticColors.speedOk;

    return (
        <View
            className={`flex-row items-center gap-2.5 border-b px-4 pb-2.5 ${
                operatorView
                    ? 'border-[#262E37] bg-[#161B22]'
                    : 'dark:border-daf-border-dark dark:bg-daf-surface-dark border-daf-border bg-white'
            }`}
            style={{ paddingTop }}
        >
            <Pressable
                accessibilityLabel={back ? 'Go back' : 'Open menu'}
                accessibilityRole="button"
                className="h-hitMin w-hitMin items-center justify-center rounded-dafPill active:opacity-60"
                hitSlop={4}
                onPress={() => {
                    if (!back) {
                        toggleNearestDrawer(navigation);
                    } else if (backRoute) {
                        navigation.popTo(backRoute);
                    } else {
                        router.back();
                    }
                }}
            >
                <Icon
                    color={iconColor}
                    name={back ? 'chevron-left' : 'menu'}
                    size={22}
                />
            </Pressable>
            <View className="min-w-0 flex-1">
                <Text
                    className={`font-dafDisplay text-lg font-bold ${
                        operatorView
                            ? 'text-white'
                            : 'text-daf-text-primary dark:text-white'
                    }`}
                    numberOfLines={1}
                >
                    {title}
                </Text>
                {subtitle ? (
                    <Text
                        className={`font-dafMono text-[11.5px] ${
                            operatorView
                                ? 'text-daf-alert'
                                : 'text-daf-text-tertiary dark:text-neutral-400'
                        }`}
                        numberOfLines={1}
                    >
                        {subtitle}
                    </Text>
                ) : null}
            </View>
            {trailing ?? (
                <Icon
                    color={iconColor}
                    name="lock"
                    size={19}
                    title="Encrypted on this device"
                />
            )}
        </View>
    );
}

export function ScorecardPrivacyFooter({ operatorView = false }) {
    return (
        <View className="flex-row items-start gap-2 px-0.5 pt-1">
            <Icon
                color={operatorView ? '#828D9B' : dafSemanticColors.speedOk}
                name="shield-check"
                size={15}
            />
            <Text
                className={`min-w-0 flex-1 text-xs leading-[18px] ${
                    operatorView
                        ? 'text-[#828D9B]'
                        : 'text-daf-text-tertiary dark:text-neutral-400'
                }`}
            >
                Computed and encrypted on this phone. Scorecard details remain
                on this device until you delete them.
            </Text>
        </View>
    );
}
