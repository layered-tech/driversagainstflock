import { useEffect, useState } from 'react';
import { getDisplaySpeedState, getValidSpeedMps } from './display-speed-state';

export function useDisplaySpeed({ enabled, speedMps, recordedAt }) {
    const speed = getValidSpeedMps(speedMps);
    const fixRecordedAt = Number.isFinite(recordedAt) ? recordedAt : null;
    const [state, setState] = useState(null);
    let currentState = state;

    if (
        !state ||
        state.enabled !== enabled ||
        state.speed !== speed ||
        state.recordedAt !== fixRecordedAt
    ) {
        currentState = getDisplaySpeedState(
            state,
            { enabled, speed, recordedAt: fixRecordedAt },
            Date.now(),
        );
        setState(currentState);
    }

    const expiresAt = currentState.expiresAt;

    useEffect(() => {
        if (expiresAt === null) {
            return undefined;
        }

        const timeout = setTimeout(
            () => {
                setState((previous) =>
                    previous.expiresAt === expiresAt
                        ? { ...previous, displayedSpeed: null, expiresAt: null }
                        : previous,
                );
            },
            Math.max(0, expiresAt - Date.now()),
        );

        return () => clearTimeout(timeout);
    }, [expiresAt]);

    return currentState.displayedSpeed;
}
