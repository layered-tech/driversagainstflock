import { CAMERA_MANUFACTURERS } from './camera-manufacturers.js';

export const CAMERA_TYPE_OPTIONS = [
    { label: 'ALPR', value: 'alpr' },
    { label: 'CCTV', value: 'cctv' },
    { label: 'Gantry', value: 'gantry' },
];

export const CAMERA_MANUFACTURER_OPTIONS = [
    ...CAMERA_MANUFACTURERS.map(({ label, value }) => ({ label, value })),
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

export function getCameraSurveillanceTags(type) {
    return type === 'cctv'
        ? { ...CCTV_SURVEILLANCE_TAGS }
        : { ...ALPR_SURVEILLANCE_TAGS };
}

export function getCameraManufacturerTags(manufacturer) {
    const tags = CAMERA_MANUFACTURERS.find(
        ({ value }) => value === manufacturer,
    )?.tags;

    return tags ? { ...tags } : null;
}

export function getCameraManufacturerValue(manufacturerTag) {
    return (
        CAMERA_MANUFACTURERS.find(({ aliases }) =>
            aliases.includes(
                String(manufacturerTag ?? '')
                    .trim()
                    .toLowerCase(),
            ),
        )?.value ?? 'other'
    );
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
