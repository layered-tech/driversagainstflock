import { useEffect, useSyncExternalStore } from 'react';
import {
    ANDROID_AUTO_CLUSTER_PLATFORM_CONFIG,
    getAndroidAutoClusterState,
} from './android-auto-cluster-state';
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
    ANDROID_AUTO_CLUSTER_PLATFORM_CONFIG,
);

export function AndroidAutoClusterSurface(props) {
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
            id={props?.id ?? 'AndroidAutoCluster'}
            stateOverride={getAndroidAutoClusterState(routingState)}
        />
    );
}
