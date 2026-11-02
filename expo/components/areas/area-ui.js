import {
    NativeNavigationAction,
    useDuoRailEdge,
} from '../root/native-navigation';
import { router } from 'expo-router';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    Text,
    useColorScheme,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { DafButton } from '../design-system/primitives';
import { areaTextClassName } from './area-typography';
import { useDuoDevice } from '../root/duo-device-context';
import { getDuoPaneLayout } from '../map/duo-bottom-sheet-layout';
import { getTabletPaneLayout } from '../map/responsive-map-layout';

export function AreaText({ className = '', ...props }) {
    return <Text {...props} className={areaTextClassName(className)} />;
}

export function AreaButton({ className = '', variant = 'primary', ...props }) {
    return (
        <DafButton
            {...props}
            variant={variant}
            className={`${variant === 'ghost' ? '' : 'shadow-areaControl'} ${variant === 'secondary' ? 'dark:!bg-[#1A2027]' : ''} ${className}`}
            textClassName="font-areaSemibold"
        />
    );
}

export const AREA_WINDOWS = [
    { value: '24h', label: '24h' },
    { value: '7', label: '7 days' },
    { value: '30', label: '30 days' },
];

export function AreaBadge({ children, tone = 'neutral', kind = false }) {
    return (
        <View
            className={`self-start rounded-dafPill ${kind ? 'border border-daf-border px-[7px] py-[2px] dark:border-daf-border-dark' : tone === 'alert' ? 'bg-daf-alert/10 px-[10px] py-[4px]' : tone === 'brand' ? 'bg-daf-brand/10 px-[10px] py-[4px] dark:bg-daf-brand/[0.16]' : 'bg-daf-surface-alt px-[10px] py-[4px] dark:bg-[#1A2027]'}`}
        >
            <AreaText
                className={
                    kind
                        ? 'font-dafMono text-[9px] font-bold uppercase tracking-[0.72px] text-daf-text-secondary dark:text-[#A9B2BD]'
                        : `text-[12px] font-semibold ${tone === 'alert' ? 'text-[#E5383B] ' : tone === 'brand' ? 'text-daf-text-brand dark:text-daf-brand-hover' : 'text-daf-text-secondary dark:text-[#A9B2BD]'}`
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
            className={`flex-row rounded-dafPill border border-daf-border bg-daf-surface-alt p-[4px] dark:border-daf-border-dark dark:bg-[#1A2027] ${compact ? 'w-[180px]' : 'w-full'} ${className}`}
        >
            {options.map((option) => (
                <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: value === option.value }}
                    className={`flex-1 items-center justify-center rounded-dafPill ${compact ? 'min-h-[28px]' : 'min-h-[40px]'} ${value === option.value ? 'bg-white shadow-areaControl dark:bg-daf-surface-dark' : 'shadow-none'}`}
                    onPress={() => onChange(option.value)}
                    testID={
                        testIDPrefix
                            ? `${testIDPrefix}-${option.value}`
                            : undefined
                    }
                    hitSlop={compact ? { top: 10, bottom: 10 } : undefined}
                >
                    <AreaText
                        className={`${compact ? 'text-[12px]' : 'text-[13px]'} font-semibold ${value === option.value ? 'text-daf-text-primary dark:text-daf-text-inverse' : 'text-daf-text-tertiary'}`}
                        numberOfLines={1}
                    >
                        {option.label}
                    </AreaText>
                </Pressable>
            ))}
        </View>
    );
}

export function AreaSheet({
    title,
    subtitle,
    children,
    onLayout,
    testID,
    leading,
    trailing,
}) {
    const insets = useSafeAreaInsets();
    const railEdge = useDuoRailEdge();
    const duoDevice = useDuoDevice();
    const { width, height } = useWindowDimensions();
    const pane = Platform?.isPad
        ? getTabletPaneLayout(width, insets)
        : duoDevice
          ? getDuoPaneLayout(width, insets)
          : null;
    return (
        <View
            className={`max-h-[75%] overflow-hidden border-daf-border-glass bg-white shadow-areaSheet dark:border-daf-border-glass-dark dark:bg-[#11151B] dark:shadow-areaSheetDark ${duoDevice || pane ? 'rounded-dafXl border' : 'rounded-t-dafSheet border-t'}`}
            style={
                railEdge || pane
                    ? {
                          marginLeft: pane ? pane.left : insets.left,
                          marginRight: pane ? pane.right : insets.right,
                          maxHeight: pane ? height - insets.top - 28 : '66%',
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: pane ? insets.top + 14 : undefined,
                          bottom: pane ? undefined : 0,
                      }
                    : undefined
            }
            onLayout={onLayout}
            testID={testID}
        >
            <ScrollView
                className="grow-0"
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                    paddingBottom: duoDevice || pane ? 20 : insets.bottom + 20,
                    paddingLeft: railEdge || pane ? 0 : insets.left,
                    paddingRight: railEdge || pane ? 0 : insets.right,
                }}
            >
                <View
                    className={`px-[16px] ${pane ? 'pt-[18px]' : 'pt-[8px]'}`}
                >
                    {!pane ? (
                        <View className="mb-[12px] h-[5px] w-[32px] self-center rounded-full bg-daf-border-strong dark:bg-[#3A434E]" />
                    ) : null}
                    <View
                        className={`${subtitle ? 'mb-[14px]' : ''} flex-row items-start gap-2`}
                    >
                        {leading}
                        <View className="min-w-0 flex-1">
                            <AreaText className="font-dafDisplay text-[21px] font-bold tracking-[-0.42px] text-daf-text-primary dark:text-daf-text-inverse">
                                {title}
                            </AreaText>
                            {subtitle ? (
                                <AreaText className="mt-[2px] text-[13px] text-daf-text-secondary dark:text-[#A9B2BD]">
                                    {subtitle}
                                </AreaText>
                            ) : null}
                        </View>
                        {trailing}
                    </View>
                    {children}
                </View>
            </ScrollView>
        </View>
    );
}

export const areaCardClass =
    'rounded-dafLg border border-daf-border bg-white dark:border-daf-border-dark dark:bg-daf-surface-dark';
export function AreaHeader({
    title,
    subtitle,
    root = false,
    trailing,
    onLayout,
}) {
    const insets = useSafeAreaInsets();
    const railEdge = useDuoRailEdge();
    const dark = useColorScheme() === 'dark';
    return (
        <View
            onLayout={onLayout}
            className="flex-row items-center gap-[4px] px-[10px] pb-[6px]"
            style={{
                paddingTop: insets.top + (railEdge ? 18 : 8),
                paddingLeft: railEdge ? 16 : 10,
            }}
        >
            <NativeNavigationAction railOnly kind="back" symbol="chevron.left">
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={root ? 'Back to map' : 'Back'}
                    className="h-[40px] w-[40px] items-center justify-center"
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
            </NativeNavigationAction>
            <View className="min-w-0 flex-1">
                <AreaText
                    className="font-dafDisplay text-[22px] font-bold leading-[25px] tracking-[-0.44px] text-daf-text-primary dark:text-daf-text-inverse"
                    numberOfLines={1}
                >
                    {title}
                </AreaText>
                {subtitle ? (
                    <AreaText
                        className="mt-0.5 text-xs text-daf-text-tertiary dark:text-daf-text-tertiary"
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
            <AreaText className="min-w-0 flex-1 text-xs leading-[18px] text-daf-text-tertiary dark:text-daf-text-tertiary">
                {alerts
                    ? 'Pushes go to this phone through an anonymous device token. No account or email needed.'
                    : 'No account needed. Your areas are tied to this phone. We store the boundaries and alert settings anonymously to check for changes. Stop watching to delete an area.'}
            </AreaText>
        </View>
    );
}
export function AreaAddButton() {
    return (
        <NativeNavigationAction railOnly kind="tool" symbol="plus">
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add an area"
                className="h-[40px] w-[40px] items-center justify-center rounded-full bg-daf-brand/10"
                testID="areas-add-button"
                onPress={() => router.push('/areas/add')}
            >
                <Icon name="plus" color="#0F7D45" size={20} />
            </Pressable>
        </NativeNavigationAction>
    );
}
