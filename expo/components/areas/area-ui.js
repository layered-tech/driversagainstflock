import { router } from 'expo-router';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { DafButton } from '../design-system/primitives';
import { areaTextClassName } from './area-typography';

export function AreaText({ className = '', ...props }) {
    return <Text {...props} className={areaTextClassName(className)} />;
}

export function AreaButton(props) {
    return <DafButton {...props} textClassName="font-areaSemibold" />;
}

export function AreaBadge({ children, tone = 'neutral', kind = false }) {
    return (
        <View
            className={`self-start rounded-dafPill ${kind ? 'border border-daf-border px-[7px] py-[2px] dark:border-daf-border-dark' : tone === 'alert' ? 'bg-daf-alert/10 px-[10px] py-[4px]' : tone === 'brand' ? 'bg-daf-brand/10 px-[10px] py-[4px]' : 'bg-daf-surface-alt px-[10px] py-[4px] dark:bg-daf-surface-dark'}`}
        >
            <AreaText
                className={
                    kind
                        ? 'font-dafMono text-[9px] font-bold uppercase tracking-[0.72px] text-daf-text-secondary dark:text-neutral-300'
                        : `text-[12px] font-semibold ${tone === 'alert' ? 'text-[#E5383B] dark:text-daf-alert' : tone === 'brand' ? 'text-daf-text-brand dark:text-daf-brand' : 'text-daf-text-secondary dark:text-neutral-300'}`
                }
            >
                {children}
            </AreaText>
        </View>
    );
}

export function AreaSegmentedControl({
    options,
    value,
    onChange,
    compact = false,
    testIDPrefix,
    className = '',
}) {
    return (
        <View
            className={`flex-row rounded-dafPill border border-daf-border bg-daf-surface-alt p-[4px] dark:border-daf-border-dark dark:bg-daf-surface-dark ${compact ? 'w-[170px]' : 'w-full'} ${className}`}
        >
            {options.map((option) => (
                <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: value === option.value }}
                    className={`flex-1 items-center justify-center rounded-dafPill ${compact ? 'min-h-[24px]' : 'min-h-[30px]'} ${value === option.value ? 'bg-white dark:bg-daf-surface-inverse' : ''}`}
                    onPress={() => onChange(option.value)}
                    testID={
                        testIDPrefix
                            ? `${testIDPrefix}-${option.value}`
                            : undefined
                    }
                    hitSlop={compact ? { top: 10, bottom: 10 } : undefined}
                >
                    <AreaText
                        className={`${compact ? 'text-[11px]' : 'text-[13px]'} font-semibold ${value === option.value ? 'text-daf-text-primary dark:text-white' : 'text-daf-text-secondary dark:text-neutral-300'}`}
                        numberOfLines={1}
                    >
                        {option.label}
                    </AreaText>
                </Pressable>
            ))}
        </View>
    );
}

export function AreaSheet({ title, subtitle, children, onLayout, testID }) {
    const insets = useSafeAreaInsets();
    return (
        <View
            className="max-h-[75%] overflow-hidden rounded-t-dafSheet border-t border-daf-border-glass bg-white dark:border-daf-border-glass-dark dark:bg-daf-surface-dark"
            onLayout={onLayout}
            testID={testID}
        >
            <ScrollView
                className="grow-0"
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            >
                <View className="px-[16px] pt-[8px]">
                    <View className="mb-[12px] h-[5px] w-[36px] self-center rounded-full bg-daf-border-strong dark:bg-daf-border-dark" />
                    <AreaText className="font-dafDisplay text-[21px] font-bold tracking-[-0.42px] text-daf-text-primary dark:text-white">
                        {title}
                    </AreaText>
                    {subtitle ? (
                        <AreaText className="mb-[14px] mt-[2px] text-[13px] text-daf-text-secondary dark:text-neutral-300">
                            {subtitle}
                        </AreaText>
                    ) : null}
                    {children}
                </View>
            </ScrollView>
        </View>
    );
}

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
                <AreaText
                    className="font-dafDisplay text-[22px] font-bold text-daf-text-primary dark:text-white"
                    numberOfLines={1}
                >
                    {title}
                </AreaText>
                {subtitle ? (
                    <AreaText
                        className="mt-0.5 text-xs text-daf-text-tertiary dark:text-neutral-400"
                        numberOfLines={1}
                    >
                        {subtitle}
                    </AreaText>
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
            <AreaText className="text-[13px] text-daf-alert">
                {message}
            </AreaText>
            {onRetry ? (
                <AreaButton variant="secondary" onPress={onRetry}>
                    Try again
                </AreaButton>
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
            <AreaText className="min-w-0 flex-1 text-xs leading-[18px] text-daf-text-tertiary dark:text-neutral-400">
                {alerts
                    ? 'Pushes go to this phone through an anonymous device token. No account or email needed.'
                    : 'No account needed. Your areas are tied to this phone. We store the boundaries and alert settings anonymously to check for changes. Stop watching to delete an area.'}
            </AreaText>
        </View>
    );
}
export function AreaAddButton() {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add an area"
            className="h-[40px] w-[40px] items-center justify-center rounded-full bg-daf-brand/10"
            testID="areas-add-button"
            onPress={() => router.push('/areas/add')}
        >
            <Icon name="plus" color="#0F7D45" size={20} />
        </Pressable>
    );
}
