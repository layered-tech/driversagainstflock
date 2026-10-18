import { useEffect } from 'react';
import { getDrivingMarkerRequiredBounds } from './map/marker-load-bounds';

const MARKER_RECOVERY_INTERVAL_MS = 15000;

export function useAndroidAutoMarkers({
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

        // A reattached car surface can follow the shared location without emitting
        // camera bounds. The loader skips pending and already-covered areas.
        const recoverMarkers = () => scheduleMarkerLoad(bounds, 0);

        recoverMarkers();
        const interval = setInterval(
            recoverMarkers,
            MARKER_RECOVERY_INTERVAL_MS,
        );

        return () => clearInterval(interval);
    }, [enabled, latitude, longitude, scheduleMarkerLoad]);
}
