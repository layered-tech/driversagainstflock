const COMPASS_ABBREVIATIONS = {
    north: 'n',
    south: 's',
    east: 'e',
    west: 'w',
    northeast: 'ne',
    northwest: 'nw',
    southeast: 'se',
    southwest: 'sw',
};
const STREET_TYPE_ABBREVIATIONS = {
    avenue: 'ave',
    boulevard: 'blvd',
    circle: 'cir',
    court: 'ct',
    crescent: 'cres',
    drive: 'dr',
    highway: 'hwy',
    lane: 'ln',
    parkway: 'pkwy',
    place: 'pl',
    road: 'rd',
    square: 'sq',
    street: 'st',
    terrace: 'ter',
    trail: 'trl',
};
const STREET_NAME_PREFIX_ABBREVIATIONS = {
    fort: 'ft',
    mount: 'mt',
    saint: 'st',
};

// At driving pitch, Standard places its road labels toward the camera.
// Fill the forward view and let the basemap continue labeling behind the puck.
const FORWARD_STREET_LABEL_FILTER = [
    'all',
    ['>=', ['pitch'], 55],
    ['>=', ['distance-from-center'], 0.04],
    [
        '<=',
        ['distance-from-center'],
        ['interpolate', ['linear'], ['zoom'], 14, 0.9, 17, 1.7],
    ],
    ['has', 'name'],
    [
        'match',
        ['get', 'class'],
        ['primary', 'secondary', 'tertiary', 'street', 'street_limited'],
        true,
        false,
    ],
];

function getWordVariants(word, abbreviations) {
    const normalizedWord = word.replace(/\.$/, '');
    const pair = Object.entries(abbreviations).find(
        ([full, short]) => normalizedWord === full || normalizedWord === short,
    );

    return pair ? [...pair, `${pair[1]}.`] : [word];
}

function getRoadNameVariants(roadName) {
    const words = roadName.trim().toLowerCase().split(/\s+/);
    if (words.length === 1) return words;

    const variants = words.map((word) => [word]);
    const lastIndex = words.length - 1;
    const trailingDirections =
        words.length > 2
            ? getWordVariants(words[lastIndex], COMPASS_ABBREVIATIONS)
            : variants[lastIndex];
    const nameEndIndex = lastIndex - Number(trailingDirections.length > 1);
    const typeIndex = /^\d+[a-z]?$/.test(words[nameEndIndex])
        ? nameEndIndex - 1
        : nameEndIndex;

    variants[lastIndex] = trailingDirections;
    if (nameEndIndex >= 2) {
        variants[0] = getWordVariants(words[0], COMPASS_ABBREVIATIONS);
    }

    const nameStartIndex = Number(variants[0].length > 1);
    if (nameStartIndex < typeIndex) {
        variants[nameStartIndex] = getWordVariants(
            words[nameStartIndex],
            STREET_NAME_PREFIX_ABBREVIATIONS,
        );
    }

    variants[typeIndex] = getWordVariants(
        words[typeIndex],
        STREET_TYPE_ABBREVIATIONS,
    );

    return variants
        .reduce(
            (names, words) =>
                names.flatMap((name) => words.map((word) => `${name} ${word}`)),
            [''],
        )
        .map((name) => name.trimStart());
}

export function getDrivingStreetLabelFilter(currentRoadName) {
    if (!currentRoadName.trim()) return FORWARD_STREET_LABEL_FILTER;

    const currentRoadNames = ['literal', getRoadNameVariants(currentRoadName)];
    return [
        ...FORWARD_STREET_LABEL_FILTER,
        [
            '!',
            [
                'any',
                ...['name', 'name_en'].map((field) => [
                    'in',
                    ['downcase', ['coalesce', ['get', field], '']],
                    currentRoadNames,
                ]),
            ],
        ],
    ];
}
