const state = (expected) => ({ type: 'assertAutoPlayState', expected });
const shot = (name) => ({ type: 'screenshot', name, verifyLayout: false });
const text = (name, contains, notContains = []) => ({
    type: 'assertOcr',
    screenshot: name,
    contains,
    notContains,
});
const tap = (name, label, extra = {}) => ({
    type: 'tapOcr',
    screenshot: name,
    text: label,
    exact: true,
    timeout: 10000,
    ...extra,
});
const control = (name, extra = {}) => ({ type: 'tapControl', name, ...extra });
const back = { type: 'hostBack' };
const checkText = (name, contains, notContains = []) => [
    shot(name),
    text(name, contains, notContains),
];
const preview = (name, destination) => [
    state({
        previewVisible: true,
        routeChoiceCount: { minimum: 1 },
        isNavigating: false,
    }),
    ...checkText(name, ['Start', destination]),
    { type: 'assertRouteOverview', name },
];
const search = (name, query) => [
    { type: 'recognizedSearch', query },
    ...checkText(
        name,
        [
            'Search results',
            'Walmart',
            ...(query.includes('Delafield') ? ['Delafield'] : []),
        ],
        ['Searching for'],
    ),
    state({
        isNavigating: false,
        previewVisible: false,
        submittedSearchPinCount: 0,
    }),
    control('searchMap', {
        waitForMetro: '[Android Auto] search-map-results-presented',
    }),
    { type: 'waitForMetro', marker: '[Auto Play] search-results-fitted' },
    ...checkText(
        name,
        [
            'Search results',
            '1.',
            'Walmart',
            ...(query.includes('Delafield') ? ['Delafield'] : []),
        ],
        ['Searching for'],
    ),
    state({ submittedSearchPinCount: { minimum: 1, maximum: 6 } }),
    tap(name, 'Walmart', {
        match: 'result',
        exact: false,
        waitForMetro: '[Android Auto] search-result-selected',
    }),
    ...preview(`${name}-preview`, 'Walmart'),
];
const option = (name, title, label, expected) => [
    control('options'),
    ...checkText(`${name}-options`, ['Map layer', "Map's Time of Day"]),
    tap(`${name}-options`, title),
    ...checkText(
        `${name}-choices`,
        title === 'Map layer'
            ? ['Standard', 'Standard Satellite']
            : ['Auto', 'Dawn', 'Day', 'Dusk', 'Night'],
        ['Rain and snow effects'],
    ),
    tap(`${name}-choices`, label),
    state(expected),
    back,
    ...checkText(
        `${name}-summary`,
        [title, label],
        label === 'Standard' ? ['Standard Satellite'] : [],
    ),
    back,
];

export function buildAndroidAutoNavigationSuite() {
    return [
        {
            name: 'pans away from the locked location and recenters',
            steps: [
                state({ trackingState: 'active' }),
                shot('map-locked'),
                { type: 'dragMap', from: [0.5, 0.45], to: [0.7, 0.6] },
                state({ trackingState: 'recenter' }),
                shot('map-panned'),
                {
                    type: 'assertMapAppearanceChanged',
                    before: 'map-locked',
                    after: 'map-panned',
                },
                control('recenter'),
                state({ trackingState: 'active' }),
            ],
        },
        {
            name: 'opens map options and confirms the available settings',
            steps: [
                control('options'),
                ...checkText('map-options', [
                    'Map layer',
                    "Map's Time of Day",
                    'Rain and snow effects',
                ]),
                { type: 'scrollList' },
                ...checkText('map-options-lower', [
                    'Police reports',
                    'Prefer private routes',
                    'Route Options',
                ]),
                tap('map-options-lower', 'Route Options'),
                ...checkText('route-options', [
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
                ...option('initial-standard', 'Map layer', 'Standard', {
                    mapLayer: 'standard',
                }),
                { type: 'sleep', milliseconds: 1500 },
                shot('layer-standard-before'),
                ...option('satellite', 'Map layer', 'Standard Satellite', {
                    mapLayer: 'standard-satellite',
                }),
                {
                    type: 'assertMapAppearanceChanged',
                    before: 'layer-standard-before',
                    after: 'layer-satellite',
                },
                ...option('standard', 'Map layer', 'Standard', {
                    mapLayer: 'standard',
                }),
                {
                    type: 'assertMapAppearanceChanged',
                    before: 'layer-satellite',
                    after: 'layer-standard',
                },
            ],
        },
        {
            name: 'Map Options: changes time of day with confirmation',
            steps: ['day', 'night', 'dawn', 'dusk', 'auto'].flatMap(
                (preset) => [
                    ...option(
                        `time-${preset}`,
                        "Map's Time of Day",
                        preset[0].toUpperCase() + preset.slice(1),
                        { mapLightPresetPreference: preset },
                    ),
                    ...(preset === 'auto'
                        ? []
                        : [state({ appliedMapLightPreset: preset })]),
                    ...(preset === 'day'
                        ? [shot('time-day')]
                        : preset === 'night'
                          ? [
                                {
                                    type: 'assertMapAppearanceChanged',
                                    before: 'time-day',
                                    after: 'time-night',
                                },
                            ]
                          : []),
                ],
            ),
        },
        {
            name: 'Search: opens saved destinations with no Home or Work',
            steps: [
                { type: 'setPrimaryLocations', locations: 'none' },
                state({ home: false, work: false }),
                control('search'),
                ...checkText(
                    'no-primary-locations',
                    ['Recents', 'Favorites'],
                    ['Home', 'Work'],
                ),
                state({ previewVisible: false, isNavigating: false }),
                back,
            ],
        },
        {
            name: 'Home and Work shortcuts open their route previews',
            steps: [
                state({ home: true, work: true }),
                control('home'),
                ...preview('home-preview', 'Home'),
                back,
                control('work'),
                ...preview('work-preview', 'Work'),
                back,
            ],
        },
        {
            name: 'saved-place changes refresh native Search and Work fallback',
            steps: [
                { type: 'setPrimaryLocations', locations: 'work' },
                state({ home: false, work: true }),
                control('search'),
                ...checkText(
                    'work-only',
                    ['Work', 'Recents', 'Favorites'],
                    ['Home'],
                ),
                { type: 'setPrimaryLocations', locations: 'none' },
                ...checkText(
                    'neither-primary',
                    ['Recents', 'Favorites'],
                    ['Home', 'Work'],
                ),
                { type: 'setPrimaryLocations', locations: 'work' },
                ...checkText('work-restored', ['Work'], ['Home']),
                tap('work-restored', 'Work'),
                ...preview('work-fallback-preview', 'Work'),
                back,
            ],
        },
        {
            name: 'search opens Home Work Recents and Favorites',
            steps: [
                control('search'),
                ...checkText('destinations', ['Home', 'Recents', 'Favorites']),
                { type: 'dismissSearchKeyboard' },
                { type: 'scrollList', from: [0.5, 0.5], to: [0.5, 0.18] },
                ...checkText('destinations-work', ['Work']),
                { type: 'scrollList', from: [0.5, 0.18], to: [0.5, 0.55] },
                ...checkText('destinations-top', ['Recents', 'Favorites']),
                tap('destinations-top', 'Recents'),
                ...checkText('recents', ['E2E Recent place']),
                back,
                ...checkText('destinations-again', ['Favorites']),
                tap('destinations-again', 'Favorites'),
                ...checkText('favorites', ['E2E Favorite place']),
                back,
                back,
            ],
        },
        {
            name: 'Keyboard search for Walmart opens route choices',
            steps: [
                control('search'),
                ...checkText('keyboard-search', ['Where to?']),
                { type: 'enterSearchText', text: 'Walmart' },
                {
                    type: 'waitForMetro',
                    marker: '[Android Auto] search-autocomplete-updated',
                },
                ...checkText('keyboard-autocomplete', ['Walmart Supercenter']),
                tap('keyboard-autocomplete', 'Walmart', {
                    match: 'result',
                    exact: false,
                    waitForMetro: '[Android Auto] search-result-selected',
                }),
                ...preview('keyboard-preview', 'Walmart'),
                back,
            ],
        },
        ...['Walmart', 'Walmart Delafield'].map((query, index) => ({
            name: `Voice search for ${query} opens route choices`,
            steps: [...search(`voice-results-${index}`, query), back],
        })),
        {
            name: 'submitted search keeps results visible until a native selection',
            steps: [
                { type: 'recognizedSearch', query: 'Walmart Delafield' },
                ...checkText(
                    'submitted-results',
                    ['Search results', 'Walmart'],
                    ['Searching for'],
                ),
                { type: 'sleep', milliseconds: 4000 },
                ...checkText('still-results', ['Search results', 'Walmart']),
                state({ previewVisible: false, isNavigating: false }),
                tap('still-results', 'Walmart', {
                    match: 'result',
                    exact: false,
                    waitForMetro: '[Android Auto] search-result-selected',
                }),
                ...preview('submitted-preview', 'Walmart'),
                back,
            ],
        },
        {
            name: 'starts the searched route and shows navigation controls and guidance',
            steps: [
                ...search('start-results', 'Walmart Delafield'),
                tap('start-results-preview', 'Start'),
                state({
                    isNavigating: true,
                    previewVisible: false,
                    maneuverText: { nonempty: true },
                    routeDistanceText: { nonempty: true },
                    routeDurationText: { nonempty: true },
                }),
                { type: 'assertNavigationUI', name: 'navigation-running' },
                control('options', {
                    expectText: ['Map layer', "Map's Time of Day"],
                }),
                ...checkText('navigation-options', [
                    'Map layer',
                    "Map's Time of Day",
                ]),
                back,
                control('steps', { expectText: ['Route steps'] }),
                ...checkText('navigation-steps', ['Route steps']),
                back,
                control('overview'),
                state({
                    drivingMapViewMode: 'route-overview',
                    recenterControlVisible: false,
                }),
                control('overview'),
                state({ drivingMapViewMode: 'perspective' }),
                control('exit', {
                    waitForMetro: '[Android Auto] host-navigation-stopped',
                }),
                state({ isNavigating: false }),
            ],
        },
    ].map((scenario) => ({
        ...scenario,
        steps: scenario.steps.some(({ type }) => type === 'assertRouteOverview')
            ? [{ type: 'captureRouteOverviewBaseline' }, ...scenario.steps]
            : scenario.steps,
        stationary: true,
        group: 'navigation',
    }));
}

export function selectAndroidAutoSuite(suite, environment = {}) {
    const group = environment.ANDROID_AUTO_E2E_SUITE || 'all';
    if (!['all', 'alpr', 'navigation', 'route-choices'].includes(group))
        throw new Error(
            'ANDROID_AUTO_E2E_SUITE must be all, alpr, navigation or route-choices',
        );
    const legacy = suite.tests || [];
    let tests = ['navigation', 'route-choices'].includes(group)
        ? []
        : legacy.filter(({ name }) => name !== 'disconnect');
    if (suite.navigation && group !== 'alpr') {
        for (const layout of ['dashboard', 'fullscreen']) {
            tests.push(
                ...buildAndroidAutoNavigationSuite().map((test) => ({
                    ...test,
                    layout,
                    name: `${layout === 'dashboard' ? 'Dashboard' : 'Fullscreen'}: ${test.name}`,
                })),
            );
        }
    }
    if (group === 'route-choices')
        tests = tests.filter(({ steps }) =>
            steps.some(({ type }) => type === 'assertRouteOverview'),
        );
    const filter = environment.ANDROID_AUTO_E2E_SCENARIO?.toLowerCase();
    if (filter)
        tests = tests.filter(({ name }) => name.toLowerCase().includes(filter));
    if (!tests.length)
        throw new Error(
            'No Android Auto scenarios match the selected suite/scenario',
        );
    return {
        ...suite,
        tests: [
            ...tests,
            ...legacy.filter(({ name }) => name === 'disconnect'),
        ],
    };
}

export function autoPlayStateMatches(actual, expected) {
    return Object.entries(expected).every(([key, value]) => {
        if (value && typeof value === 'object') {
            if (value.nonempty)
                return (
                    typeof actual[key] === 'string' &&
                    actual[key].trim().length > 0
                );
            return (
                typeof actual[key] === 'number' &&
                Number.isFinite(actual[key]) &&
                (value.minimum === undefined || actual[key] >= value.minimum) &&
                (value.maximum === undefined || actual[key] <= value.maximum)
            );
        }
        return actual[key] === value;
    });
}

export function findAndroidAutoText(screenshot, step) {
    const normalize = (value) =>
        String(value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    const label = normalize(step.text);
    const matches = screenshot.textBounds
        .filter(({ text, y }) => {
            const value = normalize(text);
            return step.match === 'result'
                ? y > (step.minimumY ?? 120) &&
                      value.replace(/^\d+ /, '').startsWith(label)
                : step.exact
                  ? value === label
                  : value.includes(label);
        })
        .sort((a, b) => a.y - b.y);
    if (step.match !== 'result' && matches.length !== 1)
        throw new Error(`Expected one Android Auto action: ${step.text}`);
    const match = matches[step.occurrence || 0];
    if (!match) throw new Error(`No visible Android Auto result: ${step.text}`);
    return match;
}

export function getAndroidAutoControlPoint(bounds, name, state) {
    const header = [
        'search',
        ...(!state.isNavigating
            ? ['home', 'work'].filter((key) => state[key])
            : ['steps']),
        'options',
    ];
    const index = header.indexOf(name);
    const size = bounds.controlSize || 76;
    if (name === 'searchMap') {
        return {
            x: bounds.x + bounds.width - size / 2,
            y: bounds.y + size / 2,
        };
    }
    if (name === 'exit' && state.isNavigating) {
        return { x: bounds.x + 64, y: bounds.y + bounds.height - 54 };
    }
    if (index >= 0)
        return {
            x: bounds.x + bounds.width - size * (header.length - index - 0.5),
            y: bounds.y + size / 2,
        };
    if (name === 'overview' || name === 'recenter')
        return {
            x: bounds.x + bounds.width - size / 2,
            y:
                bounds.y +
                bounds.height -
                size *
                    (name === 'recenter'
                        ? 0.5
                        : state.recenterControlVisible
                          ? 1.5
                          : 0.5),
        };
    throw new Error(`Unavailable Android Auto control: ${name}`);
}

export function getAndroidAutoNavigationUIFailure(shot, state, bounds) {
    const normalize = (value) =>
        String(value ?? '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    const appText = shot.textBounds.filter(
        ({ x, y }) =>
            x > bounds.x &&
            x < bounds.x + bounds.width &&
            y > bounds.y &&
            y < bounds.y + bounds.height,
    );
    if (
        !state.maneuverText?.trim() ||
        !normalize(appText.map(({ text }) => text).join(' ')).includes(
            normalize(state.maneuverText),
        )
    )
        return 'The current turn instruction is missing';
    const estimates = appText
        .filter(({ y }) => y > bounds.y + bounds.height * 0.55)
        .map(({ text }) => text)
        .join(' ');
    if (!/\b\d{1,2}[:.]\d{2}(?:\s*[ap]m)?\b/i.test(estimates))
        return 'The arrival estimate is missing';
    if (!/\b\d+\s*(?:min|hr|hrs|h|hours?)\b/i.test(estimates))
        return 'The remaining duration is missing';
    if (!/\b\d+(?:[.,]\d+)?\s*(?:mi|ft|km|m)\b/i.test(estimates))
        return 'The remaining distance is missing';
    return null;
}

export function getAndroidAutoKeyboardPoints(shot, query) {
    const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
    const keys = new Map();
    for (const item of shot.textBounds) {
        const letters = item.text.toLowerCase().replace(/\s/g, '');
        if (item.y < shot.height * 0.4) continue;
        if (/^[a-z]$/.test(letters)) keys.set(letters, item);
        else if (
            letters.length >= 3 &&
            item.width > 0 &&
            rows.some((row) => row.includes(letters))
        ) {
            [...letters].forEach((letter, index) =>
                keys.set(letter, {
                    x:
                        item.x -
                        item.width / 2 +
                        (item.width * (index + 0.5)) / letters.length,
                    y: item.y,
                }),
            );
        }
    }
    // Recover missed glyphs from aligned QWERTY rows; isolated control icons cannot define a keyboard grid.
    const clusters = (row, include = () => true) => {
        const groups = [];
        for (const [column, key] of [...row].entries()) {
            const point = keys.get(key);
            if (!point || !include(point, column)) continue;
            let group = groups.find(
                (items) => Math.abs(items[0].y - point.y) < 15,
            );
            if (!group) {
                group = [];
                groups.push(group);
            }
            group.push({ ...point, column });
        }
        return groups.sort((a, b) => b.length - a.length)[0] || [];
    };
    const top = clusters(rows[0]);
    if (top.length >= 2) {
        const first = top[0],
            last = top.at(-1);
        const pitch = (last.x - first.x) / (last.column - first.column);
        const origin = first.x - first.column * pitch;
        const meanY = (points) =>
            points.reduce((sum, point) => sum + point.y, 0) / points.length;
        const topY = meanY(top);
        const middle = clusters(
            rows[1],
            (point, column) =>
                point.y > topY + pitch * 0.4 &&
                point.y < topY + pitch * 1.3 &&
                Math.abs(point.x - (origin + (column + 0.5) * pitch)) <
                    pitch * 0.3,
        );
        const bottom = clusters(
            rows[2],
            (point, column) =>
                point.y > topY + pitch * 0.9 &&
                point.y < topY + pitch * 2.5 &&
                Math.abs(point.x - (origin + (column + 1) * pitch)) <
                    pitch * 0.3,
        );
        if (pitch > 20 && (middle.length || bottom.length)) {
            const middleY = middle.length
                ? meanY(middle)
                : (topY + meanY(bottom)) / 2;
            const bottomY = bottom.length
                ? meanY(bottom)
                : topY + 2 * (middleY - topY);
            for (const [index, y] of [topY, middleY, bottomY].entries()) {
                [...rows[index]].forEach((key, column) =>
                    keys.set(key, {
                        x: origin + (column + [0, 0.5, 1][index]) * pitch,
                        y,
                    }),
                );
            }
        }
    }
    if (top.length < 2) {
        const middle = clusters(rows[1]);
        const bottom = clusters(rows[2]);
        if (middle.length >= 2 && bottom.length >= 2) {
            const first = bottom[0],
                last = bottom.at(-1);
            const pitch = (last.x - first.x) / (last.column - first.column);
            const origin = first.x - (first.column + 1) * pitch;
            const meanY = (points) =>
                points.reduce((sum, point) => sum + point.y, 0) / points.length;
            const middleY = meanY(middle),
                bottomY = meanY(bottom);
            if (
                pitch > 20 &&
                bottomY - middleY > pitch * 0.4 &&
                bottomY - middleY < pitch * 1.3 &&
                middle.every(
                    (point) =>
                        Math.abs(
                            point.x - (origin + (point.column + 0.5) * pitch),
                        ) <
                        pitch * 0.25,
                ) &&
                bottom.every(
                    (point) =>
                        Math.abs(
                            point.x - (origin + (point.column + 1) * pitch),
                        ) <
                        pitch * 0.25,
                )
            ) {
                for (const [index, y] of [
                    2 * middleY - bottomY,
                    middleY,
                    bottomY,
                ].entries())
                    [...rows[index]].forEach((key, column) =>
                        keys.set(key, {
                            x: origin + (column + [0, 0.5, 1][index]) * pitch,
                            y,
                        }),
                    );
            }
        }
    }
    return [...query.toLowerCase()].map((key) => {
        if (!keys.has(key))
            throw new Error(`Android Auto keyboard key is not visible: ${key}`);
        return keys.get(key);
    });
}

export function getAndroidAutoKeyboardDismissPoint(shot) {
    const [q, a, z] = getAndroidAutoKeyboardPoints(shot, 'qaz');
    const y = z.y + (z.y - a.y);
    if (z.y <= a.y || a.y <= q.y || y >= shot.height)
        throw new Error(
            'Android Auto keyboard hide button is outside the visible keyboard',
        );
    return { x: q.x, y };
}

export function findAndroidAutoInputDisplay(dump) {
    const displays = String(dump)
        .split('\n')
        .filter(
            (line) =>
                line.includes('mBaseDisplayInfo=DisplayInfo') &&
                line.includes(
                    'uniqueId "virtual:com.google.android.projection.gearhead,',
                ) &&
                /, state ON,/.test(line) &&
                /type VIRTUAL/.test(line),
        )
        .flatMap((line) => {
            const match = line.match(
                /DisplayInfo\{"(com\.google\.android\.projection\.gearhead\/[^" ]+)", displayId (\d+).*?real (\d+) x (\d+)/,
            );
            return match
                ? [
                      {
                          name: match[1],
                          id: Number(match[2]),
                          width: Number(match[3]),
                          height: Number(match[4]),
                      },
                  ]
                : [];
        });
    if (displays.length !== 1)
        throw new Error(
            `Expected one active Android Auto input display; found ${displays.length}`,
        );
    return displays[0];
}

export function androidAutoKeyboardIsVisible(dump) {
    return String(dump)
        .split('\n')
        .some(
            (line) =>
                line.includes(
                    'mBaseDisplayInfo=DisplayInfo{"TouchInputMethod"',
                ) &&
                line.includes(
                    'uniqueId "virtual:com.google.android.projection.gearhead,',
                ) &&
                /, state ON,/.test(line),
        );
}
