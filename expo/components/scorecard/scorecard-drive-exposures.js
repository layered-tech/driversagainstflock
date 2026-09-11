function numericTimestamp(value) {
    const timestamp = Number(value);

    return Number.isFinite(timestamp) ? timestamp : 0;
}

function getTripIndexes(trips) {
    const orderedTrips = [...(Array.isArray(trips) ? trips : [])].sort(
        (first, second) =>
            numericTimestamp(second?.endedAt) -
            numericTimestamp(first?.endedAt),
    );
    const tripsById = new Map();
    const tripsByExposureId = new Map();

    for (const trip of orderedTrips) {
        if (!trip?.id) {
            continue;
        }

        tripsById.set(String(trip.id), trip);

        for (const eventId of trip.exposureEventIds ?? []) {
            if (eventId && !tripsByExposureId.has(String(eventId))) {
                tripsByExposureId.set(String(eventId), trip);
            }
        }
    }

    return { tripsByExposureId, tripsById };
}

export function getScorecardExposureDriveGroups(scorecardState) {
    const exposures = Array.isArray(scorecardState?.exposures)
        ? scorecardState.exposures
        : [];
    const { tripsByExposureId, tripsById } = getTripIndexes(
        scorecardState?.trips,
    );
    const activeSession = scorecardState?.activeSession ?? null;
    const groups = new Map();

    for (const exposure of exposures) {
        if (!exposure?.id || !exposure?.sessionId) {
            continue;
        }

        const sessionId = String(exposure.sessionId);
        const matchingTrip =
            tripsById.get(sessionId) ??
            tripsByExposureId.get(String(exposure.id)) ??
            null;
        const driveId = String(matchingTrip?.id ?? sessionId);
        const group = groups.get(driveId) ?? {
            driveId,
            exposures: [],
            trip: matchingTrip,
        };

        group.exposures.push(exposure);
        groups.set(driveId, group);
    }

    return [...groups.values()]
        .map((group) => {
            const orderedExposures = [...group.exposures].sort(
                (first, second) =>
                    numericTimestamp(first?.occurredAt) -
                    numericTimestamp(second?.occurredAt),
            );
            const firstExposureAt = numericTimestamp(
                orderedExposures[0]?.occurredAt,
            );
            const lastExposureAt = numericTimestamp(
                orderedExposures.at(-1)?.occurredAt,
            );
            const active = String(activeSession?.id ?? '') === group.driveId;
            const trip = group.trip ?? tripsById.get(group.driveId) ?? null;
            const confirmedCount = orderedExposures.filter(
                (exposure) => exposure.certainty === 'confirmed',
            ).length;
            const possibleCount = orderedExposures.filter(
                (exposure) => exposure.certainty === 'possible',
            ).length;

            return {
                active,
                confirmedCount,
                driveId: group.driveId,
                endedAt: numericTimestamp(trip?.endedAt) || lastExposureAt,
                exposures: orderedExposures,
                mode:
                    trip?.mode ?? (active ? activeSession?.mode : null) ?? null,
                possibleCount,
                startedAt:
                    numericTimestamp(trip?.startedAt) ||
                    (active ? numericTimestamp(activeSession?.startedAt) : 0) ||
                    firstExposureAt,
                trip,
            };
        })
        .sort(
            (first, second) =>
                second.endedAt - first.endedAt ||
                second.driveId.localeCompare(first.driveId),
        );
}

export function getScorecardExposureDriveGroup(scorecardState, driveId) {
    const normalizedDriveId = Array.isArray(driveId) ? driveId[0] : driveId;

    if (typeof normalizedDriveId !== 'string' || !normalizedDriveId) {
        return null;
    }

    return (
        getScorecardExposureDriveGroups(scorecardState).find(
            (group) => group.driveId === normalizedDriveId,
        ) ?? null
    );
}
