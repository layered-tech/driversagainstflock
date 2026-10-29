import { Platform, useWindowDimensions, View } from 'react-native';
import {
    createContext,
    useContext,
    useLayoutEffect,
    useMemo,
    useState,
} from 'react';
import {
    SafeAreaInsetsOverrideProvider,
    useSafeAreaInsets,
} from '../../lib/safe-area-insets';
import { AreaMap } from '../areas/area-map';
import {
    getDuoContentPaneHeight,
    getDuoPaneLayout,
} from '../map/duo-bottom-sheet-layout';
import {
    useSharedMapLocationState,
    useSharedMapState,
} from '../map/shared-map-state';
import {
    DuoPaneContentContext,
    DuoPaneSizeContext,
    useDuoDevice,
} from './duo-device-context';
import { HorizontalSafeAreaContent } from './native-navigation';
import { getTabletPaneLayout } from '../map/responsive-map-layout';

const DuoPaneMapContext = createContext(null);

export function DuoPaneMap({ children }) {
    const setMap = useContext(DuoPaneMapContext);
    useLayoutEffect(() => {
        if (!setMap) return;
        setMap(children);
        return () =>
            setMap((current) => (current === children ? null : current));
    }, [children, setMap]);
    return null;
}

function DuoSceneMap() {
    const { userLocation } = useSharedMapLocationState();
    const { markerPoints, initialCameraSettings } = useSharedMapState();
    const cameras = useMemo(
        () =>
            markerPoints
                .filter(
                    (point) =>
                        point.geometry?.type === 'Point' &&
                        point.geometry.coordinates.every(Number.isFinite),
                )
                .map((point) => ({
                    id:
                        point.id ??
                        point.properties?.id ??
                        point.properties?.osm_id,
                    longitude: point.geometry.coordinates[0],
                    latitude: point.geometry.coordinates[1],
                })),
        [markerPoints],
    );
    const center = userLocation
        ? [userLocation.longitude, userLocation.latitude]
        : initialCameraSettings?.centerCoordinate;
    return <AreaMap center={center} changes={cameras} zoomLevel={12} />;
}

export function DuoPaneScreen({ children }) {
    const [map, setMap] = useState(null);
    const [contentSize, setContentSize] = useState({
        header: null,
        content: null,
        footer: null,
    });
    const duo = useDuoDevice();
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const tablet = Platform?.isPad === true;
    const pane = tablet
        ? getTabletPaneLayout(width, insets)
        : duo && getDuoPaneLayout(width, insets);
    const contentHeight = getDuoContentPaneHeight(
        contentSize,
        height - insets.top - 14 - Math.max(insets.bottom, 14),
    );
    if (!duo && !tablet)
        return (
            <HorizontalSafeAreaContent>{children}</HorizontalSafeAreaContent>
        );
    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID={
                tablet && pane
                    ? 'tablet-split-screen'
                    : pane
                      ? 'duo-split-screen'
                      : 'duo-page-screen'
            }
        >
            <View className="absolute inset-0">
                {pane ? (map ?? <DuoSceneMap />) : null}
            </View>
            <View
                className={
                    pane
                        ? 'absolute overflow-hidden rounded-dafXl border border-daf-border-glass bg-daf-surface-page shadow-areaSheet dark:border-daf-border-glass-dark dark:bg-[#0B0E12]'
                        : 'flex-1 shadow-none'
                }
                style={
                    pane
                        ? {
                              left: pane.left,
                              width: pane.width,
                              top: insets.top + 14,
                              ...(contentHeight === null
                                  ? { bottom: Math.max(insets.bottom, 14) }
                                  : { height: contentHeight }),
                          }
                        : undefined
                }
                testID={
                    tablet && pane
                        ? 'tablet-content-pane'
                        : pane
                          ? 'duo-content-pane'
                          : 'duo-page-content'
                }
            >
                <SafeAreaInsetsOverrideProvider
                    insets={
                        pane ? { top: 0, bottom: 0, left: 0, right: 0 } : insets
                    }
                >
                    <HorizontalSafeAreaContent>
                        <DuoPaneContentContext.Provider value={Boolean(pane)}>
                            <DuoPaneMapContext.Provider
                                value={pane ? setMap : null}
                            >
                                <DuoPaneSizeContext.Provider
                                    value={pane ? setContentSize : null}
                                >
                                    {children}
                                </DuoPaneSizeContext.Provider>
                            </DuoPaneMapContext.Provider>
                        </DuoPaneContentContext.Provider>
                    </HorizontalSafeAreaContent>
                </SafeAreaInsetsOverrideProvider>
            </View>
        </View>
    );
}

export function DuoMapModalScreen({ children }) {
    const duo = useDuoDevice();
    if (!duo && Platform?.isPad !== true)
        return (
            <HorizontalSafeAreaContent>{children}</HorizontalSafeAreaContent>
        );
    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID="duo-map-modal-screen"
        >
            <View className="absolute inset-0">
                <DuoSceneMap />
            </View>
            {children}
        </View>
    );
}

export function duoPaneScreenLayout({ children }) {
    return <DuoPaneScreen>{children}</DuoPaneScreen>;
}
