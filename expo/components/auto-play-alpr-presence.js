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
            trace: (event) => {
                presenceDebugStore.event(event);
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
                    connected: session.isConnected,
                    visible: session.renderState === 'didAppear',
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
        controller.restorePresenceCamera,
        controller.presenceInterruptRef,
    ]);
    useLayoutEffect(() => {
        machine.current?.tick();
    });
    return node;
}

export function AutoPlayPresenceHighlight({ node }) {
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
                    circleRadius: 24,
                    circleColor: '#ffffff',
                    circleOpacity: 0.15,
                    circleStrokeColor: '#ffbc42',
                    circleStrokeWidth: 5,
                    circlePitchAlignment: 'map',
                }}
            />
        </Mapbox.ShapeSource>
    );
}
