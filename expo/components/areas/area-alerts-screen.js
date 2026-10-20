import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Linking,
    Pressable,
    ScrollView,
    Switch,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { DafTextInput } from '../design-system/primitives';
import { ALERT_MODES, AREA_KINDS } from './area-geometry';
import { registerAreaNotifications } from './area-notifications';
import {
    AreaButton as DafButton,
    areaCardClass,
    AreaError,
    AreaHeader,
    AreaLoading,
    AreaPrivacy,
    AreaText as Text,
} from './area-ui';
import { useAreas } from './areas-context';

export default function AreaAlertsScreen() {
    const { areaId } = useLocalSearchParams();
    const { areas, loading, refresh, updateArea, removeArea } = useAreas();
    const area = areas.find((item) => item.id === Number(areaId));
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [time, setTime] = useState('08:00');
    const [editingTime, setEditingTime] = useState(false);
    const insets = useSafeAreaInsets();
    useEffect(() => {
        refresh();
    }, [refresh]);
    useEffect(() => {
        if (area) setTime(area.digest_time);
    }, [area?.digest_time]);
    async function save(values) {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            if (values.alert_mode && values.alert_mode !== 'off')
                await registerAreaNotifications({ requestPermission: true });
            await updateArea(areaId, values);
            setEditingTime(false);
        } catch (failure) {
            setError(failure.message);
        } finally {
            setBusy(false);
        }
    }
    async function stopWatching() {
        setBusy(true);
        setError(null);
        try {
            await removeArea(areaId);
            router.replace('/areas');
        } catch (failure) {
            setError(failure.message);
            setBusy(false);
        }
    }
    return (
        <KeyboardAvoidingView
            behavior="padding"
            className="flex-1"
            testID="area-alerts-screen"
        >
            <AreaHeader
                title="Alerts"
                subtitle={
                    area ? `${area.name} · ${AREA_KINDS[area.kind]}` : undefined
                }
            />
            <ScrollView
                keyboardShouldPersistTaps="handled"
                className="px-4"
                contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            >
                <AreaError message={error} />
                {!area && loading ? (
                    <AreaLoading />
                ) : !area ? (
                    <AreaError
                        message="This area is unavailable."
                        onRetry={refresh}
                    />
                ) : (
                    <>
                        <Text className="mb-2 mt-3 text-[11px] uppercase tracking-[1px] text-daf-text-tertiary dark:text-daf-text-tertiary">
                            Tell me when
                        </Text>
                        <View className={`${areaCardClass} px-4`}>
                            {[
                                ['notify_added', 'A camera is added'],
                                ['notify_removed', 'A camera is removed'],
                            ].map(([key, label], index) => (
                                <View
                                    key={key}
                                    className={`min-h-[48px] flex-row items-center gap-[10px] py-[8px] ${index ? 'border-t border-daf-border dark:border-daf-border-dark' : ''}`}
                                >
                                    <Switch
                                        hitSlop={6}
                                        accessibilityLabel={label}
                                        disabled={busy}
                                        value={area[key]}
                                        onValueChange={(value) =>
                                            save({ [key]: value })
                                        }
                                        trackColor={{
                                            false: '#828D9B',
                                            true: '#1FBF6B',
                                        }}
                                        thumbColor="#FFFFFF"
                                    />
                                    <Text className="flex-1 text-[15px] font-medium text-daf-text-primary dark:text-daf-text-inverse">
                                        {label}
                                    </Text>
                                </View>
                            ))}
                        </View>
                        <Text className="mb-2 mt-5 text-[11px] uppercase tracking-[1px] text-daf-text-tertiary dark:text-daf-text-tertiary">
                            How often
                        </Text>
                        <View className={`${areaCardClass} px-4 py-2`}>
                            {ALERT_MODES.map((mode) => (
                                <Pressable
                                    key={mode.value}
                                    accessibilityRole="radio"
                                    accessibilityState={{
                                        checked: area.alert_mode === mode.value,
                                        disabled: busy,
                                    }}
                                    disabled={busy}
                                    className="min-h-[48px] flex-row items-start gap-[10px] py-[6px]"
                                    onPress={() =>
                                        save({ alert_mode: mode.value })
                                    }
                                    testID={`area-alert-mode-${mode.value}`}
                                >
                                    <View
                                        className={`mt-[3px] h-5 w-5 items-center justify-center rounded-full border-2 ${area.alert_mode === mode.value ? 'border-daf-brand' : 'border-daf-border-strong dark:border-[#3A434E]'}`}
                                    >
                                        {area.alert_mode === mode.value ? (
                                            <View className="h-2.5 w-2.5 rounded-full bg-daf-brand" />
                                        ) : null}
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-[15px] font-medium leading-[20px] text-daf-text-primary dark:text-daf-text-inverse">
                                            {mode.label}
                                        </Text>
                                        <Text className="mt-[2px] text-[13px] leading-[18px] text-daf-text-secondary dark:text-[#A9B2BD]">
                                            {mode.description}
                                        </Text>
                                    </View>
                                </Pressable>
                            ))}
                        </View>
                        <View className={`${areaCardClass} mt-5 p-4`}>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Change digest time"
                                className="flex-row items-center gap-3"
                                onPress={() => setEditingTime(!editingTime)}
                            >
                                <View className="flex-1">
                                    <Text className="text-[15px] font-medium text-daf-text-primary dark:text-daf-text-inverse">
                                        Digest time
                                    </Text>
                                    <Text className="mt-1 text-xs text-daf-text-tertiary dark:text-daf-text-tertiary">
                                        Applies to daily and weekly · local time
                                    </Text>
                                </View>
                                <View className="rounded-dafPill bg-daf-surface-alt px-[11px] py-[5px] dark:bg-[#1A2027]">
                                    <Text className="font-dafMono text-[13px] font-semibold text-daf-text-primary dark:text-daf-text-inverse">
                                        {new Date(
                                            `2000-01-01T${area.digest_time}:00`,
                                        ).toLocaleTimeString(undefined, {
                                            hour: 'numeric',
                                            minute: '2-digit',
                                        })}
                                    </Text>
                                </View>
                                <Icon
                                    name="chevron-down"
                                    color="#828D9B"
                                    size={16}
                                />
                            </Pressable>
                            {editingTime ? (
                                <View className="mt-4 gap-3">
                                    <DafTextInput
                                        accessibilityLabel="Digest time in 24 hour format"
                                        testID="area-digest-time-input"
                                        placeholder="HH:MM"
                                        value={time}
                                        onChangeText={setTime}
                                        maxLength={5}
                                    />
                                    <DafButton
                                        loading={busy}
                                        disabled={
                                            !/^([01]\d|2[0-3]):[0-5]\d$/.test(
                                                time,
                                            )
                                        }
                                        onPress={() =>
                                            save({ digest_time: time })
                                        }
                                    >
                                        Save time
                                    </DafButton>
                                </View>
                            ) : null}
                        </View>
                        <AreaPrivacy alerts />
                        {error?.includes('phone’s settings') ? (
                            <DafButton
                                variant="secondary"
                                onPress={() => Linking.openSettings()}
                            >
                                Open phone settings
                            </DafButton>
                        ) : null}
                        <Pressable
                            accessibilityRole="button"
                            disabled={busy}
                            className="mt-[18px] min-h-[48px] items-center justify-center"
                            onPress={stopWatching}
                            testID="stop-watching-area"
                        >
                            <Text className="text-[15px] font-semibold text-daf-text-primary dark:text-daf-text-inverse">
                                Stop watching {area.name}
                            </Text>
                        </Pressable>
                    </>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
