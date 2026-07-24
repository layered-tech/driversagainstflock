import { useEffect, useState } from 'react';
import { normalizeElectronicHorizon } from './electronic-horizon';
import {
    addRoadLookAheadListener,
    getLastRoadLookAheadAsync,
} from './road-matching-session';

export function useElectronicHorizon({ enabled = true } = {}) {
    const [electronicHorizon, setElectronicHorizon] = useState(null);

    useEffect(() => {
        if (!enabled) {
            setElectronicHorizon(null);

            return undefined;
        }

        let isActive = true;
        const updateElectronicHorizon = (nextElectronicHorizon) => {
            const normalizedElectronicHorizon = normalizeElectronicHorizon(
                nextElectronicHorizon,
            );

            if (isActive) {
                setElectronicHorizon(normalizedElectronicHorizon);
            }
        };
        const subscription = addRoadLookAheadListener(updateElectronicHorizon);

        getLastRoadLookAheadAsync()
            .then(updateElectronicHorizon)
            .catch(() => {});

        return () => {
            isActive = false;
            subscription.remove();
        };
    }, [enabled]);

    return electronicHorizon;
}
