import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import {
    DafBadge,
    DafButton,
    DafIconButton,
    DafSegmentedControl,
    DafTextInput,
} from '../design-system/primitives';
import {
    AREA_KINDS,
    circleGeometry,
    drawnGeometry,
    geometrySquareMiles,
} from './area-geometry';
import { AreaMap } from './area-map';
import { AreaRadiusControl } from './area-radius-control';
import { AreaError } from './area-ui';
import { areaRequest } from './areas-api';
import { useAreas } from './areas-context';

const MODES = [
    { value: 'search', label: 'Search' },
    { value: 'around', label: 'Around me' },
    { value: 'draw', label: 'Draw' },
];
export default function AddAreaScreen() {
    const params = useLocalSearchParams();
    const [mode, setMode] = useState(
        MODES.some((item) => item.value === params.mode)
            ? params.mode
            : 'search',
    );
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searched, setSearched] = useState(false);
    const [searching, setSearching] = useState(false);
    const [center, setCenter] = useState(null);
    const [locating, setLocating] = useState(false);
    const [radius, setRadius] = useState(5);
    const [points, setPoints] = useState([]);
    const [name, setName] = useState('');
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [count, setCount] = useState(null);
    const [cameras, setCameras] = useState([]);
    const [previewError, setPreviewError] = useState(null);
    const { saveArea } = useAreas();
    const insets = useSafeAreaInsets();
    const geometry = useMemo(
        () =>
            mode === 'around'
                ? circleGeometry(center, radius)
                : mode === 'draw'
                  ? drawnGeometry(points)
                  : null,
        [mode, center, radius, points],
    );
    const input = useMemo(
        () => ({
            name: name.trim() || (mode === 'around' ? 'Around me' : 'My area'),
            kind: mode === 'around' ? 'radius' : 'drawn',
            definition:
                mode === 'around'
                    ? `${radius} mi radius`
                    : `${geometrySquareMiles(geometry).toFixed(1)} sq mi`,
            geometry,
        }),
        [name, mode, radius, geometry],
    );
    async function locate() {
        setLocating(true);
        setError(null);
        try {
            const permission =
                await Location.requestForegroundPermissionsAsync();
            if (!permission.granted)
                throw new Error(
                    'Allow location access to choose a circle around you, or use Search or Draw.',
                );
            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            setCenter([location.coords.longitude, location.coords.latitude]);
        } catch (failure) {
            setError(failure.message);
        } finally {
            setLocating(false);
        }
    }
    useEffect(() => {
        if (mode === 'around' && !center) locate();
    }, [mode]);
    useEffect(() => {
        setCount(null);
        setCameras([]);
        setPreviewError(null);
        if (!geometry) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            areaRequest('/preview', {
                method: 'POST',
                body: input,
                signal: controller.signal,
            })
                .then((payload) => {
                    if (!controller.signal.aborted) {
                        setCount(payload.camera_count);
                        setCameras(payload.cameras ?? []);
                    }
                })
                .catch((failure) => {
                    if (!controller.signal.aborted)
                        setPreviewError(failure.message);
                });
        }, 450);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [geometry]);
    async function search() {
        if (query.trim().length < 2 || searching) return;
        setSearching(true);
        setError(null);
        setSearched(false);
        setResults([]);
        try {
            const payload = await areaRequest(
                `/search?query=${encodeURIComponent(query.trim())}`,
            );
            setResults(payload.results);
            setSearched(true);
        } catch (failure) {
            setError(failure.message);
        } finally {
            setSearching(false);
        }
    }
    async function watch(values) {
        if (saving) return;
        setSaving(true);
        setError(null);
        try {
            const area = await saveArea(values);
            router.replace(`/areas/${area.id}`);
        } catch (failure) {
            setError(failure.message);
        } finally {
            setSaving(false);
        }
    }
    return (
        <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            testID="add-area-screen"
        >
            <View className="min-h-[150px] flex-1">
                <AreaMap
                    geometry={geometry}
                    changes={cameras}
                    center={center}
                    points={mode === 'draw' ? points : []}
                    fitGeometry={mode !== 'draw'}
                    onAddPoint={
                        mode === 'draw'
                            ? (point) => {
                                  setPoints((current) =>
                                      current.length < 100
                                          ? [...current, point]
                                          : current,
                                  );
                              }
                            : undefined
                    }
                    onMovePoint={(index, point) =>
                        setPoints((current) =>
                            current.map((value, i) =>
                                index === i ? point : value,
                            ),
                        )
                    }
                />
                <View
                    className="absolute left-4 right-3 flex-row items-center justify-end gap-3"
                    style={{ top: insets.top + 10 }}
                >
                    {mode === 'draw' ? (
                        <View className="min-w-0 flex-1 rounded-dafPill border border-daf-border bg-white/95 px-4 py-3 dark:border-daf-border-dark dark:bg-daf-surface-dark">
                            <Text className="text-[13px] font-semibold text-daf-text-primary dark:text-white">
                                Tap to add corners · drag to move
                            </Text>
                        </View>
                    ) : null}
                    <DafIconButton
                        icon="x"
                        accessibilityLabel="Close"
                        onPress={() => router.back()}
                    />
                </View>
                {mode === 'draw' ? (
                    <View
                        className="absolute right-3 gap-3"
                        style={{ top: insets.top + 68 }}
                    >
                        <DafIconButton
                            icon="rotate-ccw"
                            accessibilityLabel="Undo last corner"
                            disabled={!points.length}
                            onPress={() =>
                                setPoints((current) => current.slice(0, -1))
                            }
                        />
                        <DafIconButton
                            icon="trash"
                            accessibilityLabel="Clear shape"
                            disabled={!points.length}
                            onPress={() => setPoints([])}
                        />
                        <DafIconButton
                            icon="locate-fixed"
                            accessibilityLabel="Center map on my location"
                            onPress={locate}
                        />
                    </View>
                ) : null}
            </View>
            <View
                className="max-h-[65%] rounded-t-[24px] border-t border-daf-border bg-white px-4 pt-3 dark:border-daf-border-dark dark:bg-daf-surface-dark"
                style={{ paddingBottom: insets.bottom + 16 }}
            >
                <View className="mb-3 h-1 w-10 self-center rounded-full bg-daf-border dark:bg-daf-border-dark" />
                <Text className="font-dafDisplay text-[22px] font-bold text-daf-text-primary dark:text-white">
                    Add an area
                </Text>
                <Text className="mb-4 mt-1 text-[13px] text-daf-text-tertiary dark:text-neutral-400">
                    Watch a place for camera changes
                </Text>
                <DafSegmentedControl
                    options={MODES}
                    value={mode}
                    onChange={(value) => {
                        setMode(value);
                        setError(null);
                    }}
                    testIDPrefix="area-mode"
                />
                <ScrollView
                    keyboardShouldPersistTaps="handled"
                    className="mt-4"
                    contentContainerStyle={{ gap: 12 }}
                >
                    <AreaError message={error} />
                    {mode === 'search' ? (
                        <>
                            <View className="flex-row items-center gap-2">
                                <View className="flex-1">
                                    <DafTextInput
                                        placeholder="City, county or ZIP"
                                        accessibilityLabel="City, county or ZIP"
                                        value={query}
                                        onChangeText={setQuery}
                                        onSubmitEditing={search}
                                        returnKeyType="search"
                                        testID="area-search-input"
                                    />
                                </View>
                                <DafIconButton
                                    icon="search"
                                    accessibilityLabel="Search areas"
                                    disabled={
                                        searching || query.trim().length < 2
                                    }
                                    onPress={search}
                                />
                            </View>
                            {searching ? (
                                <ActivityIndicator color="#1FBF6B" />
                            ) : null}
                            {results.map((result, index) => (
                                <Pressable
                                    key={`${result.name}-${index}`}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Watch ${result.name}`}
                                    disabled={saving}
                                    className="flex-row items-center gap-3 border-b border-daf-border py-3.5 dark:border-daf-border-dark"
                                    onPress={() => watch(result)}
                                >
                                    <DafBadge>
                                        {AREA_KINDS[result.kind]}
                                    </DafBadge>
                                    <View className="min-w-0 flex-1">
                                        <Text className="text-[15px] font-semibold text-daf-text-primary dark:text-white">
                                            {result.name}
                                        </Text>
                                        <Text
                                            className="mt-1 text-xs text-daf-text-tertiary dark:text-neutral-400"
                                            numberOfLines={2}
                                        >
                                            {result.definition} ·{' '}
                                            {result.camera_count} cameras mapped
                                        </Text>
                                    </View>
                                    <View className="h-8 w-8 items-center justify-center rounded-full bg-daf-brand/10">
                                        <Icon
                                            name="plus"
                                            color="#0F7D45"
                                            size={17}
                                        />
                                    </View>
                                </Pressable>
                            ))}
                            {searched && !results.length ? (
                                <Text className="text-[13px] text-daf-text-secondary dark:text-neutral-300">
                                    No city, county or ZIP boundary found. Try
                                    another search or draw your area.
                                </Text>
                            ) : null}
                            {saving ? (
                                <ActivityIndicator color="#1FBF6B" />
                            ) : null}
                            <Text className="text-xs leading-[18px] text-daf-text-tertiary dark:text-neutral-400">
                                Counts are cameras currently mapped in
                                OpenStreetMap. Tap a result to start watching
                                it.
                            </Text>
                        </>
                    ) : (
                        <>
                            {mode === 'around' ? (
                                <>
                                    <View className="flex-row items-center justify-between">
                                        <Text className="text-[15px] font-semibold text-daf-text-primary dark:text-white">
                                            Radius
                                        </Text>
                                        <Text className="font-dafMono text-[18px] font-semibold text-daf-text-brand dark:text-daf-brand">
                                            {radius} mi
                                        </Text>
                                    </View>
                                    <AreaRadiusControl
                                        value={radius}
                                        onChange={setRadius}
                                    />
                                    {locating ? (
                                        <ActivityIndicator color="#1FBF6B" />
                                    ) : !center ? (
                                        <DafButton
                                            variant="secondary"
                                            onPress={locate}
                                        >
                                            Use my location
                                        </DafButton>
                                    ) : null}
                                </>
                            ) : (
                                <View className="flex-row items-center justify-between">
                                    <Text className="text-[15px] font-semibold text-daf-text-primary dark:text-white">
                                        {points.length} corners ·{' '}
                                        {geometrySquareMiles(geometry).toFixed(
                                            1,
                                        )}{' '}
                                        sq mi
                                    </Text>
                                    {geometry ? (
                                        <DafBadge tone="brand">
                                            Closed shape
                                        </DafBadge>
                                    ) : null}
                                </View>
                            )}
                            <Text className="text-xs text-daf-text-tertiary dark:text-neutral-400">
                                {count === null
                                    ? geometry
                                        ? 'Checking cameras…'
                                        : mode === 'draw'
                                          ? 'Add at least 3 corners to close your shape.'
                                          : 'Choose your location to preview this circle.'
                                    : `${count} cameras mapped inside`}
                            </Text>
                            <AreaError message={previewError} />
                            <DafTextInput
                                placeholder="Name this area"
                                accessibilityLabel="Name this area"
                                value={name}
                                onChangeText={setName}
                                maxLength={120}
                                testID="area-name-input"
                            />
                            {mode === 'around' ? (
                                <Text className="text-xs leading-[18px] text-daf-text-tertiary dark:text-neutral-400">
                                    We save the circle’s center, not your live
                                    location. It won’t follow you.
                                </Text>
                            ) : null}
                            <DafButton
                                size="lg"
                                loading={saving}
                                disabled={
                                    !geometry ||
                                    !name.trim() ||
                                    Boolean(previewError)
                                }
                                onPress={() => watch(input)}
                                testID="watch-area-button"
                            >
                                Watch this area
                            </DafButton>
                        </>
                    )}
                </ScrollView>
            </View>
        </KeyboardAvoidingView>
    );
}
