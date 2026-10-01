import { getStoredNumber } from './geo';

export function getCurrentLocationRoadHint(location, now = Date.now()) {
    const match = location?.roadMatch;
    const recordedAt = getStoredNumber(location?.recordedAt);
    const confidence = getStoredNumber(
        match?.confidence ?? match?.edgeMatchProbability,
    );
    const offset = getStoredNumber(match?.distanceFromObservationMeters);
    const accuracy = getStoredNumber(location?.accuracy);
    const roadName =
        typeof match?.roadName === 'string' ? match.roadName.trim() : '';

    if (
        recordedAt === null ||
        now - recordedAt > 5000 ||
        now < recordedAt ||
        confidence === null ||
        confidence < 0.8 ||
        match?.isOffRoad !== false ||
        match?.isTeleport === true ||
        offset === null ||
        offset > 25 ||
        offset < 0 ||
        (accuracy !== null && (accuracy < 0 || accuracy > 50)) ||
        roadName.length === 0 ||
        roadName.length > 255
    ) {
        return null;
    }

    return roadName;
}
