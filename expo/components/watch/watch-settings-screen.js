import { requireOptionalNativeModule } from 'expo';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    Platform,
    Pressable,
    ScrollView,
    Switch,
    ToastAndroid,
    useColorScheme,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { DuoText as Text } from '../design-system/duo-typography';
import { dafThemes } from '../design-system/tokens';
import {
    NativeWindBottomSheet,
    NativeWindBottomSheetScrollView,
} from '../map/native-components';
import { getTabletPaneLayout } from '../map/responsive-map-layout';
import { useDuoDevice } from '../root/duo-device-context';
import { NativeNavigationAction } from '../root/native-navigation';
import { useConnectedWatch } from './use-connected-watch';
import {
    loadWatchHapticPreferences,
    setWatchHapticsEnabled,
    subscribeWatchHaptics,
    watchHapticsEnabled,
} from './watch-haptic-preferences';
import {
    getWatchCameraPreferences,
    loadWatchCameraPreferences,
    setWatchCameraPreferences,
    subscribeWatchCameraPreferences,
} from './watch-camera-preferences';

const cardClassName =
    'overflow-hidden rounded-dafLg border border-daf-border bg-white dark:border-daf-border-dark dark:bg-daf-surface-dark';
const titleClassName =
    'text-[15px] font-semibold leading-[20px] text-daf-text-primary dark:text-daf-text-inverse';
const captionClassName = 'text-[12px] leading-[17px] text-daf-text-tertiary';

function SettingCopy({ title, children }) {
    return (
        <View className="min-w-0 flex-1 gap-[3px]">
            <Text className={titleClassName}>{title}</Text>
            <Text className={captionClassName}>{children}</Text>
        </View>
    );
}

function SettingSection({ title, children }) {
    return (
        <View className="gap-2">
            <Text className="px-1 text-[11px] uppercase tracking-[0.66px] text-daf-text-tertiary">
                {title}
            </Text>
            {children}
        </View>
    );
}

export function WatchSettingsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const duo = useDuoDevice();
    const pane =
        duo || Platform.isPad ? getTabletPaneLayout(width, insets) : null;
    const sheet = duo && !pane;
    const overMap = Boolean(pane) || sheet;
    const isFocused = useIsFocused();
    const watchConnected = useConnectedWatch(isFocused);
    const theme =
        useColorScheme() === 'dark' ? dafThemes.dark : dafThemes.light;
    const appleWatch = Platform.OS === 'ios';
    const [enabled, setEnabled] = useState(watchHapticsEnabled);
    const [cameraPreferences, setCameraPreferences] = useState(
        getWatchCameraPreferences,
    );
    const [openingPreview, setOpeningPreview] = useState(false);
    const previewDisabled = !watchConnected || openingPreview;
    const close = () =>
        router.canGoBack() ? router.back() : router.replace('/');
    const saveFailed = () =>
        Alert.alert('Could not save', 'Try changing this setting again.');

    useEffect(() => {
        const unsubscribe = subscribeWatchHaptics(setEnabled);
        loadWatchHapticPreferences().catch(() => {});
        return unsubscribe;
    }, []);
    useEffect(() => {
        const unsubscribe =
            subscribeWatchCameraPreferences(setCameraPreferences);
        loadWatchCameraPreferences().catch(() => {});
        return unsubscribe;
    }, []);

    const openPreview = async () => {
        const transport = ['android', 'ios'].includes(Platform.OS)
            ? requireOptionalNativeModule('WatchCompanion')
            : null;
        if (previewDisabled || !transport?.openHapticsOnWatch) return;
        setOpeningPreview(true);
        try {
            await transport.openHapticsOnWatch();
            if (Platform.OS === 'android') {
                ToastAndroid.show('Check your wrist.', ToastAndroid.SHORT);
            } else {
                Alert.alert('Check your wrist.');
            }
        } catch {
            Alert.alert(
                'Watch not connected',
                'Connect your watch and try again.',
            );
        } finally {
            setOpeningPreview(false);
        }
    };

    const header = (
        <View
            className={
                overMap
                    ? 'flex-row items-start gap-2 px-4 pb-4 pt-3.5'
                    : 'flex-row items-center gap-3 px-5 pb-5'
            }
            style={
                overMap
                    ? undefined
                    : { paddingTop: Math.max(insets.top + 10, 16) }
            }
        >
            {!overMap ? (
                <Pressable
                    accessibilityLabel="Back"
                    accessibilityRole="button"
                    className="min-h-11 w-6 items-center justify-center"
                    onPress={close}
                >
                    <Icon
                        color={theme.text.secondary}
                        name="chevron-left"
                        size={24}
                    />
                </Pressable>
            ) : null}
            <View className="min-w-0 flex-1 gap-0.5">
                <Text
                    accessibilityRole="header"
                    className="font-dafDisplay text-[22px] font-bold leading-[27px] tracking-[-0.44px] text-daf-text-primary dark:text-daf-text-inverse"
                >
                    {appleWatch ? 'Apple Watch' : 'Watch'}
                </Text>
                {overMap ? (
                    <Text className="text-[13px] text-daf-text-secondary dark:text-[#A9B2BD]">
                        Haptics and camera alerts on your wrist
                    </Text>
                ) : null}
            </View>
            {overMap ? (
                <NativeNavigationAction kind="close" railOnly onPress={close}>
                    <Pressable
                        accessibilityLabel="Close watch settings"
                        accessibilityRole="button"
                        className="h-11 w-11 items-center justify-center rounded-dafPill active:bg-daf-surface-alt dark:active:bg-daf-surface-dark"
                        onPress={close}
                        testID="watch-settings-close"
                    >
                        <Icon color={theme.text.secondary} name="x" size={20} />
                    </Pressable>
                </NativeNavigationAction>
            ) : null}
        </View>
    );
    const content = (
        <View className="gap-6">
            <View
                className={`${cardClassName} flex-row items-center gap-3.5 px-4 py-3.5`}
                testID="watch-connection-card"
            >
                <View className="h-11 w-11 shrink-0 items-center justify-center rounded-dafMd bg-daf-brand/10 dark:bg-daf-brand/15">
                    <Icon color={theme.text.brand} name="watch" size={22} />
                </View>
                <View className="min-w-0 flex-1 gap-[3px]">
                    <Text className={titleClassName}>
                        {appleWatch ? 'DAF on Apple Watch' : 'DAF on Wear OS'}
                    </Text>
                    <Text className={captionClassName}>
                        {watchConnected
                            ? 'Connected to your phone'
                            : 'Connect your watch to your phone'}
                    </Text>
                </View>
                <View
                    className="shrink-0 flex-row items-center gap-1.5 rounded-dafPill border border-daf-border bg-daf-surface-alt px-[11px] py-[5px] dark:border-daf-border-dark dark:bg-[#1A2027]"
                    testID="watch-connection-status"
                >
                    <View
                        className={`h-[7px] w-[7px] rounded-full ${watchConnected ? 'bg-daf-success' : 'bg-daf-text-tertiary'}`}
                    />
                    <Text className="text-[12px] font-semibold text-daf-text-secondary dark:text-[#A9B2BD]">
                        {watchConnected ? 'Connected' : 'Disconnected'}
                    </Text>
                </View>
            </View>
            <SettingSection title="Maneuver haptics">
                <View className={cardClassName}>
                    <View className="flex-row items-center gap-3.5 px-4 py-3.5">
                        <SettingCopy
                            title={
                                appleWatch
                                    ? 'Tap for upcoming turns'
                                    : 'Buzz for upcoming turns'
                            }
                        >
                            {appleWatch
                                ? 'One tap left, two taps right, a longer pulse for roundabouts and U-turns. Plays about 10 seconds before the turn.'
                                : 'One tap left, two taps right, a long pulse for roundabouts and U-turns. Plays about 10 seconds before the turn.'}
                        </SettingCopy>
                        <Switch
                            accessibilityLabel={
                                appleWatch
                                    ? 'Tap for upcoming turns'
                                    : 'Buzz for upcoming turns'
                            }
                            value={enabled}
                            onValueChange={(value) =>
                                setWatchHapticsEnabled(value).catch(saveFailed)
                            }
                            trackColor={{ false: '#A9B2BD', true: '#1FBF6B' }}
                            testID="watch-haptics-toggle"
                        />
                    </View>
                    <View className="mx-4 h-px bg-daf-border dark:bg-daf-border-dark" />
                    <Pressable
                        accessibilityLabel="Preview patterns on watch"
                        accessibilityRole="button"
                        accessibilityHint={
                            watchConnected
                                ? 'Plays each pattern on your watch.'
                                : 'Connect your watch to preview patterns.'
                        }
                        accessibilityState={{
                            disabled: previewDisabled,
                            busy: openingPreview,
                        }}
                        className="min-h-[52px] flex-row items-center gap-3.5 px-4 py-3.5 active:opacity-70"
                        disabled={previewDisabled}
                        onPress={openPreview}
                        testID="watch-preview-patterns"
                    >
                        <SettingCopy title="Preview patterns">
                            Plays each pattern on the watch and shows “Check
                            your wrist” here.
                        </SettingCopy>
                        <View className="shrink-0 flex-row items-center gap-1.5">
                            <Text className={captionClassName}>
                                {openingPreview
                                    ? 'Opening…'
                                    : watchConnected
                                      ? 'On watch'
                                      : 'Watch not connected'}
                            </Text>
                            <Icon
                                color={theme.text.tertiary}
                                name="chevron-right"
                                size={18}
                            />
                        </View>
                    </Pressable>
                </View>
            </SettingSection>
            <SettingSection title="Camera alerts">
                <View className={cardClassName}>
                    <View className="flex-row items-center gap-3.5 px-4 py-3.5">
                        <SettingCopy title="Alert on wrist">
                            {appleWatch
                                ? 'Three quick taps plus the camera type, road, and distance — about 0.5 mi ahead.'
                                : 'Three quick ticks plus the camera type, road, and distance — about 0.5 mi ahead.'}
                        </SettingCopy>
                        <Switch
                            accessibilityLabel="Alert on wrist"
                            value={cameraPreferences.alertsEnabled}
                            onValueChange={(alertsEnabled) =>
                                setWatchCameraPreferences({
                                    alertsEnabled,
                                }).catch(saveFailed)
                            }
                            trackColor={{ false: '#A9B2BD', true: '#1FBF6B' }}
                            testID="watch-camera-alerts-toggle"
                        />
                    </View>
                </View>
                <Text className={`px-1 ${captionClassName}`}>
                    Alert distance and camera types follow your Alerts settings.
                    The watch adds no thresholds of its own.
                </Text>
            </SettingSection>
        </View>
    );

    if (sheet) {
        return (
            <NativeWindBottomSheet
                index={0}
                snapPoints={[Math.min(560, height - insets.top - 16)]}
                enableDynamicSizing={false}
                enablePanDownToClose
                onClose={close}
                backgroundClassName="rounded-t-dafSheet bg-white dark:bg-[#11151B]"
                handleIndicatorClassName="bg-daf-border-strong dark:bg-[#3A434E]"
            >
                {header}
                <NativeWindBottomSheetScrollView
                    contentContainerClassName="px-4"
                    contentContainerStyle={{
                        paddingBottom: insets.bottom + 20,
                    }}
                    testID="watch-settings-screen"
                >
                    {content}
                </NativeWindBottomSheetScrollView>
            </NativeWindBottomSheet>
        );
    }
    return (
        <View
            className={
                pane
                    ? 'absolute overflow-hidden rounded-dafXl border border-daf-border-glass bg-white shadow-areaSheet dark:border-daf-border-glass-dark dark:bg-[#11151B]'
                    : 'flex-1 bg-daf-surface-page dark:bg-[#0B0E12]'
            }
            style={
                pane
                    ? {
                          left: pane.left,
                          width: pane.width,
                          top: insets.top + 14,
                          maxHeight:
                              height -
                              insets.top -
                              14 -
                              Math.max(insets.bottom, 14),
                      }
                    : undefined
            }
            testID="watch-settings-screen"
        >
            {header}
            <ScrollView
                className={pane ? 'shrink' : 'flex-1'}
                contentInsetAdjustmentBehavior="never"
                contentContainerClassName={pane ? 'px-3 pb-6' : 'px-5'}
                contentContainerStyle={
                    pane ? undefined : { paddingBottom: insets.bottom + 32 }
                }
            >
                {content}
            </ScrollView>
        </View>
    );
}
