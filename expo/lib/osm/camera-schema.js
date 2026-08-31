export const CAMERA_TYPE_OPTIONS = [
    { label: 'ALPR', value: 'alpr' },
    { label: 'CCTV', value: 'cctv' },
    { label: 'Gantry', value: 'gantry' },
];

export const CAMERA_MANUFACTURER_OPTIONS = [
    { label: 'Flock', value: 'flock' },
    { label: 'Motorola', value: 'motorola' },
    { label: 'Other', value: 'other' },
];

export const CAMERA_MOUNT_OPTIONS = [
    { label: 'Pole', value: 'pole' },
    { label: 'Gantry', value: 'gantry' },
    { label: 'Building', value: 'building' },
    { label: 'Traffic light', value: 'traffic_signals' },
];

export const CAMERA_MOUNT_TAG_VALUES = CAMERA_MOUNT_OPTIONS.map(
    (option) => option.value,
);

const ALPR_SURVEILLANCE_TAGS = {
    'camera:type': 'fixed',
    surveillance: 'public',
    'surveillance:type': 'ALPR',
    'surveillance:zone': 'traffic',
};

const CCTV_SURVEILLANCE_TAGS = {
    'camera:type': 'fixed',
    surveillance: 'public',
    'surveillance:type': 'camera',
};

const MANUFACTURER_TAGS = {
    flock: {
        manufacturer: 'Flock Safety',
        'manufacturer:wikidata': 'Q108485435',
    },
    motorola: {
        manufacturer: 'Motorola Solutions',
        'manufacturer:wikidata': 'Q634815',
    },
};

const MANUFACTURER_TAG_VALUES = {
    'Flock Safety': 'flock',
    'Motorola Solutions': 'motorola',
};

export function getCameraSurveillanceTags(type) {
    return type === 'cctv'
        ? { ...CCTV_SURVEILLANCE_TAGS }
        : { ...ALPR_SURVEILLANCE_TAGS };
}

export function getCameraManufacturerTags(manufacturer) {
    const tags = MANUFACTURER_TAGS[manufacturer];

    return tags ? { ...tags } : null;
}

export function getCameraManufacturerValue(manufacturerTag) {
    return MANUFACTURER_TAG_VALUES[manufacturerTag] ?? 'other';
}

export function normalizeCameraDegrees(degrees) {
    if (typeof degrees !== 'number' || !Number.isFinite(degrees)) {
        return null;
    }

    return ((Math.round(degrees) % 360) + 360) % 360;
}

export function getCameraDirectionTagValue(directions) {
    if (!Array.isArray(directions)) {
        return '';
    }

    return directions
        .map(normalizeCameraDegrees)
        .filter((degrees) => degrees !== null)
        .join(';');
}
