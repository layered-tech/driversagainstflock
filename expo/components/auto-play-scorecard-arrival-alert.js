const UNINITIALIZED_TRIP_ID = Symbol('uninitialized-trip-id');

function getPendingRecapTripId(snapshot) {
    const tripId = snapshot?.scorecardState?.pendingRecapTripId;

    return typeof tripId === 'string' && tripId ? tripId : null;
}

function getScorecardArrivalAlertContent(trip) {
    const crossingCount = Math.max(
        0,
        Math.floor(
            Number(trip.confirmedReadCount ?? 0) +
                Number(trip.possibleReadCount ?? 0),
        ),
    );
    const isArrival = ['arrival', 'arrived'].includes(trip.completion);
    const completionLabel = isArrival ? 'Arrived' : 'Route ended';
    const title =
        crossingCount === 0
            ? `${completionLabel}, unseen`
            : `${completionLabel} · ${crossingCount} ${crossingCount === 1 ? 'crossing' : 'crossings'}`;
    const distanceMiles = Number(trip.distanceMiles);
    const avoidedCameraCount = Math.max(
        0,
        Math.floor(Number(trip.avoidedCameraCount ?? 0)),
    );
    const distanceLabel =
        Number.isFinite(distanceMiles) && distanceMiles >= 0
            ? `${distanceMiles.toFixed(1)} mi`
            : null;

    return {
        subtitle: [`${avoidedCameraCount} avoided`, distanceLabel]
            .filter(Boolean)
            .join(' · '),
        title,
    };
}

function tripCanShowAutoPlayArrivalAlert(snapshot, trip) {
    return (
        snapshot?.scorecardState?.settings?.enabled !== false &&
        trip?.completed === true &&
        trip.mode === 'guided' &&
        ['arrival', 'arrived', 'manual'].includes(trip.completion)
    );
}

export function createAutoPlayScorecardArrivalAlertController(initialSnapshot) {
    let lastPendingTripId = initialSnapshot?.isHydrated
        ? getPendingRecapTripId(initialSnapshot)
        : UNINITIALIZED_TRIP_ID;
    const handledTripIds = new Set(
        lastPendingTripId && lastPendingTripId !== UNINITIALIZED_TRIP_ID
            ? [lastPendingTripId]
            : [],
    );

    return {
        consume(snapshot) {
            if (!snapshot?.isHydrated) {
                return null;
            }

            const pendingTripId = getPendingRecapTripId(snapshot);

            if (lastPendingTripId === UNINITIALIZED_TRIP_ID) {
                lastPendingTripId = pendingTripId;

                if (pendingTripId) {
                    handledTripIds.add(pendingTripId);
                }

                return null;
            }

            if (pendingTripId === lastPendingTripId) {
                return null;
            }

            lastPendingTripId = pendingTripId;

            if (!pendingTripId || handledTripIds.has(pendingTripId)) {
                return null;
            }

            handledTripIds.add(pendingTripId);
            const trip = snapshot.scorecardState.trips?.find(
                (candidate) => candidate?.id === pendingTripId,
            );

            return trip && tripCanShowAutoPlayArrivalAlert(snapshot, trip)
                ? getScorecardArrivalAlertContent(trip)
                : null;
        },
    };
}
