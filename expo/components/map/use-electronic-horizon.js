import {
    addElectronicHorizonListener,
    getLastElectronicHorizonAsync,
    isSupported as mapboxNavigationIsSupported,
} from '@rnmapbox/navigation';
import { useEffect, useState } from 'react';
import { normalizeElectronicHorizon } from './electronic-horizon';

export function useElectronicHorizon({ enabled = true } = {}) {
    const [electronicHorizon, setElectronicHorizon] = useState(null);

    useEffect(() => {
        if (!enabled || !mapboxNavigationIsSupported()) {
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
        const subscription = addElectronicHorizonListener(
            updateElectronicHorizon,
        );

        getLastElectronicHorizonAsync()
            .then(updateElectronicHorizon)
            .catch(() => {});

        return () => {
            isActive = false;
            subscription.remove();
        };
    }, [enabled]);

    return electronicHorizon;
}
