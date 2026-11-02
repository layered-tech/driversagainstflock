const MANEUVER_KINDS = [
    'left',
    'right',
    'sharp-left',
    'sharp-right',
    'slight-left',
    'slight-right',
    'straight',
    'roundabout',
    'roundabout',
    'uturn',
    'arrive',
    'depart',
    'keep-left',
    'keep-right',
];

export function getManeuverKind(maneuver) {
    return Number.isInteger(maneuver?.type)
        ? (MANEUVER_KINDS[maneuver.type] ?? null)
        : null;
}

export function getManeuverExitNumber(kind, exitNumber) {
    return kind === 'roundabout' &&
        Number.isInteger(exitNumber) &&
        exitNumber > 0
        ? exitNumber
        : null;
}

export function getManeuverAccessibilityLabel(kind, exitNumber) {
    const exit = getManeuverExitNumber(kind, exitNumber);
    if (!kind) return 'Guidance updating';
    return exit === null
        ? kind.replaceAll('-', ' ')
        : `Roundabout exit ${exit}`;
}
