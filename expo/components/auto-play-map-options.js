const MAP_OPTION_TOGGLES = [
    ['weatherEnabled', 'Rain and snow effects', true],
    ['policeAlertsVisible', 'Police reports (Waze)', false],
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

    function makeChoiceSection(kind, choiceIsActive) {
        const preferences = getPreferences();
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
                    if (
                        !current() ||
                        !choiceIsActive() ||
                        !getPreferences().mapPreferencesAreLoaded
                    ) {
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

    function openChoices(kind) {
        if (!current()) {
            return;
        }
        const choice = {};
        const close = () => choices.delete(choice);
        try {
            const section = makeChoiceSection(kind, () => choices.has(choice));
            choice.key = JSON.stringify(section);
            choice.kind = kind;
            choice.template = new ListTemplate({
                title: {
                    text: kind === 'layer' ? 'Map layer' : "Map's Time of Day",
                },
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
            const choiceSection = makeChoiceSection(choice.kind, () =>
                choices.has(choice),
            );
            const choiceKey = JSON.stringify(choiceSection);
            if (choiceKey !== choice.key) {
                choice.key = choiceKey;
                void updateSection(choice.template, choiceSection, () =>
                    choices.delete(choice),
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
