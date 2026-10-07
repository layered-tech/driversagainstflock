import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Icon } from '../design-system/icon';
import {
    DafButton,
    DafIconButton,
    DafTextInput,
} from '../design-system/primitives';
import {
    AVOID_BUFFER_STEP_METERS,
    AVOIDANCE_MODE_OPTIONS,
    MAX_AVOID_BUFFER_METERS,
    MIN_AVOID_BUFFER_METERS,
    normalizeAdvancedRouteSettings,
} from './advanced-route-settings';

export function AdvancedRouteSettings({
    settings,
    onChange,
    onApply,
    loading = false,
    error = '',
    testIDPrefix = 'directions-route',
}) {
    const normalizedSettings = normalizeAdvancedRouteSettings(settings);
    const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
    const [allowAlprNearStartDestination, setAllowAlprNearStartDestination] =
        useState(normalizedSettings.allowAlprNearStartDestination);
    const [avoidBufferInput, setAvoidBufferInput] = useState(
        String(normalizedSettings.avoidBufferMeters),
    );
    const [avoidanceMode, setAvoidanceMode] = useState(
        normalizedSettings.avoidanceMode,
    );

    useEffect(() => {
        setAllowAlprNearStartDestination(
            normalizedSettings.allowAlprNearStartDestination,
        );
        setAvoidBufferInput((current) =>
            normalizeAdvancedRouteSettings({ avoidBufferMeters: current })
                .avoidBufferMeters === normalizedSettings.avoidBufferMeters
                ? current
                : String(normalizedSettings.avoidBufferMeters),
        );
        setAvoidanceMode(normalizedSettings.avoidanceMode);
    }, [
        normalizedSettings.allowAlprNearStartDestination,
        normalizedSettings.avoidBufferMeters,
        normalizedSettings.avoidanceMode,
    ]);

    const updateSettings = (patch) => {
        const next = {
            allowAlprNearStartDestination,
            avoidBufferMeters: avoidBufferInput,
            avoidanceMode,
            ...patch,
        };
        setAllowAlprNearStartDestination(next.allowAlprNearStartDestination);
        setAvoidBufferInput(String(next.avoidBufferMeters));
        setAvoidanceMode(next.avoidanceMode);
        onChange?.(normalizeAdvancedRouteSettings(next));
    };
    const adjustAvoidBuffer = (stepCount) => {
        const next = normalizeAdvancedRouteSettings({
            avoidBufferMeters:
                Number(avoidBufferInput) + stepCount * AVOID_BUFFER_STEP_METERS,
        });
        updateSettings({ avoidBufferMeters: next.avoidBufferMeters });
    };
    const applyAdvancedSettings = () => {
        const next = normalizeAdvancedRouteSettings({
            allowAlprNearStartDestination,
            avoidBufferMeters: avoidBufferInput,
            avoidanceMode,
        });
        setAvoidBufferInput(String(next.avoidBufferMeters));
        onApply(next);
    };

    return (
        <View className="overflow-hidden rounded-dafSm border border-daf-border bg-daf-surface-alt dark:border-daf-border-dark dark:bg-daf-surface-inverse">
            <Pressable
                accessibilityRole="button"
                accessibilityState={{
                    expanded: advancedSettingsOpen,
                }}
                className="min-h-hitComfy flex-row items-center gap-2 px-3 active:opacity-[0.82]"
                onPress={() =>
                    setAdvancedSettingsOpen((currentValue) => !currentValue)
                }
                testID={`${testIDPrefix}-advanced-settings-toggle`}
            >
                <Icon color="#828D9B" name="sliders-horizontal" size={16} />
                <Text className="min-w-0 flex-1 text-[14px] font-semibold text-daf-text-primary dark:text-white">
                    Advanced settings
                </Text>
                <Text className="font-dafMono text-xs font-semibold text-daf-text-tertiary dark:text-neutral-400">
                    {normalizedSettings.avoidBufferMeters} m
                </Text>
                <Icon
                    color="#828D9B"
                    name={advancedSettingsOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                />
            </Pressable>

            {advancedSettingsOpen ? (
                <View className="gap-3 border-t border-daf-border px-3 py-3 dark:border-daf-border-dark">
                    <View className="gap-2">
                        <Text className="text-[14px] font-medium text-daf-text-primary dark:text-white">
                            ALPR avoidance shape
                        </Text>
                        <View
                            className="flex-row gap-2"
                            testID={`${testIDPrefix}-avoidance-options`}
                        >
                            {AVOIDANCE_MODE_OPTIONS.map((option) => (
                                <Pressable
                                    key={option.value}
                                    accessibilityLabel={option.label}
                                    accessibilityRole="radio"
                                    accessibilityState={{
                                        checked: avoidanceMode === option.value,
                                        disabled: loading,
                                    }}
                                    className={`min-h-11 min-w-0 flex-1 items-center justify-center rounded-dafSm border px-3 py-2 focus:border-daf-brand ${
                                        avoidanceMode === option.value
                                            ? 'border-daf-brand bg-daf-surface-alt dark:bg-daf-surface-inverse'
                                            : 'border-daf-border dark:border-daf-border-dark'
                                    }`}
                                    disabled={loading}
                                    onPress={() =>
                                        updateSettings({
                                            avoidanceMode: option.value,
                                        })
                                    }
                                    testID={`${testIDPrefix}-avoidance-${option.value}`}
                                >
                                    <Text className="text-center text-[14px] font-medium text-daf-text-primary dark:text-white">
                                        {option.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                        <Text className="text-xs text-daf-text-secondary dark:text-neutral-300">
                            Directional cones use camera direction when known.
                            Circular radius avoids every camera in all
                            directions.
                        </Text>
                    </View>
                    <View className="min-h-11 flex-row items-center gap-3">
                        <Text className="min-w-0 flex-1 text-[14px] font-medium leading-5 text-daf-text-primary dark:text-white">
                            Allow ALPR near start & destination
                        </Text>
                        <Switch
                            accessibilityLabel="Allow ALPR near start and destination"
                            className="shrink-0"
                            disabled={loading}
                            onValueChange={(value) =>
                                updateSettings({
                                    allowAlprNearStartDestination: value,
                                })
                            }
                            thumbColor="#ffffff"
                            trackColor={{
                                false: '#D4D9DF',
                                true: '#1FBF6B',
                            }}
                            value={allowAlprNearStartDestination}
                            testID={`${testIDPrefix}-allow-alpr-switch`}
                        />
                    </View>

                    <View className="gap-2">
                        <View className="flex-row items-end justify-between gap-3">
                            <Text className="text-[14px] font-medium text-daf-text-primary dark:text-white">
                                Avoid cameras by
                            </Text>
                            <Text className="font-dafMono text-xs text-daf-text-secondary dark:text-neutral-300">
                                {MIN_AVOID_BUFFER_METERS}–
                                {MAX_AVOID_BUFFER_METERS} m
                            </Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                            <DafIconButton
                                accessibilityLabel={`Decrease avoid distance by ${AVOID_BUFFER_STEP_METERS} meters`}
                                disabled={loading}
                                icon="minus"
                                onPress={() => adjustAvoidBuffer(-1)}
                                size="sm"
                                testID={`${testIDPrefix}-avoid-distance-decrease`}
                            />
                            <DafTextInput
                                accessibilityLabel="Avoid distance in meters"
                                className="flex-1 text-center font-dafMono"
                                editable={!loading}
                                keyboardType="number-pad"
                                maxLength={4}
                                onChangeText={(value) =>
                                    updateSettings({
                                        avoidBufferMeters: value.replace(
                                            /[^0-9]/g,
                                            '',
                                        ),
                                    })
                                }
                                testID={`${testIDPrefix}-avoid-distance-input`}
                                value={avoidBufferInput}
                            />
                            <DafIconButton
                                accessibilityLabel={`Increase avoid distance by ${AVOID_BUFFER_STEP_METERS} meters`}
                                disabled={loading}
                                icon="plus"
                                onPress={() => adjustAvoidBuffer(1)}
                                size="sm"
                                testID={`${testIDPrefix}-avoid-distance-increase`}
                            />
                        </View>
                    </View>

                    {error ? (
                        <Text className="text-xs font-medium text-daf-alert">
                            {error}
                        </Text>
                    ) : null}

                    {onApply ? (
                        <DafButton
                            accessibilityLabel="Apply advanced settings and recalculate route"
                            disabled={loading}
                            loading={loading}
                            onPress={applyAdvancedSettings}
                            testID={`${testIDPrefix}-advanced-settings-apply`}
                            variant="secondary"
                        >
                            Apply & recalculate
                        </DafButton>
                    ) : null}
                </View>
            ) : null}
        </View>
    );
}
