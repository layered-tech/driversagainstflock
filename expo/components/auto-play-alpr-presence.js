import Mapbox from '@rnmapbox/maps';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
    addAutoPlaySessionStateListener,
    getAutoPlaySessionState,
} from './auto-play-session-state';
import {
    buildPresenceDebugSnapshot,
    presenceDebugStore,
} from './map/alpr-presence-debug';
import { buildPresenceDebugGeometry } from './map/alpr-presence-debug-geometry';
import { getPresenceE2EFixture } from './map/alpr-presence-e2e';
import { createPresenceInventory } from './map/alpr-presence-inventory';
import {
    getPresenceMotionPath,
    presenceCoordinate,
} from './map/alpr-presence-policy';
import { createPresencePrompt } from './map/alpr-presence-prompt';
import {
    presenceCoordinator,
    startPresenceRuntime,
} from './map/alpr-presence-runtime';
import {
    getActiveDirectionsManeuver,
    getSelectedDirectionsRouteOption,
} from './map/directions';

function usePresenceMapTemplate() {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
    return require('@iternio/react-native-auto-play').useMapTemplate();
}

function maneuverClearance(route, location) {
    if (!route) return null;
    const maneuver = getActiveDirectionsManeuver(route, location);
    return Number.isFinite(maneuver?.distanceToManeuver)
        ? maneuver.distanceToManeuver / Math.max(1, location?.speed ?? 0)
        : 0;
}

export function useAutoPlayAlprPresence({
    markerLoader,
    debugEnabled,
    enabled,
    blocked,
    warningBusy,
    location,
    route,
    suppressAlerts,
    viewport,
    controller,
}) {
    const mapTemplate = usePresenceMapTemplate();
    const [node, setNode] = useState(null);
    const [debugGeometry, setDebugGeometry] = useState(null);
    const latest = useRef(null);
    const machine = useRef(null);
    const inventory = useRef(null);
    const routeOption = getSelectedDirectionsRouteOption(route);
    const routeKey = useMemo(
        () =>
            route
                ? JSON.stringify([
                      routeOption?.routeKey,
                      routeOption?.coordinates,
                  ])
                : 'free',
        [route, routeOption?.routeKey, routeOption?.coordinates],
    );
    const coordinates = route
        ? routeOption?.coordinates
        : getPresenceMotionPath(location);
    latest.current = {
        markerLoader,
        debugEnabled,
        enabled,
        blocked,
        warningBusy,
        location,
        routeKey,
        navigationActive: Boolean(route),
        coordinates,
        pathSource: route ? 'navigation route' : 'GPS movement',
        viewport,
        maneuverSeconds: maneuverClearance(route, location),
        manual:
            controller.drivingRecenterIsVisible && !machine.current?.ownsCamera,
    };

    useEffect(() => {
        if (!enabled) return;
        startPresenceRuntime();
        const lookup = createPresenceInventory({
            getLocation: () => latest.current.location,
            getMapInventory: () => latest.current.markerLoader,
        });
        inventory.current = lookup;

        return () => {
            lookup.dispose();
            inventory.current = null;
        };
    }, [enabled]);

    useEffect(() => {
        if (!enabled || !mapTemplate) return;
        const prompt = createPresencePrompt({
            coordinator: presenceCoordinator,
            trace: (event, details) => {
                presenceDebugStore.event(event, Date.now(), details);
                if (getPresenceE2EFixture())
                    console.info(`[E2E] presence:${event}`);
            },
            host: mapTemplate,
            highlight: setNode,
            platform: Platform.OS === 'android' ? 'android_auto' : 'carplay',
            suppressAlerts,
            camera: {
                focus: (...args) => controller.focusPresenceCamera(...args),
                restore: (manual) => controller.restorePresenceCamera(manual),
            },
            getContext: () => {
                const current = latest.current;
                const session = getAutoPlaySessionState();
                return {
                    ...current,
                    navigationCamera: controller.getPresenceNavigationCamera(),
                    cameraDiagnostics:
                        controller.getPresenceCameraDiagnostics(),
                    connected: session.isConnected,
                    ...inventory.current?.getContext(),
                    ...getPresenceE2EFixture(),
                };
            },
        });
        machine.current = prompt;
        controller.presenceInterruptRef.current = (manual) =>
            prompt.interrupt(manual);
        const tick = () => {
            prompt.tick();
            setDebugGeometry(
                latest.current.debugEnabled
                    ? buildPresenceDebugGeometry(prompt.inspect(true), true)
                    : null,
            );
            const now = Date.now();
            presenceDebugStore.record(
                () =>
                    buildPresenceDebugSnapshot(
                        prompt.inspect(),
                        presenceCoordinator.state,
                        now,
                    ),
                now,
            );
        };
        const unsubscribe = addAutoPlaySessionStateListener(tick);
        const timer = setInterval(tick, 250);
        return () => {
            clearInterval(timer);
            unsubscribe();
            prompt.stop();
            presenceDebugStore.event('Car confirmation tracker stopped');
            machine.current = null;
            controller.presenceInterruptRef.current = null;
        };
    }, [
        enabled,
        mapTemplate,
        suppressAlerts,
        controller.focusPresenceCamera,
        controller.getPresenceNavigationCamera,
        controller.getPresenceCameraDiagnostics,
        controller.restorePresenceCamera,
        controller.presenceInterruptRef,
    ]);
    useLayoutEffect(() => {
        machine.current?.tick();
    });
    return {
        node,
        debugGeometry: enabled && debugEnabled ? debugGeometry : null,
    };
}

const PRESENCE_PULSE_HALF_CYCLE_MS = 900;

export function AutoPlayPresenceHighlight({ node }) {
    const [expanded, setExpanded] = useState(false);
    const nodeId = node?.osm_id ?? null;

    useEffect(() => {
        setExpanded(false);
        if (nodeId === null) return;

        const timer = setInterval(() => {
            setExpanded((value) => !value);
        }, PRESENCE_PULSE_HALF_CYCLE_MS);
        return () => clearInterval(timer);
    }, [nodeId]);

    if (!node) return null;
    return (
        <Mapbox.ShapeSource
            id="passed-alpr-confirmation"
            shape={{
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'Point',
                    coordinates: presenceCoordinate(node),
                },
            }}
        >
            <Mapbox.CircleLayer
                id="passed-alpr-confirmation-ring"
                style={{
                    circleRadius: expanded ? 32 : 16,
                    circleColor: '#4da6ff',
                    circleEmissiveStrength: 1,
                    circleOpacity: expanded ? 0.08 : 0.3,
                    circleRadiusTransition: {
                        duration: PRESENCE_PULSE_HALF_CYCLE_MS,
                        delay: 0,
                    },
                    circleOpacityTransition: {
                        duration: PRESENCE_PULSE_HALF_CYCLE_MS,
                        delay: 0,
                    },
                    circlePitchAlignment: 'viewport',
                    circlePitchScale: 'viewport',
                }}
            />
        </Mapbox.ShapeSource>
    );
}

export function AutoPlayPresenceDebugGeometry({ shape }) {
    if (!shape) return null;
    return (
        <Mapbox.ShapeSource id="alpr-presence-debug" shape={shape}>
            <Mapbox.FillLayer
                id="alpr-presence-debug-radius-fill"
                filter={['==', ['get', 'kind'], 'radius']}
                style={{ fillColor: '#38bdf8', fillOpacity: 0.12 }}
            />
            <Mapbox.LineLayer
                id="alpr-presence-debug-radius"
                filter={['==', ['get', 'kind'], 'radius']}
                style={{ lineColor: '#38bdf8', lineWidth: 2 }}
            />
            <Mapbox.LineLayer
                id="alpr-presence-debug-tracks"
                filter={['==', ['get', 'kind'], 'track']}
                style={{ lineColor: ['get', 'color'], lineWidth: 3 }}
            />
            <Mapbox.CircleLayer
                id="alpr-presence-debug-targets"
                filter={['==', ['get', 'kind'], 'target']}
                style={{
                    circleColor: ['get', 'color'],
                    circleRadius: 7,
                    circleStrokeColor: '#ffffff',
                    circleStrokeWidth: 2,
                }}
            />
        </Mapbox.ShapeSource>
    );
}
