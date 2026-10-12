import { getCameraDirectionTagValue } from './camera-schema.js';
import { parseNodeDetails } from './edit-tags.js';

export const CAMERA_PRESETS = [
    {
        value: 'flock',
        label: 'Flock Safety',
        model: 'Falcon',
        description:
            'Black oval reader below a solar panel. Look for the rounded lens window and the Flock mark.',
    },
    {
        value: 'motorola',
        label: 'Motorola',
        model: 'Vigilant',
        description:
            'Black rectangular reader with a row of lenses, mounted beside a equipment cabinet on the pole.',
    },
    {
        value: 'genetec',
        label: 'Genetec',
        model: 'AutoVu',
        description:
            'White rectangular housing with a dark oval lens window and several circular lenses.',
    },
    {
        value: 'axon',
        label: 'Axon',
        model: 'Outpost',
        description:
            'Angular grey housing with a yellow-rimmed lens window and a pole clamp. Look for the Axon mark on the side.',
    },
    { value: 'generic', label: 'Generic', model: 'Unknown make' },
    { value: 'custom', label: 'Custom tags', model: 'Write every tag' },
];

export function getPresetTags(preset) {
    const tags = {
        man_made: 'surveillance',
        surveillance: 'public',
        'surveillance:type': 'ALPR',
        'surveillance:zone': 'traffic',
        'camera:type': 'fixed',
    };
    const manufacturer = {
        flock: 'Flock Safety',
        motorola: 'Motorola Solutions',
        genetec: 'Genetec',
        axon: 'Axon',
    }[preset];
    if (manufacturer) tags.manufacturer = manufacturer;
    return tags;
}

export function tagsToRows(tags) {
    return Object.entries(tags ?? {}).map(([key, value]) => ({
        key,
        value: String(value),
    }));
}

export function rowsToTags(rows = []) {
    return Object.fromEntries(
        rows
            .filter((row) => row.key.trim() && row.value !== '')
            .map((row) => [row.key.trim(), row.value]),
    );
}

export function getCameraDetailsFromTags(tags = {}) {
    const preset =
        CAMERA_PRESETS.find(
            ({ value }) =>
                value !== 'custom' &&
                Object.entries(getPresetTags(value)).every(
                    ([key, tag]) => tags[key] === tag,
                ) &&
                (value !== 'generic' || !tags.manufacturer),
        )?.value ?? 'custom';
    const details = parseNodeDetails(tags);
    const ownedKeys = new Set([
        ...Object.keys(getPresetTags(preset)),
        'operator',
        'direction',
        'camera:direction',
        'camera:mount',
    ]);
    return {
        ...details,
        preset,
        rawTags: tagsToRows(tags),
        extraTags: tagsToRows(
            Object.fromEntries(
                Object.entries(tags).filter(([key]) => !ownedKeys.has(key)),
            ),
        ),
        originalTags: { ...tags },
    };
}

export function getCameraFormTags(details = {}) {
    if (details.preset === 'custom') return rowsToTags(details.rawTags);
    const tags = {
        ...getPresetTags(details.preset ?? details.manufacturer ?? 'generic'),
        ...rowsToTags(details.extraTags),
    };
    if (details.operator?.trim()) tags.operator = details.operator.trim();
    const direction = getCameraDirectionTagValue(details.directions);
    if (direction) tags['camera:direction'] = direction;
    if (details.mount) tags['camera:mount'] = details.mount;
    if (details.originalTags) {
        const original = parseNodeDetails(details.originalTags);
        for (const [field, keys] of [
            ['operator', ['operator']],
            ['directions', ['direction', 'camera:direction']],
            ['mount', ['camera:mount']],
        ]) {
            if (
                JSON.stringify(details[field]) ===
                JSON.stringify(original[field])
            ) {
                for (const key of keys) {
                    delete tags[key];
                    if (Object.hasOwn(details.originalTags, key))
                        tags[key] = details.originalTags[key];
                }
            }
        }
    }
    return tags;
}

export function validateCameraTagRows(rows = []) {
    const keys = rows
        .filter((row) => row.key.trim())
        .map((row) => row.key.trim());
    if (new Set(keys).size !== keys.length)
        return 'Each tag key must be unique.';
    if (rows.some((row) => Boolean(row.key.trim()) !== Boolean(row.value)))
        return 'Give every tag a key and a value, or remove the empty row.';
    return null;
}

export function getCameraChangeLabel(details = {}) {
    const tags = getCameraFormTags(details);
    const label =
        tags['surveillance:type'] === 'ALPR' ? 'ALPR reader' : 'Camera';
    return tags.manufacturer ? `${label} · ${tags.manufacturer}` : label;
}
