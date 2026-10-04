function captureMapView(mapViewRef) {
    const mapView =
        mapViewRef && typeof mapViewRef === 'object' && 'current' in mapViewRef
            ? mapViewRef.current
            : mapViewRef;

    return mapView ? Object.freeze({ current: mapView }) : null;
}

export function createLocationPuck3DLifecycle({
    applyLocationPuck,
    clearLocationPuck,
    verifyLocationPuck = async () => true,
    waitForPuckCommit = async () => {},
    onStatusChange = () => {},
}) {
    let generation = 0;
    let nativePuckMayBeConfigured = false;
    let operationQueue = Promise.resolve(false);
    let status = 'inactive';

    function setStatus(nextStatus) {
        if (status === nextStatus) {
            return;
        }

        status = nextStatus;
        onStatusChange(nextStatus);
    }

    function enqueue(operation) {
        const result = operationQueue
            .then(operation, operation)
            .catch(() => false);

        operationQueue = result;

        return result;
    }

    function request({
        layerAbove,
        mapViewRef,
        requested,
        scaleExpression,
        slot,
    }) {
        const operationGeneration = generation + 1;
        const mapView = captureMapView(mapViewRef);

        generation = operationGeneration;

        if (requested) {
            if (status !== 'preparing' && status !== 'active') {
                setStatus('preparing');

                return operationQueue;
            }

            return enqueue(async () => {
                if (operationGeneration !== generation) {
                    return false;
                }

                let wasApplied = false;

                try {
                    nativePuckMayBeConfigured = Boolean(mapView);
                    // React's commit can precede RNMapbox's native 2D cleanup.
                    // Verify ownership after that cleanup, and reassert once if it won the race.
                    await waitForPuckCommit();
                    for (let attempt = 0; attempt < 2; attempt += 1) {
                        if (operationGeneration !== generation) return false;
                        wasApplied = Boolean(
                            mapView &&
                            (await applyLocationPuck(
                                mapView,
                                scaleExpression,
                                slot,
                                layerAbove,
                            )),
                        );
                        if (!wasApplied) break;
                        await waitForPuckCommit();
                        wasApplied = Boolean(await verifyLocationPuck(mapView));
                        if (wasApplied) break;
                    }
                } catch {
                    wasApplied = false;
                }

                if (operationGeneration === generation) {
                    setStatus(wasApplied ? 'active' : 'failed');
                }

                return wasApplied;
            });
        }

        if (status === 'inactive' && !nativePuckMayBeConfigured) {
            setStatus('inactive');

            return operationQueue;
        }

        setStatus('clearing');

        return enqueue(async () => {
            if (operationGeneration !== generation) {
                return false;
            }

            let wasCleared = false;

            try {
                wasCleared = Boolean(
                    mapView && (await clearLocationPuck(mapView)),
                );
            } catch {
                wasCleared = false;
            }

            if (operationGeneration === generation) {
                nativePuckMayBeConfigured = false;
                setStatus('inactive');
            }

            return wasCleared;
        });
    }

    return {
        getStatus: () => status,
        invalidate() {
            generation += 1;
        },
        request,
    };
}
