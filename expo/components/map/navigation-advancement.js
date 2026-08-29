export function shouldKeepCurrentManeuverActive({
    currentManeuver,
    progressDistance,
    upcomingManeuver,
}) {
    if (!upcomingManeuver || currentManeuver?.type === 10) {
        return true;
    }

    return progressDistance <= currentManeuver.startDistance;
}
