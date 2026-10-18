function numberState(value) {
    if (value === null || value === undefined) return 'missing';
    return Number.isFinite(value) ? 'finite' : 'non-finite';
}

// Explicitly select fields: the native snapshot also contains precise locations.
export function getLocationPuckDiagnosticState(state) {
    if (!state) return { available: false };

    return {
        available: true,
        puckKind: state.puckKind,
        locationEnabled: state.locationEnabled,
        puckBearing: state.puckBearing,
        puckBearingEnabled: state.puckBearingEnabled,
        providerOwnedByApp: state.providerOwnedByApp,
        modelLayerExists: state.modelLayerExists,
        indicatorLayerExists: state.indicatorLayerExists,
        cameraFollowingPuck: state.cameraFollowingPuck,
        providerHeadingState: numberState(state.providerHeading),
        renderedBearingState: numberState(state.renderedBearing),
        cameraBearingState: numberState(state.cameraBearing),
    };
}

export function createLocationPuckDiagnostics({ log, readState }) {
    let sequence = 0;

    return function recordTransition(transition, status) {
        const transitionSequence = ++sequence;
        const data = { transition, status, sequence: transitionSequence };
        // Record the transition immediately; a native crash may prevent the read.
        log({ category: 'map.puck', message: 'Puck transition', data });
        void Promise.resolve()
            .then(readState)
            .then((state) => {
                log({
                    category: 'map.puck',
                    message: 'Puck native snapshot',
                    data: {
                        ...data,
                        superseded: transitionSequence !== sequence,
                        ...getLocationPuckDiagnosticState(state),
                    },
                });
            })
            .catch(() => {
                log({
                    category: 'map.puck',
                    message: 'Puck native snapshot unavailable',
                    data,
                });
            });
    };
}
