// Manufacturer tags and reference photos: https://deflock.org/identify
export const CAMERA_MANUFACTURERS = [
    {
        value: 'flock',
        label: 'Flock',
        tags: {
            manufacturer: 'Flock Safety',
            'manufacturer:wikidata': 'Q108485435',
        },
        aliases: ['flock', 'flock safety'],
        imageName: 'falcon-alpr',
        referenceImages: ['flock-1.jpg', 'flock-3.jpg', 'flock-5.webp'],
    },
    {
        value: 'motorola',
        label: 'Motorola/Vigilant',
        tags: {
            manufacturer: 'Motorola Solutions',
            'manufacturer:wikidata': 'Q634815',
        },
        aliases: [
            'motorola',
            'motorola solutions',
            'vigilant',
            'vigilant solutions',
        ],
        imageName: 'motorola-alpr',
        referenceImages: [
            'motorola-1.jpg',
            'motorola-2.jpg',
            'motorola-3.jpg',
            'motorola-4.jpg',
        ],
    },
    {
        value: 'genetec',
        label: 'Genetec',
        tags: {
            manufacturer: 'Genetec',
            'manufacturer:wikidata': 'Q30295174',
        },
        aliases: ['genetec'],
        imageName: 'genetec-alpr',
        referenceImages: [
            'genetec-1.webp',
            'genetec-2.webp',
            'genetec-3.webp',
            'genetec-4.webp',
        ],
    },
    {
        value: 'leonardo',
        label: 'Leonardo/ELSAG',
        tags: {
            manufacturer: 'Leonardo',
            'manufacturer:wikidata': 'Q910379',
        },
        aliases: ['leonardo', 'elsag', 'leonardo/elsag'],
        imageName: 'leonardo-alpr',
        referenceImages: ['elsag-1.jpg', 'elsag-2.jpg', 'elsag-4.jpg'],
    },
    {
        value: 'neology',
        label: 'Neology',
        tags: {
            manufacturer: 'Neology, Inc.',
        },
        aliases: ['neology', 'neology, inc.'],
        imageName: 'neology-alpr',
        referenceImages: ['neology-1.jpg', 'neology-2.jpg'],
    },
    {
        value: 'axon',
        label: 'Axon',
        tags: {
            manufacturer: 'Axon Enterprise',
            'manufacturer:wikidata': 'Q690604',
        },
        aliases: ['axon', 'axon enterprise'],
        imageName: 'axon-alpr',
        referenceImages: ['axon-1.webp', 'axon-2.webp', 'axon-3.webp'],
    },
    {
        value: 'verkada',
        label: 'Verkada',
        tags: {
            manufacturer: 'Verkada Inc.',
            'manufacturer:wikidata': 'Q106059747',
        },
        aliases: ['verkada', 'verkada inc.'],
        imageName: 'verkada-alpr',
        referenceImages: [
            'verkada_bullet_cropped.png',
            'verkada_bullet_cropped2.png',
            'LPR1_cropped.png',
            'LPR2_cropped.png',
        ],
    },
];
export const CAMERA_IDENTITY_TAG_KEYS = [
    'manufacturer',
    'manufacturer:wikidata',
    'brand',
    'brand:wikidata',
];
export function getCameraManufacturerMatches(tags = {}) {
    const names = [tags.manufacturer, tags.brand].flatMap((value) =>
        typeof value === 'string'
            ? value.split(';').map((name) => name.trim().toLowerCase())
            : [],
    );
    const ids = [tags['manufacturer:wikidata'], tags['brand:wikidata']].flatMap(
        (value) =>
            typeof value === 'string'
                ? value.split(';').map((id) => id.trim())
                : [],
    );
    return CAMERA_MANUFACTURERS.filter(
        (manufacturer) =>
            manufacturer.aliases.some((name) => names.includes(name)) ||
            (manufacturer.tags['manufacturer:wikidata'] &&
                ids.includes(manufacturer.tags['manufacturer:wikidata'])),
    );
}
