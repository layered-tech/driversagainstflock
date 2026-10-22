import { useEffect, useSyncExternalStore } from 'react';
import {
    AUTO_PLAY_CLUSTER_PLATFORM_CONFIG,
    getAutoPlayClusterState,
} from './auto-play-cluster-state';
import {
    createAutoPlayMapSurface,
    setAutoPlayMapColorScheme,
} from './auto-play-map-surface';
import { retainRoadMatchingSessionAsync } from './map/road-matching-session';
import {
    addSharedRoutingStateListener,
    getSharedRoutingState,
    hydrateSharedRoutingStateAsync,
} from './map/shared-routing-state';

const ClusterMapSurface = createAutoPlayMapSurface(
    AUTO_PLAY_CLUSTER_PLATFORM_CONFIG,
);

export function AutoPlayClusterSurface(props) {
    const routingState = useSyncExternalStore(
        addSharedRoutingStateListener,
        getSharedRoutingState,
        getSharedRoutingState,
    );

    useEffect(() => {
        const { AutoPlayCluster } = require('@iternio/react-native-auto-play');

        return AutoPlayCluster.addListenerColorScheme((id, colorScheme) => {
            if (id === props.id) {
                setAutoPlayMapColorScheme(colorScheme);
            }
        });
    }, [props.id]);

    useEffect(() => {
        let isActive = true;
        let session;

        // The host can keep only the cluster alive after closing the main map.
        void hydrateSharedRoutingStateAsync().catch(() => {});
        void retainRoadMatchingSessionAsync({ persistent: true })
            .then((handle) => {
                if (!isActive) {
                    handle.remove();
                    return;
                }

                session = handle;
            })
            .catch(() => {});

        return () => {
            isActive = false;
            session?.remove();
        };
    }, []);

    return (
        <ClusterMapSurface
            {...props}
            id={props?.id ?? 'AutoPlayCluster'}
            stateOverride={getAutoPlayClusterState(routingState)}
        />
    );
}
