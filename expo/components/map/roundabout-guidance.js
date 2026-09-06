const ROUNDABOUT_MANEUVER_TYPES = new Set([7, 8]);

export function isRoundaboutManeuver(maneuver) {
    return ROUNDABOUT_MANEUVER_TYPES.has(Number(maneuver?.type));
}

export function getRoundaboutExitNumber(maneuver) {
    const exitNumber = Number(maneuver?.exit_number);

    return Number.isInteger(exitNumber) && exitNumber >= 1 ? exitNumber : null;
}

export function shouldHoldRoundaboutManeuver(maneuver, userLocation) {
    const roadMatch = userLocation?.roadMatch;
    const isOnExitRoad =
        roadMatch?.isOffRoad === false && roadMatch?.isRoundabout === false;

    return Number(maneuver?.type) === 7 && !isOnExitRoad;
}
