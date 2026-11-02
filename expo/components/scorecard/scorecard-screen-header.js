import { useDuoPaneContent } from '../root/duo-device-context';
import { DuoText as Text } from '../design-system/duo-typography';
import {
    FullWidthSafeAreaBand,
    NativeNavigationAction,
    useDuoRailEdge,
} from '../root/native-navigation';
import { router, useNavigation } from 'expo-router';
import { Platform, Pressable, View } from 'react-native';
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
    onLayout,
}) {
    const insets = useSafeAreaInsets();
    const railEdge = useDuoRailEdge();
    const inDuoPane = useDuoPaneContent();
    const navigation = useNavigation();
    const paddingTop =
        Platform.OS === 'ios'
            ? Math.max(insets.top + 10, railEdge || inDuoPane ? 14 : 54)
            : Math.max(insets.top + 10, 16);
    const iconColor = operatorView ? '#A9B2BD' : dafSemanticColors.speedOk;

    return (
        <FullWidthSafeAreaBand
            gutter={16}
            className={`flex-row items-center gap-2.5 border-b pb-2.5 ${
                operatorView
                    ? 'border-[#262E37] bg-[#161B22]'
                    : 'border-daf-border bg-white dark:border-daf-border-dark dark:bg-daf-surface-dark'
            }`}
            style={{ paddingTop }}
            onLayout={onLayout}
        >
            <NativeNavigationAction
                railOnly
                kind={back ? 'back' : 'tool'}
                symbol={back ? 'chevron.left' : 'line.3.horizontal'}
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
            </NativeNavigationAction>
            <View className="min-w-0 flex-1">
                <Text
                    className={`font-dafDisplay text-[18px] font-bold ${
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
        </FullWidthSafeAreaBand>
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
                className={`min-w-0 flex-1 text-[12px] leading-[18px] ${
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
