import { NativeNavigationAction } from '../root/native-navigation';
import { useDuoDevice } from '../root/duo-device-context';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { getDuoPaneLayout } from '../map/duo-bottom-sheet-layout';
import { getTabletPaneLayout } from '../map/responsive-map-layout';
import { Icon } from '../design-system/icon';
import { DafIconButton, DafTextInput } from '../design-system/primitives';
import {
    AREA_KINDS,
    circleGeometry,
    drawnGeometry,
    geometrySquareMiles,
} from './area-geometry';
import { AreaMap } from './area-map';
import { AreaRadiusControl } from './area-radius-control';
import { areaRequest } from './areas-api';
import {
    AreaBadge as DafBadge,
    AreaButton as DafButton,
    AreaError,
    AreaSegmentedControl as DafSegmentedControl,
    AreaSheet,
    AreaText as Text,
} from './area-ui';
import { useAreas } from './areas-context';

const MODES = [
    { value: 'search', label: 'Search' },
    { value: 'around', label: 'Around me' },
    { value: 'draw', label: 'Draw' },
];
export default function AddAreaScreen() {
    const duoDevice = useDuoDevice();
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
    const [sheetHeight, setSheetHeight] = useState(0);
    const [count, setCount] = useState(null);
    const [cameras, setCameras] = useState([]);
    const [previewError, setPreviewError] = useState(null);
    const { saveArea } = useAreas();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const tabletPane = Platform?.isPad
        ? getTabletPaneLayout(width, insets)
        : null;
    const paneHeaderControls = Boolean(
        tabletPane || (Platform.OS === 'android' && duoDevice && width >= 768),
    );
    const pane =
        tabletPane ?? (duoDevice ? getDuoPaneLayout(width, insets) : null);
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
            pointerEvents="box-none"
            className="flex-1"
            behavior="padding"
            testID="add-area-screen"
        >
            <View
                pointerEvents="box-none"
                className={
                    duoDevice || tabletPane
                        ? 'absolute inset-0'
                        : '-mb-[22px] min-h-[150px] flex-1'
                }
            >
                <AreaMap
                    sheetHeight={sheetHeight}
                    bottomOverlap={22}
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
                    style={{
                        top: insets.top + 10,
                        left: pane
                            ? pane.left + pane.width + 12
                            : insets.left + 16,
                        right: insets.right + 12,
                    }}
                >
                    {mode === 'draw' ? (
                        <View className="min-w-0 flex-1 rounded-dafPill border border-daf-border bg-white/95 px-4 py-3 dark:border-daf-border-dark dark:bg-daf-surface-dark">
                            <Text className="text-[13px] font-semibold text-daf-text-primary dark:text-daf-text-inverse">
                                Tap to add corners · drag to move
                            </Text>
                        </View>
                    ) : null}
                    {!paneHeaderControls ? (
                        <NativeNavigationAction
                            railOnly
                            kind="close"
                            priority={100}
                        >
                            <DafIconButton
                                icon="x"
                                accessibilityLabel="Close"
                                onPress={() => router.back()}
                            />
                        </NativeNavigationAction>
                    ) : null}
                </View>
                {mode === 'draw' ? (
                    <View
                        className="absolute right-3 gap-3"
                        style={{ top: insets.top + 68 }}
                    >
                        <NativeNavigationAction
                            railOnly
                            kind="tool"
                            symbol="arrow.uturn.backward"
                            priority={100}
                            order={1}
                        >
                            <DafIconButton
                                icon="rotate-ccw"
                                accessibilityLabel="Undo last corner"
                                disabled={!points.length}
                                onPress={() =>
                                    setPoints((current) => current.slice(0, -1))
                                }
                            />
                        </NativeNavigationAction>
                        <NativeNavigationAction
                            railOnly
                            kind="tool"
                            symbol="trash"
                            priority={100}
                            order={2}
                        >
                            <DafIconButton
                                icon="trash"
                                accessibilityLabel="Clear shape"
                                disabled={!points.length}
                                onPress={() => setPoints([])}
                            />
                        </NativeNavigationAction>
                        <NativeNavigationAction
                            railOnly
                            kind="tool"
                            symbol="scope"
                            priority={100}
                            order={3}
                        >
                            <DafIconButton
                                icon="locate-fixed"
                                accessibilityLabel="Center map on my location"
                                onPress={locate}
                            />
                        </NativeNavigationAction>
                    </View>
                ) : null}
            </View>
            <AreaSheet
                onLayout={(event) =>
                    setSheetHeight(event.nativeEvent.layout.height)
                }
                title="Add an area"
                subtitle="Watch a place for camera changes"
                testID="add-area-sheet"
                trailing={
                    paneHeaderControls ? (
                        <DafIconButton
                            icon="x"
                            accessibilityLabel="Close"
                            onPress={() => router.back()}
                        />
                    ) : undefined
                }
            >
                <DafSegmentedControl
                    options={MODES}
                    value={mode}
                    onChange={(value) => {
                        setMode(value);
                        setError(null);
                    }}
                    testIDPrefix="area-mode"
                />
                <View
                    className={
                        mode === 'search' ? 'mt-[14px]' : 'mt-[14px] gap-[12px]'
                    }
                >
                    <AreaError message={error} />
                    {mode === 'search' ? (
                        <>
                            <View className="flex-row items-center gap-2">
                                <View className="flex-1">
                                    <DafTextInput
                                        className="font-areaRegular"
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
                            <View className="mt-[6px]">
                                {results.map((result, index) => (
                                    <Pressable
                                        key={`${result.name}-${index}`}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Watch ${result.name}`}
                                        disabled={saving}
                                        className="min-h-[56px] flex-row items-center gap-[12px] border-b border-daf-border px-[4px] py-[12px] dark:border-daf-border-dark"
                                        onPress={() => watch(result)}
                                    >
                                        <View className="w-[44px] items-center rounded-full border border-daf-border py-[3px] dark:border-daf-border-dark">
                                            <Text className="text-center font-dafMono text-[9px] font-bold uppercase tracking-[0.72px] text-daf-text-secondary dark:text-[#A9B2BD]">
                                                {AREA_KINDS[result.kind]}
                                            </Text>
                                        </View>
                                        <View className="min-w-0 flex-1">
                                            <Text className="text-[15px] font-semibold text-daf-text-primary dark:text-daf-text-inverse">
                                                {result.name}
                                            </Text>
                                            <Text
                                                className="mt-[2px] text-xs text-daf-text-tertiary dark:text-daf-text-tertiary"
                                                numberOfLines={1}
                                            >
                                                {result.definition} ·{' '}
                                                {result.camera_count} cameras
                                                mapped
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
                            </View>
                            {searched && !results.length ? (
                                <Text className="text-[13px] text-daf-text-secondary dark:text-[#A9B2BD]">
                                    No city, county or ZIP boundary found. Try
                                    another search or draw your area.
                                </Text>
                            ) : null}
                            {saving ? (
                                <ActivityIndicator color="#1FBF6B" />
                            ) : null}
                            <Text className="mt-[12px] text-xs leading-[17px] text-daf-text-tertiary dark:text-daf-text-tertiary">
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
                                        <Text className="text-[15px] font-semibold text-daf-text-primary dark:text-daf-text-inverse">
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
                                    <Text className="text-[15px] font-semibold text-daf-text-primary dark:text-daf-text-inverse">
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
                            <Text className="text-xs text-daf-text-tertiary dark:text-daf-text-tertiary">
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
                                className="font-areaRegular"
                                placeholder="Name this area"
                                accessibilityLabel="Name this area"
                                value={name}
                                onChangeText={setName}
                                maxLength={120}
                                testID="area-name-input"
                            />
                            {mode === 'around' ? (
                                <Text className="text-xs leading-[18px] text-daf-text-tertiary dark:text-daf-text-tertiary">
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
                </View>
            </AreaSheet>
        </KeyboardAvoidingView>
    );
}
