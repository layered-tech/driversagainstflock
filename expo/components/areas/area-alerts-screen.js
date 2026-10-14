import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Linking,
    Pressable,
    ScrollView,
    Switch,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { DafButton, DafTextInput } from '../design-system/primitives';
import { ALERT_MODES, AREA_KINDS } from './area-geometry';
import { registerAreaNotifications } from './area-notifications';
import {
    areaCardClass,
    AreaError,
    AreaHeader,
    AreaLoading,
    AreaPrivacy,
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
        <View className="flex-1" testID="area-alerts-screen">
            <AreaHeader
                title="Alerts"
                subtitle={
                    area ? `${area.name} · ${AREA_KINDS[area.kind]}` : undefined
                }
            />
            <ScrollView
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
                        <Text className="mb-2 mt-3 text-[11px] uppercase tracking-[1px] text-daf-text-tertiary dark:text-neutral-400">
                            Tell me when
                        </Text>
                        <View className={`${areaCardClass} px-4`}>
                            {[
                                ['notify_added', 'A camera is added'],
                                ['notify_removed', 'A camera is removed'],
                            ].map(([key, label], index) => (
                                <View
                                    key={key}
                                    className={`min-h-[54px] flex-row items-center justify-between gap-2 ${index ? 'border-t border-daf-border dark:border-daf-border-dark' : ''}`}
                                >
                                    <Text className="flex-1 text-[15px] font-medium text-daf-text-primary dark:text-white">
                                        {label}
                                    </Text>
                                    <Switch
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
                                </View>
                            ))}
                        </View>
                        <Text className="mb-2 mt-5 text-[11px] uppercase tracking-[1px] text-daf-text-tertiary dark:text-neutral-400">
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
                                    className="flex-row items-center gap-3 py-3"
                                    onPress={() =>
                                        save({ alert_mode: mode.value })
                                    }
                                    testID={`area-alert-mode-${mode.value}`}
                                >
                                    <View
                                        className={`h-5 w-5 items-center justify-center rounded-full border-2 ${area.alert_mode === mode.value ? 'border-daf-brand' : 'border-daf-border-strong dark:border-daf-border-dark'}`}
                                    >
                                        {area.alert_mode === mode.value ? (
                                            <View className="h-2.5 w-2.5 rounded-full bg-daf-brand" />
                                        ) : null}
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-[15px] font-semibold text-daf-text-primary dark:text-white">
                                            {mode.label}
                                        </Text>
                                        <Text className="mt-0.5 text-xs text-daf-text-tertiary dark:text-neutral-400">
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
                                    <Text className="text-[15px] font-semibold text-daf-text-primary dark:text-white">
                                        Digest time
                                    </Text>
                                    <Text className="mt-1 text-xs text-daf-text-tertiary dark:text-neutral-400">
                                        Applies to daily and weekly · local time
                                    </Text>
                                </View>
                                <Text className="font-dafMono text-[13px] font-semibold text-daf-text-primary dark:text-white">
                                    {new Date(
                                        `2000-01-01T${area.digest_time}:00`,
                                    ).toLocaleTimeString(undefined, {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                    })}
                                </Text>
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
                            className="min-h-[48px] items-center justify-center"
                            onPress={stopWatching}
                            testID="stop-watching-area"
                        >
                            <Text className="text-[15px] font-semibold text-daf-alert">
                                Stop watching {area.name}
                            </Text>
                        </Pressable>
                    </>
                )}
            </ScrollView>
        </View>
    );
}
