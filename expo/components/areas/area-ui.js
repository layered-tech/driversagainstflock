import { router } from 'expo-router';
import {
    ActivityIndicator,
    Pressable,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { DafButton, DafIconButton } from '../design-system/primitives';

export const areaCardClass =
    'rounded-dafLg border border-daf-border bg-white dark:border-daf-border-dark dark:bg-daf-surface-dark';
export function AreaHeader({ title, subtitle, root = false, trailing }) {
    const insets = useSafeAreaInsets();
    const dark = useColorScheme() === 'dark';
    return (
        <View
            className="flex-row items-center gap-2 px-3 pb-3"
            style={{ paddingTop: insets.top + 8 }}
        >
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={root ? 'Back to map' : 'Back'}
                className="h-11 w-9 items-center justify-center"
                onPress={() =>
                    root
                        ? router.replace('/')
                        : router.canGoBack()
                          ? router.back()
                          : router.replace('/areas')
                }
            >
                <Icon
                    name="chevron-left"
                    size={22}
                    color={dark ? '#F5F7F9' : '#11151B'}
                />
            </Pressable>
            <View className="min-w-0 flex-1">
                <Text
                    className="font-dafDisplay text-[22px] font-bold text-daf-text-primary dark:text-white"
                    numberOfLines={1}
                >
                    {title}
                </Text>
                {subtitle ? (
                    <Text
                        className="mt-0.5 text-xs text-daf-text-tertiary dark:text-neutral-400"
                        numberOfLines={1}
                    >
                        {subtitle}
                    </Text>
                ) : null}
            </View>
            {trailing}
        </View>
    );
}
export function AreaError({ message, onRetry }) {
    if (!message) return null;
    return (
        <View
            accessibilityRole="alert"
            className="my-3 gap-2 rounded-dafMd border border-daf-alert/30 bg-daf-alert/10 p-4"
        >
            <Text className="text-[13px] text-daf-alert">{message}</Text>
            {onRetry ? (
                <DafButton variant="secondary" onPress={onRetry}>
                    Try again
                </DafButton>
            ) : null}
        </View>
    );
}
export function AreaLoading() {
    return (
        <View className="p-8">
            <ActivityIndicator color="#1FBF6B" />
        </View>
    );
}
export function AreaPrivacy({ alerts = false }) {
    return (
        <View className="flex-row items-start gap-2 py-4">
            <Icon name="shield-check" color="#828D9B" size={16} />
            <Text className="min-w-0 flex-1 text-xs leading-[18px] text-daf-text-tertiary dark:text-neutral-400">
                {alerts
                    ? 'Pushes go to this phone through an anonymous device token. No account or email needed.'
                    : 'No account needed. Your areas are tied to this phone. We store the boundaries and alert settings anonymously to check for changes. Stop watching to delete an area.'}
            </Text>
        </View>
    );
}
export function AreaAddButton() {
    return (
        <DafIconButton
            icon="plus"
            accessibilityLabel="Add an area"
            tone="brand"
            selected
            testID="areas-add-button"
            onPress={() => router.push('/areas/add')}
        />
    );
}
