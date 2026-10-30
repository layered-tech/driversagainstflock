import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
    NavigationContext,
    NavigationRouteContext,
} from 'expo-router/build/react-navigation/core';
import { NavigationBuilderContext } from 'expo-router/build/react-navigation/core/NavigationBuilderContext';
import { NavigationStateContext } from 'expo-router/build/react-navigation/core/NavigationStateContext';
import { NavigationFocusedRouteStateContext } from 'expo-router/build/react-navigation/core/NavigationFocusedRouteStateContext';
import {
    FocusedRouteKeyContext,
    IsFocusedContext,
} from 'expo-router/build/react-navigation/core/useIsFocused';
import { NamedRouteContextListContext } from 'expo-router/build/react-navigation/core/NavigationProvider';
import { APP_ENVIRONMENT } from './config';
import Mapbox from '@rnmapbox/maps';
import { useIsFocused } from 'expo-router';
import { cssInterop } from 'nativewind';
import {
    Children,
    createContext,
    forwardRef,
    Fragment,
    useContext,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { useDuoDevice } from '../root/duo-device-context';
import {
    createPersistentMapState,
    createPersistentSceneState,
} from './persistent-map-state';

const PersistentMapContext = createContext(null);
const PersistentSceneContext = createContext(null);
export const PersistentDrawerStateContext = createContext(() => {});
const navigationContexts = [
    NavigationContext,
    NavigationRouteContext,
    NavigationBuilderContext,
    NavigationStateContext,
    NavigationFocusedRouteStateContext,
    NamedRouteContextListContext,
    IsFocusedContext,
    FocusedRouteKeyContext,
];
const StyledMapView = cssInterop(Mapbox.MapView, { className: 'style' });

export function usePersistentMapEnabled() {
    const duo = useDuoDevice();
    const { width } = useWindowDimensions();
    return Platform.OS === 'android' && duo && width >= 768;
}

export function PersistentMapHost({ children }) {
    const enabled = usePersistentMapEnabled();
    const store = useMemo(createPersistentMapState, []);
    const content = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getSnapshot,
    );
    const sceneStore = useMemo(createPersistentSceneState, []);
    const scenes = useSyncExternalStore(
        sceneStore.subscribe,
        sceneStore.getSnapshot,
        sceneStore.getSnapshot,
    );
    const [drawerState, setDrawerState] = useState({
        open: false,
        navigation: null,
    });
    const drawerOpen = drawerState.open;
    const edgeGesture = useMemo(
        () =>
            Gesture.Pan()
                .enabled(
                    enabled &&
                        !drawerOpen &&
                        drawerState.swipeEnabled !== false,
                )
                .hitSlop({ left: 0, width: 48 })
                .activeOffsetX([-12, 12])
                .failOffsetY([-20, 20])
                .runOnJS(true)
                .onBegin(() => {
                    if (APP_ENVIRONMENT === 'e2e')
                        console.info('[E2E] persistent-map-edge-began');
                })
                .onUpdate((event) => {
                    if (event.translationX > 40)
                        drawerState.navigation?.openDrawer();
                }),
        [enabled, drawerOpen, drawerState.navigation, drawerState.swipeEnabled],
    );
    const mapRef = useRef(null);
    const activeRef = useRef(null);
    const lastOwner = useRef(null);
    useLayoutEffect(() => {
        if (
            content?.owner &&
            lastOwner.current !== content.owner &&
            APP_ENVIRONMENT === 'e2e'
        ) {
            console.info(
                '[E2E] persistent-map-owner:' + (content.props.testID ?? 'map'),
            );
            lastOwner.current = content.owner;
        }
    }, [content]);
    // Keep the ref callback stable: changing route owners must not recreate the
    // native map or leave the previous route holding its imperative ref.
    useLayoutEffect(() => {
        const next = content?.mapRef;
        if (activeRef.current !== next) {
            assignRef(activeRef.current, null);
            activeRef.current = next;
            assignRef(next, mapRef.current);
        }
    }, [content]);
    const attach = useMemo(
        () => (value) => {
            mapRef.current = value;
            if (value && APP_ENVIRONMENT === 'e2e')
                console.info('[E2E] persistent-map-attached');
            assignRef(activeRef.current, value);
        },
        [],
    );
    return (
        <PersistentMapContext.Provider value={enabled ? store : null}>
            <PersistentDrawerStateContext.Provider value={setDrawerState}>
                <PersistentSceneContext.Provider
                    value={enabled ? sceneStore : null}
                >
                    <GestureDetector gesture={edgeGesture}>
                        <View className="flex-1">
                            {enabled && content ? (
                                <View
                                    className="absolute inset-0"
                                    testID="persistent-map-host"
                                >
                                    <StyledMapView
                                        {...content.props}
                                        ref={attach}
                                        className="flex-1"
                                        style={undefined}
                                        surfaceView={false}
                                    >
                                        <Fragment key={content.layerKey}>
                                            {content.children}
                                        </Fragment>
                                    </StyledMapView>
                                </View>
                            ) : null}
                            {enabled
                                ? scenes.map((scene) => (
                                      <View
                                          key={scene.id}
                                          className="absolute inset-0"
                                          pointerEvents="box-none"
                                          style={{
                                              display: scene.focused
                                                  ? 'flex'
                                                  : 'none',
                                          }}
                                      >
                                          {scene.children}
                                      </View>
                                  ))
                                : null}
                            <View
                                className="flex-1"
                                style={
                                    enabled
                                        ? {
                                              zIndex: 100,
                                              elevation: drawerOpen ? 24 : 0,
                                          }
                                        : undefined
                                }
                                pointerEvents={
                                    enabled && !drawerOpen ? 'none' : 'box-none'
                                }
                            >
                                {children}
                            </View>
                        </View>
                    </GestureDetector>
                </PersistentSceneContext.Provider>
            </PersistentDrawerStateContext.Provider>
        </PersistentMapContext.Provider>
    );
}

function assignRef(ref, value) {
    if (typeof ref === 'function') ref(value);
    else if (ref) ref.current = value;
}

export const PersistentMapView = forwardRef(function PersistentMapView(
    {
        persistent = false,
        persistentBase = false,
        persistentPreserveCamera = false,
        children,
        ...props
    },
    mapRef,
) {
    const store = useContext(PersistentMapContext);
    return store && persistent ? (
        <HostedMap
            store={store}
            mapRef={mapRef}
            props={props}
            base={persistentBase}
            preserveCamera={persistentPreserveCamera}
        >
            {children}
        </HostedMap>
    ) : (
        <StyledMapView {...props} ref={mapRef}>
            {children}
        </StyledMapView>
    );
});

function HostedMap({ store, mapRef, props, children, base, preserveCamera }) {
    const focused = useIsFocused();
    const layerKey = useId();
    const owner = useRef({});
    useLayoutEffect(() => {
        if (!focused) return;
        const layers =
            preserveCamera && store.getSnapshot()
                ? Children.toArray(children).filter(
                      (child) => child?.type !== Mapbox.Camera,
                  )
                : children;
        store.publish(owner.current, {
            props,
            children: layers,
            mapRef,
            base,
            layerKey,
        });
    });
    useLayoutEffect(() => {
        if (!focused) return;
        const token = owner.current;
        return () => store.release(token);
    }, [store, focused]);
    return <View className="flex-1" pointerEvents="none" />;
}

// Render routed content above the shared map, outside native navigator surfaces
// which otherwise consume touches even when their backgrounds are transparent.
export function PersistentMapScene({ children }) {
    const store = useContext(PersistentSceneContext);
    return store ? (
        <HostedScene store={store}>{children}</HostedScene>
    ) : (
        children
    );
}

function HostedScene({ store, children }) {
    const id = useId();
    const focused = useIsFocused();
    const values = [
        useContext(NavigationContext),
        useContext(NavigationRouteContext),
        useContext(NavigationBuilderContext),
        useContext(NavigationStateContext),
        useContext(NavigationFocusedRouteStateContext),
        useContext(NamedRouteContextListContext),
        useContext(IsFocusedContext),
        useContext(FocusedRouteKeyContext),
    ];
    useLayoutEffect(() => {
        const content = navigationContexts.reduceRight(
            (child, context, index) => (
                <context.Provider value={values[index]}>
                    {child}
                </context.Provider>
            ),
            children,
        );
        store.publish(id, { focused, children: content });
    });
    useLayoutEffect(() => () => store.release(id), [store, id]);
    return null;
}
