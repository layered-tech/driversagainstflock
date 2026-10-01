import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { WEATHER_PROFILE_DEFAULTS } from './weather-profiles';
import { useWeatherState, weatherStore } from './weather-runtime';

function WeatherButton({ label, onPress, selected = false }) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={onPress}
            className={
                selected
                    ? 'min-h-11 justify-center rounded-md bg-blue-600 px-3'
                    : 'min-h-11 justify-center rounded-md bg-neutral-200 px-3 dark:bg-neutral-800'
            }
        >
            <Text
                className={
                    selected
                        ? 'text-xs font-semibold text-white'
                        : 'text-xs font-semibold text-neutral-950 dark:text-white'
                }
            >
                {label}
            </Text>
        </Pressable>
    );
}

function WeatherProfileEditor({ condition, profile }) {
    const [draft, setDraft] = useState({});
    const [error, setError] = useState(null);
    useEffect(() => {
        setDraft(
            Object.fromEntries(
                Object.entries(profile).map(([key, value]) => [
                    key,
                    String(value),
                ]),
            ),
        );
    }, [profile]);

    function apply() {
        const value = Object.fromEntries(
            Object.entries(draft).map(([key, input]) => [
                key,
                ['color', 'vignetteColor'].includes(key)
                    ? input.trim()
                    : ['direction', 'dropletSize'].includes(key)
                      ? input
                            .split(',')
                            .map((part) => (part.trim() ? Number(part) : NaN))
                      : input.trim()
                        ? Number(input)
                        : NaN,
            ]),
        );
        setError(weatherStore.setProfile(condition, value));
    }

    return (
        <View className="gap-2">
            <Text className="text-sm font-semibold text-neutral-950 dark:text-white">
                {condition} appearance
            </Text>
            {Object.keys(WEATHER_PROFILE_DEFAULTS[condition]).map((key) => (
                <View key={key} className="flex-row items-center gap-2">
                    <Text className="flex-1 text-xs text-neutral-600 dark:text-neutral-400">
                        {key}
                    </Text>
                    <TextInput
                        accessibilityLabel={`${condition} ${key}`}
                        value={draft[key] ?? ''}
                        onChangeText={(value) =>
                            setDraft((previous) => ({
                                ...previous,
                                [key]: value,
                            }))
                        }
                        autoCapitalize="none"
                        autoCorrect={false}
                        className="min-h-11 w-32 rounded border border-neutral-300 px-2 text-xs text-neutral-950 dark:border-neutral-700 dark:text-white"
                        onSubmitEditing={apply}
                    />
                </View>
            ))}
            <WeatherButton
                label={`Apply ${condition} appearance`}
                onPress={apply}
            />
            {error ? (
                <Text
                    accessibilityRole="alert"
                    className="text-xs text-red-600 dark:text-red-400"
                >
                    {error}
                </Text>
            ) : null}
        </View>
    );
}

export function WeatherDebugPane() {
    const weather = useWeatherState();
    const [editor, setEditor] = useState(null);
    const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
    const [simulation, setSimulation] = useState(null);

    function simulate(kind) {
        const now = Date.now();
        const location = { latitude: 40, longitude: -100 };
        const observation = (condition, observedAt) => ({
            condition,
            observedAt,
            fresh: true,
            stationLocation: location,
            station: 'debug-only',
            fetchedAt: now,
        });
        const entries =
            kind === 'unavailable'
                ? [{ now, location, observation: observation('Unknown', now) }]
                : Array.from({ length: 4 }, (_, index) => ({
                      now: now + index * 600_000,
                      location,
                      observation: observation(
                          kind === 'repeated'
                              ? 'Rain'
                              : index % 2
                                ? 'Snow'
                                : 'Rain',
                          kind === 'repeated' ? now : now + index * 600_000,
                      ),
                  }));
        setSimulation({ kind, state: weatherStore.simulate(entries) });
    }

    const observedAt = weather.state.supporting?.observedAt;
    const diagnostics = {
        raw: weather.raw,
        accepted: weather.state.accepted,
        rendered: weather.rendered,
        renderers: weather.renderers,
        override: weather.mode,
        reason: weather.state.reason,
        observationAgeMinutes: observedAt
            ? (Date.now() - observedAt) / 60_000
            : null,
        supportingObservation: weather.state.supporting,
        pending: weather.state.pending,
        dwellDeadline:
            weather.state.changedAt === null
                ? null
                : weather.state.changedAt + 1_200_000,
        retentionDeadline: observedAt ? observedAt + 5_400_000 : null,
        nextRefreshAt: weather.nextRefreshAt,
        failures: weather.failures,
        rolloutEnabled: weather.rolloutEnabled,
        activeSurfaces: weather.activeSurfaces,
    };

    return (
        <View className="gap-3 rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <Text className="text-sm font-semibold text-neutral-950 dark:text-white">
                Map weather
            </Text>
            <View className="flex-row items-center gap-2">
                <Switch
                    accessibilityLabel="Enable map weather"
                    value={weather.preferences.enabled}
                    onValueChange={weatherStore.setEnabled}
                />
                <Text className="text-xs text-neutral-600 dark:text-neutral-400">
                    Effects enabled everywhere
                </Text>
            </View>
            {weather.mode !== 'Automatic' ? (
                <Text className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Weather override: {weather.mode}
                </Text>
            ) : null}
            <View className="flex-row flex-wrap gap-2">
                {['Automatic', 'Off', 'Rain', 'Snow'].map((mode) => (
                    <WeatherButton
                        key={mode}
                        label={mode}
                        selected={weather.mode === mode}
                        onPress={() => weatherStore.setMode(mode)}
                    />
                ))}
                <WeatherButton
                    label="Toggle Rain / Snow"
                    onPress={() =>
                        weatherStore.setMode(
                            weather.mode === 'Rain' ? 'Snow' : 'Rain',
                        )
                    }
                />
                <WeatherButton
                    label="Reset appearance"
                    onPress={weatherStore.resetProfiles}
                />
                <WeatherButton
                    label="Refresh NWS"
                    onPress={weatherStore.refresh}
                />
                {['Rain', 'Snow'].map((condition) => (
                    <WeatherButton
                        key={condition}
                        label={`Edit ${condition}`}
                        selected={editor === condition}
                        onPress={() =>
                            setEditor(editor === condition ? null : condition)
                        }
                    />
                ))}
                <WeatherButton
                    label="Diagnostics"
                    selected={diagnosticsVisible}
                    onPress={() => setDiagnosticsVisible(!diagnosticsVisible)}
                />
            </View>
            {editor ? (
                <WeatherProfileEditor
                    condition={editor}
                    profile={weather.preferences.profiles[editor]}
                />
            ) : null}
            {diagnosticsVisible ? (
                <Text
                    selectable
                    className="text-xs text-neutral-600 dark:text-neutral-400"
                >
                    {JSON.stringify(diagnostics, null, 2)}
                </Text>
            ) : null}
            <Text className="text-xs text-neutral-600 dark:text-neutral-400">
                Isolated policy simulations
            </Text>
            <View className="flex-row flex-wrap gap-2">
                {['unavailable', 'repeated', 'alternating'].map((kind) => (
                    <WeatherButton
                        key={kind}
                        label={kind}
                        onPress={() => simulate(kind)}
                    />
                ))}
            </View>
            {simulation ? (
                <Text
                    selectable
                    className="text-xs text-neutral-600 dark:text-neutral-400"
                >
                    {JSON.stringify(simulation, null, 2)}
                </Text>
            ) : null}
        </View>
    );
}
