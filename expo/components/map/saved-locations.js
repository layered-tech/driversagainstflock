import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_LOCATIONS_STORAGE_KEY =
    'driversagainstflock.mapSearch.recentLocations.v1';
const FAVORITE_LOCATIONS_STORAGE_KEY =
    'driversagainstflock.mapSearch.favoriteLocations.v1';
const RECENT_LOCATIONS_LIMIT = 5;

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
    const websiteUri = getSafeString(location?.websiteUri);
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

    if (websiteUri) {
        savedLocation.websiteUri = websiteUri;
    }

    if (Number.isFinite(location?.selectedAt)) {
        savedLocation.selectedAt = location.selectedAt;
    }

    if (Number.isFinite(location?.favoritedAt)) {
        savedLocation.favoritedAt = location.favoritedAt;
    }

    return savedLocation;
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
        websiteUri: place?.websiteUri,
    });
}

export function createSearchResultFromSavedLocation(location) {
    const savedLocation = normalizeSavedLocation(location);

    if (!savedLocation) {
        return null;
    }

    return {
        address: savedLocation.address || '',
        id: savedLocation.id,
        label: [
            savedLocation.name,
            formatSavedLocationDescription(savedLocation),
        ]
            .filter(Boolean)
            .join(', '),
        placeId: savedLocation.placeId,
        primaryText: savedLocation.name,
        secondaryText: formatSavedLocationDescription(savedLocation),
        typeLabel: savedLocation.typeLabel || '',
    };
}

async function loadLocations(key) {
    const storedValue = await AsyncStorage.getItem(key);

    return parseStoredLocations(storedValue);
}

async function setLocations(key, locations) {
    await AsyncStorage.setItem(key, JSON.stringify(locations));
}

export async function loadSearchSavedLocations() {
    const [recentLocations, favoriteLocations] = await Promise.all([
        loadLocations(RECENT_LOCATIONS_STORAGE_KEY),
        loadLocations(FAVORITE_LOCATIONS_STORAGE_KEY),
    ]);

    return {
        favoriteLocations,
        recentLocations,
    };
}

export async function addRecentLocation(location) {
    const savedLocation = normalizeSavedLocation(location);

    if (!savedLocation) {
        return loadLocations(RECENT_LOCATIONS_STORAGE_KEY);
    }

    const recentLocations = await loadLocations(RECENT_LOCATIONS_STORAGE_KEY);
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
}

export async function toggleFavoriteLocation(location) {
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
}

export async function updateFavoriteLocation(location) {
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

        didUpdate = true;

        return {
            ...favoriteLocation,
            ...savedLocation,
            favoritedAt:
                favoriteLocation.favoritedAt ??
                savedLocation.favoritedAt ??
                Date.now(),
        };
    });

    if (didUpdate) {
        await setLocations(FAVORITE_LOCATIONS_STORAGE_KEY, updatedLocations);
    }

    return updatedLocations;
}
