import { APP_ENVIRONMENT } from './config';
import { setCachedPlaceDetails } from './place-details-cache';
import {
    addRecentLocation,
    loadSearchSavedLocations,
    savePrimaryLocation,
    toggleFavoriteLocation,
} from './saved-locations';

let nextTranscript = null;

const PRIMARY_LOCATIONS = {
    home: {
        id: 'carplay-e2e-home',
        name: 'Home',
        address: 'Pewaukee Road',
        latitude: 43.0969,
        longitude: -88.24412,
    },
    work: {
        id: 'carplay-e2e-work',
        name: 'Work',
        address: 'State Highway 164',
        latitude: 43.12152,
        longitude: -88.24447,
    },
};

async function cacheFixtureLocation(location) {
    await setCachedPlaceDetails(location.id, {
        id: location.id,
        displayName: { text: location.name },
        formattedAddress: location.address,
        location: {
            latitude: location.latitude,
            longitude: location.longitude,
        },
    });
}

async function setPrimaryLocations(locations) {
    for (const type of ['home', 'work']) {
        const location =
            locations === 'both' || locations === type
                ? PRIMARY_LOCATIONS[type]
                : null;
        if (location) await cacheFixtureLocation(location);
        await savePrimaryLocation(type, location);
    }
}

export function getCarPlayE2EVoice(nativeVoice) {
    if (APP_ENVIRONMENT !== 'e2e' || nextTranscript === null)
        return nativeVoice;
    return {
        hasVoiceInputPermission: () => true,
        stopVoiceInput() {},
        async startVoiceInput() {
            const transcription = nextTranscript;
            nextTranscript = null;
            console.info(
                '[E2E] carplay-voice-consumed ' +
                    JSON.stringify({ transcription }),
            );
            return { transcription };
        },
    };
}

export async function runCarPlayE2ECommand(
    query,
    getSnapshot,
    resetUI,
    platform = 'carplay',
    onSearch,
    getMapSnapshot,
) {
    if (APP_ENVIRONMENT !== 'e2e') return false;
    const {
        command,
        locations,
        transcript,
        query: searchQuery,
    } = JSON.parse(query);
    if (command === 'reset') {
        nextTranscript = null;
        await resetUI();
        console.info(`[E2E] ${platform}-ui-reset`);
    } else if (command === 'seed') {
        const { home, work } = PRIMARY_LOCATIONS;
        await setPrimaryLocations('both');
        const recent = {
            ...home,
            id: 'carplay-e2e-recent',
            name: 'E2E Recent place',
        };
        const favorite = {
            ...work,
            id: 'carplay-e2e-favorite',
            name: 'E2E Favorite place',
        };
        await cacheFixtureLocation(recent);
        await cacheFixtureLocation(favorite);
        await addRecentLocation(recent);
        const saved = await loadSearchSavedLocations();
        if (!saved.favoriteLocations.some(({ id }) => id === favorite.id)) {
            await toggleFavoriteLocation(favorite);
        }
        console.info(`[E2E] ${platform}-seeded`);
    } else if (
        command === 'locations' &&
        ['both', 'home', 'work', 'none'].includes(locations)
    ) {
        await setPrimaryLocations(locations);
        console.info(
            `[E2E] ${platform}-locations-set ` + JSON.stringify({ locations }),
        );
    } else if (
        command === 'voice' &&
        ['Walmart', 'Walmart Delafield'].includes(transcript)
    ) {
        nextTranscript = transcript;
        console.info('[E2E] carplay-voice-armed');
    } else if (
        command === 'search' &&
        platform === 'android-auto' &&
        ['Walmart', 'Walmart Delafield'].includes(searchQuery)
    ) {
        await onSearch(searchQuery);
    } else if (command === 'route-render') {
        console.info(
            `[E2E] ${platform}-route-render ` +
                JSON.stringify(await getMapSnapshot()),
        );
    } else if (command === 'state') {
        console.info(
            `[E2E] ${platform}-state ` + JSON.stringify(getSnapshot()),
        );
    } else {
        throw new Error(
            `Unsupported ${platform === 'carplay' ? 'CarPlay' : 'Android Auto'} E2E command`,
        );
    }
    return true;
}
