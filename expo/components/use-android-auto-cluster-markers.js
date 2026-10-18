import { useEffect } from 'react';
import { getDrivingMarkerRequiredBounds } from './map/marker-load-bounds';

const CLUSTER_MARKER_RECOVERY_INTERVAL_MS = 15000;

export function useAndroidAutoClusterMarkers({
    enabled,
    userLocation,
    scheduleMarkerLoad,
}) {
    const latitude = userLocation?.latitude;
    const longitude = userLocation?.longitude;

    useEffect(() => {
        if (!enabled) {
            return undefined;
        }

        const bounds = getDrivingMarkerRequiredBounds({ latitude, longitude });

        if (!bounds) {
            return undefined;
        }

        // A reattached cluster can follow the shared location without emitting
        // camera bounds. The loader skips pending and already-covered areas.
        const recoverMarkers = () => scheduleMarkerLoad(bounds, 0);

        recoverMarkers();
        const interval = setInterval(
            recoverMarkers,
            CLUSTER_MARKER_RECOVERY_INTERVAL_MS,
        );

        return () => clearInterval(interval);
    }, [enabled, latitude, longitude, scheduleMarkerLoad]);
}
