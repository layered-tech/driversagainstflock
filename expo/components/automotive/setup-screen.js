import {
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';
import {
    ActivityIndicator,
    AppState,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { DafButton } from '../design-system/primitives';
import { SystemBars } from '../root/system-bars';
import { getPlaceDetails, searchTextPlaces } from '../map/api';
import {
    addSearchSavedLocationsListener,
    createSavedLocationFromPlace,
    getSearchSavedLocationsSnapshot,
    loadSearchSavedLocations,
    savedLocationsMatch,
    savePrimaryLocation,
    toggleFavoriteLocation,
} from '../map/saved-locations';
import {
    getPrivateCacheItem,
    setPrivateCacheItem,
} from '../../lib/private-cache-storage';
import { createAutomotiveSetupStore } from './setup-store';
import { automotiveLocationPermissions } from './runtime';
import {
    finishAutomotiveSetup,
    openAutomotiveAppSettings,
    openAutomotiveLocationSettings,
} from './native';

const DRAFT_KEY = 'driversagainstflock.automotive.setupDraft.v1';

function SetupContents() {
    const [draft, setDraft] = useState(null);
    const [savedReady, setSavedReady] = useState(false);
    const [results, setResults] = useState([]);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [locationMessage, setLocationMessage] =
        useState('Checking location…');
    const mounted = useRef(true);
    const saved = useSyncExternalStore(
        addSearchSavedLocationsListener,
        getSearchSavedLocationsSnapshot,
        getSearchSavedLocationsSnapshot,
    );
    const store = useMemo(
        () =>
            createAutomotiveSetupStore({
                read: () => getPrivateCacheItem(DRAFT_KEY),
                write: (value) => setPrivateCacheItem(DRAFT_KEY, value),
                search: searchTextPlaces,
                resolvePlace: getPlaceDetails,
                toSavedLocation: createSavedLocationFromPlace,
                savePrimary: savePrimaryLocation,
                toggleFavorite: toggleFavoriteLocation,
                getSnapshot: getSearchSavedLocationsSnapshot,
                matches: savedLocationsMatch,
            }),
        [],
    );
    const checkLocation = async () => {
        try {
            const state = await automotiveLocationPermissions.ensure({
                request: false,
            });
            if (mounted.current)
                setLocationMessage(
                    state.ready ? 'Location is ready.' : state.message,
                );
        } catch {
            if (mounted.current)
                setLocationMessage('Location could not be checked. Try again.');
        }
    };
    useEffect(() => {
        mounted.current = true;
        void store.loadDraft().then((value) => {
            if (mounted.current) setDraft(value);
        });
        void loadSearchSavedLocations()
            .then(() => {
                if (mounted.current) setSavedReady(true);
            })
            .catch(() => {
                if (mounted.current)
                    setMessage(
                        'Saved places could not be loaded. Close setup and try again.',
                    );
            });
        void checkLocation();
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') void checkLocation();
        });
        return () => {
            mounted.current = false;
            store.cancelSearch();
            subscription.remove();
        };
    }, [store]);
    const updateDraft = (patch) => {
        const next = { ...draft, ...patch };
        store.cancelSearch();
        setDraft(next);
        setResults([]);
        setMessage('');
        void store.saveDraft(next).catch(() => {
            if (mounted.current)
                setMessage('Your search could not be saved for later.');
        });
    };
    const run = async (operation, success = '') => {
        if (busy) return;
        setBusy(true);
        setMessage('');
        try {
            await operation();
            if (mounted.current && success) setMessage(success);
        } catch (error) {
            if (mounted.current && error?.name !== 'AbortError')
                setMessage(
                    'That action could not be completed. Check the connection and try again.',
                );
        } finally {
            if (mounted.current) setBusy(false);
        }
    };
    const search = () =>
        run(async () => {
            const found = await store.search(draft.query);
            if (found && mounted.current) {
                setResults(found);
                if (!found.length)
                    setMessage(
                        'No places found. Try a different name or address.',
                    );
            }
        });
    return (
        <SafeAreaView className="flex-1 bg-daf-surface-page dark:bg-daf-surface-dark">
            <SystemBars />
            <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerClassName="gap-6 p-6"
            >
                <View className="flex-row flex-wrap items-center justify-between gap-4">
                    <Text
                        accessibilityRole="header"
                        className="text-2xl font-bold text-daf-text-primary dark:text-white"
                    >
                        Car setup
                    </Text>
                    <DafButton
                        size="lg"
                        onPress={() => run(finishAutomotiveSetup)}
                    >
                        Back to map
                    </DafButton>
                </View>
                <Text className="text-lg text-daf-text-secondary dark:text-neutral-200">
                    Set up navigation while parked. Saved places stay on this
                    car.
                </Text>
                <Text
                    accessibilityLiveRegion="polite"
                    className="text-lg text-daf-text-primary dark:text-white"
                >
                    {locationMessage}
                </Text>
                <View className="flex-row flex-wrap gap-3">
                    <DafButton
                        size="lg"
                        disabled={busy}
                        onPress={() =>
                            run(async () => {
                                await Location.requestForegroundPermissionsAsync();
                                await checkLocation();
                            })
                        }
                    >
                        Allow location
                    </DafButton>
                    <DafButton
                        size="lg"
                        variant="secondary"
                        onPress={() => run(openAutomotiveAppSettings)}
                    >
                        App permissions
                    </DafButton>
                    <DafButton
                        size="lg"
                        variant="secondary"
                        onPress={() => run(openAutomotiveLocationSettings)}
                    >
                        Location settings
                    </DafButton>
                </View>
                {!draft || !saved || !savedReady ? (
                    <ActivityIndicator accessibilityLabel="Loading saved places" />
                ) : (
                    <>
                        <View className="flex-row flex-wrap gap-3">
                            {['home', 'work', 'favorite'].map((target) => (
                                <DafButton
                                    key={target}
                                    size="lg"
                                    disabled={busy}
                                    variant={
                                        draft.target === target
                                            ? 'primary'
                                            : 'secondary'
                                    }
                                    onPress={() => updateDraft({ target })}
                                >
                                    {target === 'home'
                                        ? 'Home'
                                        : target === 'work'
                                          ? 'Work'
                                          : 'Favorite'}
                                </DafButton>
                            ))}
                        </View>
                        <TextInput
                            accessibilityLabel="Place name or address"
                            placeholder="Place name or address"
                            editable={!busy}
                            value={draft.query}
                            onChangeText={(query) => updateDraft({ query })}
                            onSubmitEditing={search}
                            returnKeyType="search"
                            className="min-h-hitLarge rounded-dafMd border border-daf-border bg-daf-surface-alt px-5 py-4 text-xl text-daf-text-primary dark:border-daf-border-dark dark:bg-daf-surface-dark dark:text-white"
                        />
                        <DafButton
                            size="lg"
                            loading={busy}
                            disabled={draft.query.trim().length < 2}
                            onPress={search}
                        >
                            Search
                        </DafButton>
                        {results.map((result) => (
                            <View
                                key={result.id || result.placeId}
                                className="gap-3 border-b border-daf-border pb-4 dark:border-daf-border-dark"
                            >
                                <Text className="text-xl font-semibold text-daf-text-primary dark:text-white">
                                    {result.primaryText || result.label}
                                </Text>
                                <Text className="text-lg text-daf-text-secondary dark:text-neutral-200">
                                    {result.secondaryText}
                                </Text>
                                <DafButton
                                    size="lg"
                                    disabled={busy}
                                    variant="secondary"
                                    accessibilityLabel={`Save ${result.primaryText || result.label} as ${draft.target}`}
                                    onPress={() =>
                                        run(
                                            () =>
                                                store.save(
                                                    draft.target,
                                                    result,
                                                ),
                                            'Place saved on this car.',
                                        )
                                    }
                                >
                                    Save as{' '}
                                    {draft.target === 'home'
                                        ? 'Home'
                                        : draft.target === 'work'
                                          ? 'Work'
                                          : 'favorite'}
                                </DafButton>
                            </View>
                        ))}
                        <Text
                            accessibilityRole="header"
                            className="text-xl font-bold text-daf-text-primary dark:text-white"
                        >
                            Saved places
                        </Text>
                        {['home', 'work'].map((type) => (
                            <View key={type} className="gap-3">
                                <Text className="text-lg text-daf-text-primary dark:text-white">
                                    {type === 'home' ? 'Home' : 'Work'}:{' '}
                                    {saved.primaryLocations?.[type]?.name ||
                                        'Not set'}
                                </Text>
                                {saved.primaryLocations?.[type] ? (
                                    <DafButton
                                        size="lg"
                                        variant="secondary"
                                        disabled={busy}
                                        onPress={() =>
                                            run(
                                                () =>
                                                    savePrimaryLocation(
                                                        type,
                                                        null,
                                                    ),
                                                'Place removed.',
                                            )
                                        }
                                    >
                                        Remove{' '}
                                        {type === 'home' ? 'Home' : 'Work'}
                                    </DafButton>
                                ) : null}
                            </View>
                        ))}
                        {saved.favoriteLocations.map((place) => (
                            <View key={place.id} className="gap-3">
                                <Text className="text-lg text-daf-text-primary dark:text-white">
                                    {place.name}
                                </Text>
                                <DafButton
                                    size="lg"
                                    variant="secondary"
                                    disabled={busy}
                                    accessibilityLabel={`Remove favorite ${place.name}`}
                                    onPress={() =>
                                        run(
                                            () => toggleFavoriteLocation(place),
                                            'Favorite removed.',
                                        )
                                    }
                                >
                                    Remove favorite
                                </DafButton>
                            </View>
                        ))}
                    </>
                )}
                {message ? (
                    <Text
                        accessibilityLiveRegion="polite"
                        className="text-lg text-daf-text-primary dark:text-white"
                    >
                        {message}
                    </Text>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

export function AutomotiveSetupScreen() {
    return (
        <SafeAreaProvider>
            <SetupContents />
        </SafeAreaProvider>
    );
}
