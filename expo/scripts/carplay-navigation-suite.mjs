const screenshot = (name) => ({ type: 'screenshot', name });
const text = (name, contains, notContains = []) => ({
    type: 'assertOcr',
    screenshot: name,
    contains,
    notContains,
    timeout: 20000,
});
const tap = (name, label, extra = {}) => ({
    type: 'tapOcr',
    screenshot: name,
    text: label,
    ...extra,
});
const icon = (
    name,
    expectText = name === 'options'
        ? ['Map layer', "Map's Time of Day"]
        : undefined,
) => ({
    type: 'tapIcon',
    name,
    ...(['home', 'work'].includes(name)
        ? { waitForMetro: '[CarPlay] primary-location-selected' }
        : {}),
    ...(expectText ? { expectText } : {}),
});
const back = { type: 'hostBack' };
const state = (expected) => ({ type: 'assertCarPlayState', expected });
const results = (name, query = 'Walmart', title = 'Search results') => [
    { type: 'waitForMetro', marker: '[CarPlay] search-results-presented' },
    text(`${name}-full-list`, [title, 'Walmart']),
    state({ submittedSearchPinCount: 0 }),
    ...(query.includes('Delafield')
        ? [
              { type: 'sleep', milliseconds: 4000 },
              text(`${name}-still-full-list`, [title, 'Walmart']),
              state({ previewVisible: false, isNavigating: false }),
          ]
        : []),
    icon('searchMap'),
    { type: 'waitForMetro', marker: '[CarPlay] search-map-results-presented' },
    { type: 'waitForMetro', marker: '[Auto Play] search-results-fitted' },
    { type: 'sleep', milliseconds: 1100 },
    {
        ...text(
            name,
            [
                'Search results',
                '1.',
                'Walmart',
                ...(query.includes('Delafield') ? ['Delafield'] : []),
            ],
            ['Searching for'],
        ),
        retryDelayMilliseconds: 100,
    },
    state({
        submittedSearchPinCount: { minimum: 1, maximum: 6 },
        panControlVisible: false,
    }),
];
const preview = (name, destination) => [
    state({
        previewVisible: true,
        routeChoiceCount: { minimum: 1 },
        isNavigating: false,
        panControlVisible: false,
    }),
    screenshot(name),
    text(name, ['Start', destination]),
    { type: 'assertRouteOverview', name },
];
const selectResult = (name) =>
    tap(name, 'Walmart', {
        match: 'result',
        occurrence: 0,
        waitForMetro: '[CarPlay] search-result-selected',
        requireUserSelection: true,
    });
const destinations = (name) => [
    icon('search'),
    text(name, ['Destinations', 'Recents', 'Favorites', 'Home', 'Work']),
];
const mapOption = (name, title, label, expected) => [
    icon('options'),
    text(`${name}-options`, ['Map layer', "Map's Time of Day"]),
    tap(`${name}-options`, title),
    text(
        `${name}-choices`,
        title === 'Map layer'
            ? ['Standard', 'Standard Satellite']
            : ['Auto', 'Dawn', 'Day', 'Dusk', 'Night'],
    ),
    tap(`${name}-choices`, label),
    state(expected),
    back,
    text(
        `${name}-summary`,
        ['Map layer', "Map's Time of Day", label],
        label === 'Standard' ? ['Standard Satellite'] : [],
    ),
    back,
];
const lightPreset = (key, label) => [
    ...mapOption(`time-${key}`, "Map's Time of Day", label, {
        mapLightPresetPreference: key,
    }),
    ...(key === 'auto' ? [] : [state({ appliedMapLightPreset: key })]),
];

export function buildCarPlayNavigationSuite() {
    return [
        {
            name: 'pans away from the locked location and recenters',
            steps: [
                state({ trackingState: 'active' }),
                screenshot('map-locked'),
                icon('pan'),
                state({ trackingState: 'recenter' }),
                screenshot('pan-mode-ready'),
                { type: 'dragDisplay', from: [0.55, 0.42], to: [0.72, 0.55] },
                state({ trackingState: 'recenter' }),
                screenshot('map-panned'),
                {
                    type: 'assertMapMoved',
                    before: 'pan-mode-ready',
                    after: 'map-panned',
                },
                back,
                icon('recenter'),
                state({ trackingState: 'active' }),
                screenshot('map-recentered'),
            ],
        },
        {
            name: 'opens map options and confirms the available settings',
            steps: [
                icon('options'),
                text('map-options', [
                    'Map layer',
                    "Map's Time of Day",
                    'Rain and snow effects',
                ]),
                { type: 'dragDisplay', from: [0.6, 0.79], to: [0.6, 0.26] },
                text('map-options-lower', [
                    'Police reports',
                    'Prefer private routes',
                    'Route Options',
                ]),
                tap('map-options-lower', 'Route Options'),
                text('route-options', [
                    'ALPR avoidance shape',
                    'Avoid cameras by',
                    'Allow ALPR near start',
                ]),
                back,
                back,
            ],
        },
        {
            name: 'Map Options: switches Standard and Satellite with confirmation',
            steps: [
                ...mapOption(
                    'layer-initial-standard',
                    'Map layer',
                    'Standard',
                    { mapLayer: 'standard' },
                ),
                { type: 'sleep', milliseconds: 1500 },
                screenshot('layer-standard-before'),
                ...mapOption(
                    'layer-satellite',
                    'Map layer',
                    'Standard Satellite',
                    { mapLayer: 'standard-satellite' },
                ),
                { type: 'sleep', milliseconds: 1500 },
                {
                    type: 'assertMapAppearanceChanged',
                    before: 'layer-standard-before',
                    after: 'layer-satellite-map',
                },
                ...mapOption('layer-standard', 'Map layer', 'Standard', {
                    mapLayer: 'standard',
                }),
                { type: 'sleep', milliseconds: 1500 },
                {
                    type: 'assertMapAppearanceChanged',
                    before: 'layer-satellite-map',
                    after: 'layer-standard-map',
                },
            ],
        },
        {
            name: 'Map Options: changes time of day with confirmation',
            steps: [
                ...lightPreset('day', 'Day'),
                screenshot('time-day-map'),
                ...lightPreset('night', 'Night'),
                {
                    type: 'assertMapAppearanceChanged',
                    before: 'time-day-map',
                    after: 'time-night-map',
                },
                ...lightPreset('dawn', 'Dawn'),
                ...lightPreset('dusk', 'Dusk'),
                ...lightPreset('auto', 'Auto'),
            ],
        },
        {
            name: 'Dashboard: Search opens Destinations with no saved Home or Work',
            steps: [
                { type: 'setPrimaryLocations', locations: 'none' },
                state({ home: false, work: false, isNavigating: false }),
                { type: 'openDashboard' },
                text(
                    'dashboard-search-only',
                    ['Search'],
                    ['Home', 'Work', 'Open map', 'Find a destination'],
                ),
                tap('dashboard-search-only', 'Search'),
                text('dashboard-search-destinations', [
                    'Destinations',
                    'Recents',
                    'Favorites',
                    'Keyboard',
                    'Voice search',
                ]),
                state({ previewVisible: false, isNavigating: false }),
                back,
                { type: 'setPrimaryLocations', locations: 'both' },
            ],
        },
        {
            name: 'Dashboard: Home takes priority over Work and opens its route preview',
            steps: [
                { type: 'setPrimaryLocations', locations: 'both' },
                state({ home: true, work: true, isNavigating: false }),
                { type: 'openDashboard' },
                text(
                    'dashboard-home',
                    ['Search', 'Home'],
                    ['Work', 'Open map', 'Find a destination'],
                ),
                tap('dashboard-home', 'Home', {
                    waitForMetro: '[CarPlay] primary-location-selected',
                }),
                ...preview('dashboard-home-preview', 'Home'),
                back,
            ],
        },
        {
            name: 'Dashboard: saved-place changes show Work fallback or Search alone',
            steps: [
                { type: 'setPrimaryLocations', locations: 'both' },
                { type: 'openDashboard' },
                text('dashboard-before-unset', ['Search', 'Home'], ['Work']),
                { type: 'setPrimaryLocations', locations: 'work' },
                state({ home: false, work: true, isNavigating: false }),
                text('dashboard-work-fallback', ['Search', 'Work'], ['Home']),
                { type: 'setPrimaryLocations', locations: 'none' },
                text('dashboard-after-unset', ['Search'], ['Home', 'Work']),
                { type: 'setPrimaryLocations', locations: 'work' },
                text('dashboard-work-restored', ['Search', 'Work'], ['Home']),
                tap('dashboard-work-restored', 'Work', {
                    waitForMetro: '[CarPlay] primary-location-selected',
                }),
                ...preview('dashboard-work-preview', 'Work'),
                back,
                { type: 'setPrimaryLocations', locations: 'both' },
            ],
        },
        {
            name: 'shows native Home and Work shortcuts when saved',
            steps: [
                state({ home: true, work: true }),
                icon('home'),
                ...preview('home-route-choice', 'Home'),
                back,
                icon('work'),
                ...preview('work-route-choice', 'Work'),
                back,
            ],
        },
        {
            name: 'search opens Home Work Recents and Favorites',
            steps: [
                ...destinations('destinations'),
                tap('destinations', 'Recents'),
                text('recents', ['E2E Recent place']),
                back,
                tap('destinations', 'Favorites'),
                text('favorites', ['E2E Favorite place']),
                back,
                back,
            ],
        },
        {
            name: 'Keyboard search for Walmart opens route choices',
            steps: [
                ...destinations('keyboard-destinations'),
                tap('keyboard-destinations', 'Keyboard'),
                { type: 'enterSearchText', text: 'Walmart', submit: false },
                {
                    type: 'waitForMetro',
                    marker: '[CarPlay] search-autocomplete-updated',
                },
                text('keyboard-autocomplete', ['Walmart Supercenter']),
                selectResult('keyboard-autocomplete'),
                ...preview('autocomplete-route-choice', 'Walmart'),
                back,
                ...destinations('submitted-destinations'),
                tap('submitted-destinations', 'Keyboard'),
                { type: 'enterSearchText', text: 'Walmart', submit: false },
                {
                    type: 'waitForMetro',
                    marker: '[CarPlay] search-autocomplete-updated',
                },
                text('submitted-autocomplete', ['Walmart Supercenter']),
                { type: 'submitSearch' },
                ...results('keyboard-results', 'Walmart', 'Destination'),
                selectResult('keyboard-results'),
                ...preview('keyboard-route-choice', 'Walmart'),
                back,
            ],
        },
        ...['Walmart', 'Walmart Delafield'].map((query, index) => ({
            name: `Voice search for ${query} opens route choices`,
            steps: [
                { type: 'armVoiceTranscript', transcript: query },
                ...destinations(`voice-destinations-${index}`),
                tap(`voice-destinations-${index}`, 'Voice search', {
                    waitForMetro: '[E2E] carplay-voice-consumed',
                }),
                ...results(`voice-results-${index}`, query),
                selectResult(`voice-results-${index}`),
                ...preview(`voice-route-choice-${index}`, 'Walmart'),
                ...(index === 0 ? [back] : []),
            ],
        })),
        {
            name: 'starts the searched route and shows navigation controls and guidance',
            steps: [
                { type: 'armVoiceTranscript', transcript: 'Walmart Delafield' },
                ...destinations('start-destinations'),
                tap('start-destinations', 'Voice search', {
                    waitForMetro: '[E2E] carplay-voice-consumed',
                }),
                ...results('start-results', 'Walmart Delafield'),
                selectResult('start-results'),
                ...preview('start-route-choice', 'Walmart'),
                tap('start-route-choice', 'Start', {
                    waitForMetro: '[CarPlay] navigation-start-requested',
                }),
                state({
                    isNavigating: true,
                    panControlVisible: true,
                    previewVisible: false,
                    maneuverText: { nonempty: true },
                    routeDistanceText: { nonempty: true },
                    routeDurationText: { nonempty: true },
                }),
                { type: 'assertNavigationUI', name: 'navigation-running' },
                icon('options', ['Map layer', "Map's Time of Day"]),
                text('navigation-map-options', [
                    'Map layer',
                    "Map's Time of Day",
                ]),
                back,
                icon('steps', ['Steps']),
                text('navigation-steps', ['Steps']),
                back,
                icon('overview'),
                state({
                    drivingMapViewMode: 'route-overview',
                    panControlVisible: false,
                    recenterControlVisible: false,
                }),
                icon('overview'),
                state({
                    drivingMapViewMode: 'perspective',
                    panControlVisible: true,
                }),
                icon('exit'),
                state({ isNavigating: false }),
            ],
        },
    ].map((scenario) => ({
        ...scenario,
        steps: scenario.steps.some(({ type }) => type === 'assertRouteOverview')
            ? [{ type: 'captureRouteOverviewBaseline' }, ...scenario.steps]
            : scenario.steps,
        drive: null,
        stationary: true,
    }));
}

export function carPlayStateMatches(actual, expected) {
    return Object.entries(expected).every(([key, value]) => {
        if (value?.minimum !== undefined || value?.maximum !== undefined)
            return (
                (value.minimum === undefined || actual[key] >= value.minimum) &&
                (value.maximum === undefined || actual[key] <= value.maximum)
            );
        if (value?.nonempty)
            return (
                typeof actual[key] === 'string' && actual[key].trim().length > 0
            );
        return actual[key] === value;
    });
}

export function getCarPlayIconPoint(shot, name) {
    const header = {
        search: 0.146,
        options: 0.245,
        home: 0.846,
        work: 0.946,
        overview: 0.846,
        searchMap: 0.946,
        exit: 0.146,
        steps: 0.946,
    };
    if (name === 'recenter' || name === 'pan')
        return { x: shot.width * 0.96, y: shot.height - shot.width * 0.04 };
    if (!(name in header)) throw new Error(`Unknown CarPlay icon: ${name}`);
    return { x: shot.width * header[name], y: shot.width * 0.037 };
}

export function getCarPlayKeyboardPoints(shot, text, { submit = true } = {}) {
    const rows = [
        { letters: 'qwertyuiop', x: 0.1605, bottom: 0.26 },
        { letters: 'asdfghjkl', x: 0.2023, bottom: 0.187 },
        { letters: 'zxcvbnm', x: 0.2878, bottom: 0.114 },
    ];
    const points = [...text.toLowerCase()].map((letter) => {
        if (letter === ' ')
            return {
                x: shot.width * 0.54,
                y: shot.height - shot.width * 0.041,
            };
        const row = rows.find(({ letters }) => letters.includes(letter));
        if (!row)
            throw new Error(
                `Unsupported CarPlay keyboard character: ${letter}`,
            );
        return {
            x: shot.width * (row.x + row.letters.indexOf(letter) * 0.08455),
            y: shot.height - shot.width * row.bottom,
        };
    });
    return submit
        ? [
              ...points,
              { x: shot.width * 0.88, y: shot.height - shot.width * 0.041 },
          ]
        : points;
}

export function getCarPlayNavigationUIFailure(shot, maneuverText) {
    const normalize = (value) =>
        value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\bwl(?= \d)/g, 'wi')
            .trim();
    const all = shot.observations.map(({ text }) => text).join(' ');
    const footer = shot.observations
        .filter(({ y }) => y > shot.height * 0.8)
        .map(({ text }) => text)
        .join(' ');
    if (
        !maneuverText?.trim() ||
        !normalize(all).includes(normalize(maneuverText))
    )
        return 'The current turn instruction is missing';
    if (!/\barrival\b/i.test(footer)) return 'The arrival estimate is missing';
    if (!/\b\d+\s*(?:min|hr|hrs|h|hours?)\b/i.test(footer))
        return 'The remaining duration is missing';
    if (!/\b\d+(?:[.,]\d+)?\s*(?:mi|ft|km|m)\b/i.test(footer))
        return 'The remaining distance is missing';
    return null;
}
