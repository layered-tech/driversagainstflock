import AsyncStorage from '@react-native-async-storage/async-storage';

export const CONTRIBUTE_COACH_MARK_STORAGE_KEY =
    'driversagainstflock.contributeCoachMark.v1';
export const CONTRIBUTE_DRAFT_STORAGE_KEY =
    'driversagainstflock.contributeDraft.v1';

const CONTRIBUTE_DRAFT_STORAGE_VERSION = 1;

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStoredChangeset(changeset) {
    if (
        !isPlainObject(changeset) ||
        typeof changeset.comment !== 'string' ||
        typeof changeset.hashtags !== 'string' ||
        typeof changeset.source !== 'string'
    ) {
        return null;
    }

    return {
        comment: changeset.comment,
        hashtags: changeset.hashtags,
        source: changeset.source,
    };
}

function parseStoredPins(pins) {
    if (!Array.isArray(pins) || pins.length === 0) {
        return null;
    }

    const parsedPins = [];

    for (const pin of pins) {
        if (
            !isPlainObject(pin) ||
            typeof pin.id !== 'string' ||
            !pin.id ||
            !Number.isFinite(pin.latitude) ||
            !Number.isFinite(pin.longitude) ||
            !isPlainObject(pin.details)
        ) {
            return null;
        }

        parsedPins.push({
            details: pin.details,
            id: pin.id,
            latitude: pin.latitude,
            longitude: pin.longitude,
        });
    }

    return parsedPins;
}

export async function readStoredDraft() {
    try {
        const storedValue = await AsyncStorage.getItem(
            CONTRIBUTE_DRAFT_STORAGE_KEY,
        );

        if (!storedValue) {
            return null;
        }

        const parsedValue = JSON.parse(storedValue);

        if (
            !isPlainObject(parsedValue) ||
            parsedValue.version !== CONTRIBUTE_DRAFT_STORAGE_VERSION ||
            typeof parsedValue.updatedAt !== 'string'
        ) {
            return null;
        }

        const changeset = parseStoredChangeset(parsedValue.changeset);
        const pins = parseStoredPins(parsedValue.pins);

        if (!changeset || !pins) {
            return null;
        }

        return {
            changeset,
            pins,
            updatedAt: parsedValue.updatedAt,
        };
    } catch {
        return null;
    }
}

export async function writeStoredDraft({ changeset, pins }) {
    const storedDraft = {
        changeset,
        pins,
        updatedAt: new Date().toISOString(),
        version: CONTRIBUTE_DRAFT_STORAGE_VERSION,
    };

    try {
        await AsyncStorage.setItem(
            CONTRIBUTE_DRAFT_STORAGE_KEY,
            JSON.stringify(storedDraft),
        );

        return storedDraft;
    } catch {
        return null;
    }
}

export async function clearStoredDraft() {
    try {
        await AsyncStorage.removeItem(CONTRIBUTE_DRAFT_STORAGE_KEY);
    } catch {
        // Draft cleanup should never interrupt the contribute flow.
    }
}

export async function readCoachMarkDismissed() {
    try {
        const storedValue = await AsyncStorage.getItem(
            CONTRIBUTE_COACH_MARK_STORAGE_KEY,
        );

        return storedValue === 'true';
    } catch {
        return false;
    }
}

export async function writeCoachMarkDismissed() {
    try {
        await AsyncStorage.setItem(CONTRIBUTE_COACH_MARK_STORAGE_KEY, 'true');
    } catch {
        // Coach-mark persistence is a convenience only.
    }
}
