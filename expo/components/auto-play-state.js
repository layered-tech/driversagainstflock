import { useEffect, useState } from 'react';

export const DEFAULT_AUTO_PLAY_STATE = {
    detailText: 'Search for a destination to start a private route.',
    directionsRoute: null,
    drivingModeIsActive: true,
    errorText: '',
    isNavigating: false,
    maneuverText: '',
    routeDistanceText: '',
    routeDurationText: '',
    routeLoading: null,
    routeName: '',
    singleResultCountdown: null,
    statusLabel: 'Ready',
    submittedSearchQuery: '',
    submittedSearchResults: [],
    title: 'Drivers Against Flock',
};

let autoPlayState = DEFAULT_AUTO_PLAY_STATE;

const autoPlayStateListeners = new Set();

export function getAutoPlayState() {
    return autoPlayState;
}

export function setAutoPlayState(nextState) {
    autoPlayState = {
        ...autoPlayState,
        ...nextState,
    };

    autoPlayStateListeners.forEach((listener) => listener(autoPlayState));
}

export function useAutoPlayState() {
    const [state, setState] = useState(autoPlayState);

    useEffect(() => {
        autoPlayStateListeners.add(setState);

        return () => {
            autoPlayStateListeners.delete(setState);
        };
    }, []);

    return state;
}
