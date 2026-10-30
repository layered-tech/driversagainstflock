import {
    AVOID_BUFFER_STEP_METERS,
    AVOIDANCE_MODE_OPTIONS,
    getStoredAdvancedRouteSettings,
    MAX_AVOID_BUFFER_METERS,
    MIN_AVOID_BUFFER_METERS,
    normalizeAdvancedRouteSettings,
} from './map/advanced-route-settings.js';

const CHOICE_TITLES = {
    layer: 'Map layer',
    light: "Map's Time of Day",
    route: 'Route Options',
    avoidance: 'ALPR avoidance shape',
    buffer: 'Avoid cameras by',
};

const MAP_OPTION_TOGGLES = [
    ['weatherEnabled', 'Rain and snow effects', true],
    ['policeAlertsVisible', 'Police reports (Waze)', false],
    ['preferPrivateRoutes', 'Prefer private routes', false],
];

export function createAutoPlayMapOptionsTemplate({
    ListTemplate,
    getBackHeaderAction,
    getPreferences,
    setPreferences,
    subscribePreferences,
    weatherStore,
    mapLayers,
    lightPresets,
    requestIsCurrent,
    onError,
}) {
    let isActive = true;
    let template;
    let unsubscribePreferences;
    let unsubscribeWeather;
    let lastSectionKey = '';
    const choices = new Set();
    const current = () => isActive && requestIsCurrent();
    const dismiss = () => {
        isActive = false;
        unsubscribePreferences?.();
        unsubscribeWeather?.();
        choices.clear();
    };
    const reportError = () => {
        if (current()) {
            onError();
        }
    };
    const updateSection = (target, section, onFailure = dismiss) => {
        try {
            return Promise.resolve(target.updateSections(section)).catch(
                onFailure,
            );
        } catch {
            onFailure();
            return Promise.resolve();
        }
    };

    function updateRouteSettings(patch) {
        setPreferences({
            advancedRouteSettings: normalizeAdvancedRouteSettings({
                ...getStoredAdvancedRouteSettings(getPreferences()),
                ...patch,
            }),
        });
    }

    function makeChoiceSection(choice) {
        const preferences = getPreferences();
        const { kind } = choice;
        const canChange = () =>
            current() &&
            choices.has(choice) &&
            getPreferences().mapPreferencesAreLoaded;
        const routeSettings = getStoredAdvancedRouteSettings(preferences);
        if (!preferences.mapPreferencesAreLoaded) {
            return {
                type: 'default',
                items: [
                    {
                        type: 'text',
                        title: {
                            text:
                                kind === 'layer' || kind === 'light'
                                    ? 'Loading map settings'
                                    : 'Loading route settings',
                        },
                    },
                ],
            };
        }
        if (kind === 'route') {
            return {
                type: 'default',
                items: [
                    {
                        type: 'default',
                        browsable: true,
                        title: { text: CHOICE_TITLES.avoidance },
                        detailedText: {
                            text: AVOIDANCE_MODE_OPTIONS.find(
                                (option) =>
                                    option.value ===
                                    routeSettings.avoidanceMode,
                            ).label,
                        },
                        onPress: () => openChoices('avoidance', choice),
                    },
                    {
                        type: 'default',
                        browsable: true,
                        title: { text: CHOICE_TITLES.buffer },
                        detailedText: {
                            text: `${routeSettings.avoidBufferMeters} m`,
                        },
                        onPress: () => openChoices('buffer', choice),
                    },
                    {
                        type: 'toggle',
                        title: { text: 'Allow ALPR near start & destination' },
                        checked: routeSettings.allowAlprNearStartDestination,
                        onPress: (_template, checked) => {
                            if (canChange()) {
                                updateRouteSettings({
                                    allowAlprNearStartDestination: checked,
                                });
                            }
                        },
                    },
                ],
            };
        }
        if (kind === 'avoidance') {
            return {
                type: 'radio',
                items: AVOIDANCE_MODE_OPTIONS.map((option) => ({
                    type: 'radio',
                    title: { text: option.label },
                    selected: routeSettings.avoidanceMode === option.value,
                    onPress: () => {
                        if (canChange()) {
                            updateRouteSettings({
                                avoidanceMode: option.value,
                            });
                        }
                    },
                })),
            };
        }
        if (kind === 'buffer') {
            return {
                type: 'default',
                items: [
                    {
                        type: 'text',
                        title: { text: `${routeSettings.avoidBufferMeters} m` },
                        detailedText: {
                            text: `${MIN_AVOID_BUFFER_METERS}–${MAX_AVOID_BUFFER_METERS} m`,
                        },
                    },
                    ...[-1, 1].map((direction) => ({
                        type: 'default',
                        title: {
                            text: `${direction < 0 ? 'Decrease' : 'Increase'} by ${AVOID_BUFFER_STEP_METERS} m`,
                        },
                        enabled:
                            direction < 0
                                ? routeSettings.avoidBufferMeters >
                                  MIN_AVOID_BUFFER_METERS
                                : routeSettings.avoidBufferMeters <
                                  MAX_AVOID_BUFFER_METERS,
                        onPress: () => {
                            if (canChange()) {
                                updateRouteSettings({
                                    avoidBufferMeters:
                                        getStoredAdvancedRouteSettings(
                                            getPreferences(),
                                        ).avoidBufferMeters +
                                        direction * AVOID_BUFFER_STEP_METERS,
                                });
                            }
                        },
                    })),
                ],
            };
        }
        const options = kind === 'layer' ? mapLayers : lightPresets;
        const selected =
            options.find((option) =>
                kind === 'layer'
                    ? option.styleURL === preferences.mapStyleURL
                    : option.key === preferences.mapLightPresetPreference,
            ) ?? options[0];

        return {
            type: 'radio',
            items: options.map((option) => ({
                title: { text: option.label },
                type: 'radio',
                selected: option === selected,
                onPress: () => {
                    if (!canChange()) {
                        return;
                    }
                    setPreferences(
                        kind === 'layer'
                            ? {
                                  mapStyleURL: option.styleURL,
                                  mapStyleIsUserSelected:
                                      option.key === 'standard-satellite',
                              }
                            : { mapLightPresetPreference: option.key },
                    );
                },
            })),
        };
    }

    function closeChoice(choice) {
        choices.delete(choice);
        for (const child of choices) {
            if (child.parent === choice) {
                closeChoice(child);
            }
        }
    }

    function openChoices(kind, parent = null) {
        if (
            !current() ||
            !getPreferences().mapPreferencesAreLoaded ||
            (parent && !choices.has(parent))
        ) {
            return;
        }
        const choice = { kind, parent };
        const close = () => closeChoice(choice);
        try {
            const section = makeChoiceSection(choice);
            choice.key = JSON.stringify(section);
            choice.template = new ListTemplate({
                title: { text: CHOICE_TITLES[kind] },
                headerActions: getBackHeaderAction(close),
                onPopped: close,
                sections: section,
            });
            choices.add(choice);
            return choice.template.push().catch(() => {
                close();
                reportError();
            });
        } catch {
            close();
            reportError();
        }
    }

    function makeSection() {
        const preferences = getPreferences();
        if (!preferences.mapPreferencesAreLoaded) {
            return {
                type: 'default',
                items: [
                    { type: 'text', title: { text: 'Loading map settings' } },
                ],
            };
        }
        const toggles = MAP_OPTION_TOGGLES.map(
            ([key, label, defaultValue]) => ({
                title: { text: label },
                type: 'toggle',
                checked:
                    key === 'weatherEnabled'
                        ? weatherStore.getSnapshot().preferences.enabled
                        : (preferences[key] ?? defaultValue) === true,
                onPress: (_template, checked) => {
                    if (
                        !current() ||
                        !getPreferences().mapPreferencesAreLoaded
                    ) {
                        return;
                    }
                    if (key === 'weatherEnabled') {
                        weatherStore.setEnabled(checked);
                        return;
                    }
                    setPreferences({ [key]: checked });
                },
            }),
        );
        const items = [
            {
                type: 'default',
                browsable: true,
                title: { text: 'Map layer' },
                detailedText: {
                    text: (
                        mapLayers.find(
                            (layer) =>
                                layer.styleURL === preferences.mapStyleURL,
                        ) ?? mapLayers[0]
                    ).label,
                },
                onPress: () => openChoices('layer'),
            },
            {
                type: 'default',
                browsable: true,
                title: { text: "Map's Time of Day" },
                detailedText: {
                    text: (
                        lightPresets.find(
                            (preset) =>
                                preset.key ===
                                preferences.mapLightPresetPreference,
                        ) ?? lightPresets[0]
                    ).label,
                },
                onPress: () => openChoices('light'),
            },
            ...toggles,
            {
                type: 'default',
                browsable: true,
                title: { text: CHOICE_TITLES.route },
                detailedText: {
                    text: `${getStoredAdvancedRouteSettings(preferences).avoidBufferMeters} m`,
                },
                onPress: () => openChoices('route'),
            },
        ];
        return { type: 'default', items };
    }

    function refresh() {
        if (!current()) {
            dismiss();
            return;
        }
        const section = makeSection();
        const key = JSON.stringify(section);
        if (key !== lastSectionKey) {
            lastSectionKey = key;
            void updateSection(template, section);
        }
        for (const choice of choices) {
            const choiceSection = makeChoiceSection(choice);
            const choiceKey = JSON.stringify(choiceSection);
            if (choiceKey !== choice.key) {
                choice.key = choiceKey;
                void updateSection(choice.template, choiceSection, () =>
                    closeChoice(choice),
                );
            }
        }
    }

    try {
        const section = makeSection();
        lastSectionKey = JSON.stringify(section);
        template = new ListTemplate({
            title: { text: 'Map settings' },
            headerActions: getBackHeaderAction(dismiss),
            onPopped: dismiss,
            sections: section,
        });
        unsubscribePreferences = subscribePreferences(refresh);
        unsubscribeWeather = weatherStore.subscribe(refresh);
        void Promise.resolve(weatherStore.hydrate()).catch(() => {});
        const pushPromise = template.push().then(
            () => {
                refresh();
                return true;
            },
            () => {
                reportError();
                dismiss();
                return false;
            },
        );
        return { template, pushPromise };
    } catch {
        reportError();
        dismiss();
        return { template, pushPromise: Promise.resolve(false) };
    }
}
