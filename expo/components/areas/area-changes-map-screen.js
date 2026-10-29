import { NativeNavigationAction } from '../root/native-navigation';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { getTabletPaneLayout } from '../map/responsive-map-layout';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { DafIconButton } from '../design-system/primitives';
import { AreaMap } from './area-map';
import {
    AREA_WINDOWS,
    AreaError,
    AreaLoading,
    AreaSegmentedControl,
    AreaSheet,
    AreaText as Text,
} from './area-ui';
import { areaRequest } from './areas-api';
import { mergeAreaChanges } from './area-geometry';
import { useAreas } from './areas-context';

export default function AreaChangesMapScreen() {
    const {
        areaId,
        window: initialWindow = '7',
        changeId,
        view,
    } = useLocalSearchParams();
    const showAllCameras = view === 'all' && !changeId;
    const [window, setWindow] = useState(initialWindow);
    const { areas, cachedAreas, rememberAreaBoundary } = useAreas();
    const savedArea =
        areas.find((item) => String(item.id) === String(areaId)) ??
        cachedAreas.find((item) => String(item.id) === String(areaId));
    const [changes, setChanges] = useState([]);
    const [loadedArea, setArea] = useState(null);
    const area =
        String(loadedArea?.id) === String(areaId)
            ? { ...savedArea, ...loadedArea }
            : savedArea;
    const selectedChange = changes.find(
        (change) => String(change.id) === String(changeId),
    );
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [sheetHeight, setSheetHeight] = useState(0);
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const tabletPane = Platform?.isPad
        ? getTabletPaneLayout(width, insets)
        : null;
    const counts = changes.reduce(
        (totals, change) => ({
            ...totals,
            [change.kind]: (totals[change.kind] ?? 0) + 1,
        }),
        { added: 0, removed: 0 },
    );
    const period = window === '24h' ? 'last 24 hours' : `last ${window} days`;
    const boundary =
        {
            city: 'City limits',
            county: 'County limits',
            zip: 'ZIP boundary',
            radius: 'Radius',
            drawn: 'Drawn boundary',
        }[area?.kind] ?? 'Area boundary';
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        setChanges([]);
        (async () => {
            if (changeId) {
                const payload = await areaRequest(
                    `/${areaId}/changes/${changeId}`,
                    { signal: controller.signal },
                );
                if (controller.signal.aborted) return;
                setArea(payload.area);
                rememberAreaBoundary(payload.area);
                setChanges([payload.change]);
                return;
            }
            let page = 1;
            let lastPage = 1;
            do {
                const payload = await areaRequest(
                    showAllCameras
                        ? `/${areaId}/cameras?page=${page}`
                        : `/${areaId}/changes?window=${window}&page=${page}`,
                    { signal: controller.signal },
                );
                if (controller.signal.aborted) return;
                setArea(payload.area);
                rememberAreaBoundary(payload.area);
                const records = showAllCameras
                    ? payload.cameras
                    : payload.changes;
                setChanges((current) =>
                    mergeAreaChanges(current, records.data),
                );
                lastPage = records.last_page;
                page++;
            } while (page <= lastPage);
        })()
            .catch((failure) => {
                if (!controller.signal.aborted) setError(failure.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [
        areaId,
        window,
        changeId,
        showAllCameras,
        attempt,
        rememberAreaBoundary,
    ]);
    return (
        <View className="flex-1" testID="area-changes-map-screen">
            <View className="-mb-[22px] min-h-[150px] flex-1">
                {(changeId ? selectedChange : area?.geometry) ? (
                    <AreaMap
                        sheetHeight={sheetHeight}
                        key={areaId}
                        zoomLevel={changeId ? 16 : 12}
                        fitGeometry={!changeId}
                        geometry={area?.geometry}
                        center={
                            selectedChange
                                ? [
                                      selectedChange.longitude,
                                      selectedChange.latitude,
                                  ]
                                : undefined
                        }
                        changes={changes}
                        overview={!changeId}
                        bottomOverlap={22}
                        onChangePress={
                            showAllCameras
                                ? undefined
                                : (id) =>
                                      router.push(
                                          `/areas/${areaId}/change?changeId=${id}`,
                                      )
                        }
                    />
                ) : (
                    <View className="flex-1 items-center justify-center">
                        <AreaLoading />
                    </View>
                )}
                {!tabletPane ? (
                    <View
                        className="absolute left-3"
                        style={{ top: insets.top + 8 }}
                    >
                        <NativeNavigationAction
                            railOnly
                            kind="back"
                            priority={10}
                        >
                            <DafIconButton
                                icon="chevron-left"
                                accessibilityLabel="Back"
                                className="shadow-areaControl"
                                onPress={() => router.back()}
                            />
                        </NativeNavigationAction>
                    </View>
                ) : null}
            </View>
            <AreaSheet
                onLayout={(event) =>
                    setSheetHeight(event.nativeEvent.layout.height)
                }
                title={
                    changeId
                        ? `Camera ${selectedChange?.kind ?? 'change'}`
                        : loading
                          ? showAllCameras
                              ? 'Loading area cameras…'
                              : 'Loading area changes…'
                          : error
                            ? 'Area map unavailable'
                            : `${changes.length} ${showAllCameras ? (changes.length === 1 ? 'camera' : 'cameras') : changes.length === 1 ? 'change' : 'changes'} on the map`
                }
                subtitle={`${area?.name ?? 'Area'} · ${showAllCameras ? boundary : period}`}
                testID="area-map-sheet"
                leading={
                    tabletPane ? (
                        <DafIconButton
                            icon="chevron-left"
                            accessibilityLabel="Back"
                            onPress={() => router.back()}
                        />
                    ) : undefined
                }
            >
                {showAllCameras ? (
                    <Text className="text-xs leading-[17px] text-daf-text-tertiary">
                        All currently mapped cameras inside this area.
                    </Text>
                ) : !changeId ? (
                    <>
                        <View className="mb-[14px] flex-row flex-wrap items-center gap-[8px]">
                            {[
                                [
                                    'added',
                                    'bg-daf-alert/[0.12]',
                                    'text-[#E5383B]',
                                    'bg-daf-alert',
                                ],
                                [
                                    'removed',
                                    'bg-daf-brand/10 dark:bg-daf-brand/[0.16]',
                                    'text-daf-text-brand dark:text-daf-brand-hover',
                                    'bg-daf-brand',
                                ],
                            ].map(([kind, background, foreground, dot]) => (
                                <View
                                    key={kind}
                                    className={`flex-row items-center gap-[7px] rounded-full px-[11px] py-[5px] ${background}`}
                                >
                                    <View
                                        className={`h-[8px] w-[8px] rounded-full ${dot}`}
                                    />
                                    <Text
                                        className={`text-xs font-semibold ${foreground}`}
                                    >
                                        <Text className="font-dafMono font-bold">
                                            {counts[kind]}
                                        </Text>{' '}
                                        {kind}
                                    </Text>
                                </View>
                            ))}
                            <View className="ml-auto flex-row items-center gap-[6px]">
                                <View className="h-[10px] w-[14px] rounded-[3px] border-2 border-daf-brand bg-daf-brand/10" />
                                <Text className="text-xs text-daf-text-tertiary">
                                    {boundary}
                                </Text>
                            </View>
                        </View>
                        <AreaSegmentedControl
                            options={AREA_WINDOWS}
                            value={window}
                            onChange={setWindow}
                            testIDPrefix="area-map-window"
                        />
                        <Text className="mt-[12px] text-xs leading-[17px] text-daf-text-tertiary">
                            Tap a camera for details. Faded ones were taken
                            down.
                        </Text>
                    </>
                ) : null}
                {loading && (changeId ? selectedChange : area?.geometry) ? (
                    <AreaLoading />
                ) : null}
                <AreaError
                    message={error}
                    onRetry={() => setAttempt((value) => value + 1)}
                />
            </AreaSheet>
        </View>
    );
}
