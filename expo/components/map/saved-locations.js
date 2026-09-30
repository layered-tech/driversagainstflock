import {
    getPrivateCacheItem,
    setPrivateCacheItem,
} from '../../lib/private-cache-storage';
import {
    createEmptyPrimaryLocations,
    parseStoredPrimaryLocations,
    updatePrimaryLocations,
} from './primary-locations';

const RECENT_LOCATIONS_STORAGE_KEY =
    'driversagainstflock.mapSearch.recentLocations.v1';
const FAVORITE_LOCATIONS_STORAGE_KEY =
    'driversagainstflock.mapSearch.favoriteLocations.v1';
const PRIMARY_LOCATIONS_STORAGE_KEY =
    'driversagainstflock.mapSearch.primaryLocations.v1';
const RECENT_LOCATIONS_LIMIT = 5;

const primaryLocationsListeners = new Set();
const searchSavedLocationsListeners = new Set();
const locationLoads = new Map();
const locationWrites = new Map();
const locationStateKeys = {
    [RECENT_LOCATIONS_STORAGE_KEY]: 'recentLocations',
    [FAVORITE_LOCATIONS_STORAGE_KEY]: 'favoriteLocations',
    [PRIMARY_LOCATIONS_STORAGE_KEY]: 'primaryLocations',
};
let savedLocationsSnapshot = {
    favoriteLocations: [],
    primaryLocations: createEmptyPrimaryLocations(),
    recentLocations: [],
};

function publishLocations(key, locations) {
    savedLocationsSnapshot = {
        ...savedLocationsSnapshot,
        [locationStateKeys[key]]: locations,
    };
    searchSavedLocationsListeners.forEach((listener) => {
        try {
            listener(savedLocationsSnapshot);
        } catch {}
    });
}

function queueLocationUpdate(key, update) {
    const operation = (locationWrites.get(key) ?? Promise.resolve())
        .catch(() => {})
        .then(update);

    locationWrites.set(key, operation);
    const release = () => {
        if (locationWrites.get(key) === operation) {
            locationWrites.delete(key);
        }
    };
    operation.then(release, release);

    return operation;
}

function getSafeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function getSafeNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

function parseStoredLocations(value) {
    if (!value) {
        return [];
    }

    try {
        const locations = JSON.parse(value);

        return Array.isArray(locations)
            ? locations.map(normalizeSavedLocation).filter(Boolean)
            : [];
    } catch {
        return [];
    }
}

function getLocationKey(location) {
    return getSafeString(location?.placeId) || getSafeString(location?.id);
}

export function savedLocationsMatch(a, b) {
    const aKey = getLocationKey(a);
    const bKey = getLocationKey(b);

    return Boolean(aKey && bKey && aKey === bKey);
}

export function normalizeSavedLocation(location) {
    const placeId =
        getSafeString(location?.placeId) || getSafeString(location?.id);
    const id = getSafeString(location?.id) || placeId;
    const name =
        getSafeString(location?.name) ||
        getSafeString(location?.primaryText) ||
        getSafeString(location?.label);
    const address =
        getSafeString(location?.address) ||
        getSafeString(location?.secondaryText) ||
        getSafeString(location?.subtitle);
    const typeLabel =
        getSafeString(location?.typeLabel) ||
        getSafeString(location?.locationType) ||
        getSafeString(location?.type);
    const latitude =
        getSafeNumber(location?.latitude) ??
        getSafeNumber(location?.location?.latitude);
    const longitude =
        getSafeNumber(location?.longitude) ??
        getSafeNumber(location?.location?.longitude);
    const savedLocation = {
        id,
        placeId,
        name,
    };

    if (!placeId || !name) {
        return null;
    }

    if (address) {
        savedLocation.address = address;
    }

    if (typeLabel) {
        savedLocation.typeLabel = typeLabel;
    }

    if (latitude !== null && longitude !== null) {
        savedLocation.latitude = latitude;
        savedLocation.longitude = longitude;
    }

    if (Number.isFinite(location?.selectedAt)) {
        savedLocation.selectedAt = location.selectedAt;
    }

    if (Number.isFinite(location?.favoritedAt)) {
        savedLocation.favoritedAt = location.favoritedAt;
    }

    return savedLocation;
}

function normalizePrimaryLocation(location) {
    const savedLocation = normalizeSavedLocation(location);

    if (
        !savedLocation ||
        !Number.isFinite(savedLocation.latitude) ||
        !Number.isFinite(savedLocation.longitude)
    ) {
        return null;
    }

    return savedLocation;
}

function notifyPrimaryLocationsListeners(primaryLocations) {
    primaryLocationsListeners.forEach((listener) => {
        try {
            listener(primaryLocations);
        } catch {}
    });
}

export function formatSavedLocationDescription(location) {
    const savedLocation = normalizeSavedLocation(location);

    if (!savedLocation) {
        return '';
    }

    if (!savedLocation.typeLabel) {
        return savedLocation.address || '';
    }

    if (!savedLocation.address) {
        return savedLocation.typeLabel;
    }

    if (savedLocation.address.startsWith(`${savedLocation.typeLabel} - `)) {
        return savedLocation.address;
    }

    return `${savedLocation.typeLabel} - ${savedLocation.address}`;
}

export function createSavedLocationFromPlace({
    result,
    place,
    name,
    address,
    typeLabel,
}) {
    return normalizeSavedLocation({
        address:
            address ||
            result?.address ||
            place?.formattedAddress ||
            place?.shortFormattedAddress ||
            '',
        id: place?.id || result?.id || result?.placeId,
        latitude: place?.location?.latitude,
        longitude: place?.location?.longitude,
        name: name || result?.primaryText || result?.label,
        placeId: result?.placeId || place?.id || result?.id,
        secondaryText: result?.secondaryText,
        typeLabel: typeLabel || result?.typeLabel,
    });
}

export function createSearchResultFromSavedLocation(location) {
    const savedLocation = normalizeSavedLocation(location);

    if (!savedLocation) {
        return null;
    }

    const description = formatSavedLocationDescription(savedLocation);

    return {
        address: savedLocation.address || '',
        id: savedLocation.id,
        label: [savedLocation.name, description].filter(Boolean).join(', '),
        placeId: savedLocation.placeId,
        primaryText: savedLocation.name,
        secondaryText: description,
        typeLabel: savedLocation.typeLabel || '',
    };
}

function loadLocations(key, parse = parseStoredLocations) {
    if (!locationLoads.has(key)) {
        const load = Promise.resolve()
            .then(() => getPrivateCacheItem(key))
            .then((storedValue) => {
                const locations = parse(storedValue);

                publishLocations(key, locations);

                return locations;
            })
            .catch((error) => {
                locationLoads.delete(key);
                throw error;
            });

        locationLoads.set(key, load);
    }

    return locationLoads.get(key);
}

async function setLocations(key, locations) {
    await setPrivateCacheItem(key, JSON.stringify(locations));
    locationLoads.set(key, Promise.resolve(locations));
    publishLocations(key, locations);
}

export async function loadSearchSavedLocations() {
    await Promise.all([
        loadLocations(RECENT_LOCATIONS_STORAGE_KEY),
        loadLocations(FAVORITE_LOCATIONS_STORAGE_KEY),
        loadPrimaryLocations(),
    ]);

    return savedLocationsSnapshot;
}

export function addPrimaryLocationsListener(listener) {
    primaryLocationsListeners.add(listener);

    return () => {
        primaryLocationsListeners.delete(listener);
    };
}

export function addSearchSavedLocationsListener(listener) {
    searchSavedLocationsListeners.add(listener);

    return () => {
        searchSavedLocationsListeners.delete(listener);
    };
}

export async function loadPrimaryLocations() {
    return loadLocations(PRIMARY_LOCATIONS_STORAGE_KEY, (storedValue) =>
        parseStoredPrimaryLocations(storedValue, normalizePrimaryLocation),
    );
}

export async function savePrimaryLocation(type, location) {
    return queueLocationUpdate(PRIMARY_LOCATIONS_STORAGE_KEY, async () => {
        const primaryLocations = await loadPrimaryLocations();
        const normalizedLocation =
            location === null ? null : normalizePrimaryLocation(location);

        if (location !== null && !normalizedLocation) {
            throw new Error('This place has no usable location.');
        }

        const updatedLocations = updatePrimaryLocations(
            primaryLocations,
            type,
            normalizedLocation,
            (primaryLocation) => primaryLocation,
        );

        const savedPrimaryLocations = {
            ...createEmptyPrimaryLocations(),
            ...updatedLocations,
        };

        await setLocations(
            PRIMARY_LOCATIONS_STORAGE_KEY,
            savedPrimaryLocations,
        );
        notifyPrimaryLocationsListeners(savedPrimaryLocations);

        return savedPrimaryLocations;
    });
}

export async function addRecentLocation(location) {
    return queueLocationUpdate(RECENT_LOCATIONS_STORAGE_KEY, async () => {
        const savedLocation = normalizeSavedLocation(location);

        if (!savedLocation) {
            return loadLocations(RECENT_LOCATIONS_STORAGE_KEY);
        }

        const recentLocations = await loadLocations(
            RECENT_LOCATIONS_STORAGE_KEY,
        );
        const updatedLocations = [
            {
                ...savedLocation,
                selectedAt: Date.now(),
            },
            ...recentLocations.filter((recentLocation) => {
                return !savedLocationsMatch(recentLocation, savedLocation);
            }),
        ].slice(0, RECENT_LOCATIONS_LIMIT);

        await setLocations(RECENT_LOCATIONS_STORAGE_KEY, updatedLocations);

        return updatedLocations;
    });
}

export async function toggleFavoriteLocation(location) {
    return queueLocationUpdate(FAVORITE_LOCATIONS_STORAGE_KEY, async () => {
        const savedLocation = normalizeSavedLocation(location);
        const favoriteLocations = await loadLocations(
            FAVORITE_LOCATIONS_STORAGE_KEY,
        );

        if (!savedLocation) {
            return {
                favoriteLocations,
                isFavorite: false,
            };
        }

        const isFavorite = favoriteLocations.some((favoriteLocation) => {
            return savedLocationsMatch(favoriteLocation, savedLocation);
        });
        const updatedLocations = isFavorite
            ? favoriteLocations.filter((favoriteLocation) => {
                  return !savedLocationsMatch(favoriteLocation, savedLocation);
              })
            : [
                  {
                      ...savedLocation,
                      favoritedAt: Date.now(),
                  },
                  ...favoriteLocations,
              ];

        await setLocations(FAVORITE_LOCATIONS_STORAGE_KEY, updatedLocations);

        return {
            favoriteLocations: updatedLocations,
            isFavorite: !isFavorite,
        };
    });
}

export async function updateFavoriteLocation(location) {
    return queueLocationUpdate(FAVORITE_LOCATIONS_STORAGE_KEY, async () => {
        const savedLocation = normalizeSavedLocation(location);
        const favoriteLocations = await loadLocations(
            FAVORITE_LOCATIONS_STORAGE_KEY,
        );

        if (!savedLocation) {
            return favoriteLocations;
        }

        let didUpdate = false;
        const updatedLocations = favoriteLocations.map((favoriteLocation) => {
            if (!savedLocationsMatch(favoriteLocation, savedLocation)) {
                return favoriteLocation;
            }

            const updatedLocation = {
                ...favoriteLocation,
                ...savedLocation,
                favoritedAt:
                    favoriteLocation.favoritedAt ??
                    savedLocation.favoritedAt ??
                    Date.now(),
            };

            if (
                Object.keys(updatedLocation).every(
                    (key) => updatedLocation[key] === favoriteLocation[key],
                )
            ) {
                return favoriteLocation;
            }

            didUpdate = true;

            return updatedLocation;
        });

        if (didUpdate) {
            await setLocations(
                FAVORITE_LOCATIONS_STORAGE_KEY,
                updatedLocations,
            );
        }

        return didUpdate ? updatedLocations : favoriteLocations;
    });
}
