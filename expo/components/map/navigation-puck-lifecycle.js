function captureMapView(mapViewRef) {
    const mapView =
        mapViewRef && typeof mapViewRef === 'object' && 'current' in mapViewRef
            ? mapViewRef.current
            : mapViewRef;

    return mapView ? Object.freeze({ current: mapView }) : null;
}

export function createNavigationPuckLifecycle({
    applyNavigationPuck,
    clearNavigationPuck,
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

    function request({ layerAbove, mapViewRef, requested, scale, slot }) {
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
                    wasApplied = Boolean(
                        mapView &&
                        (await applyNavigationPuck(
                            mapView,
                            scale,
                            slot,
                            layerAbove,
                        )),
                    );
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
                    mapView && (await clearNavigationPuck(mapView)),
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
