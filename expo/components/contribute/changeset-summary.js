export function getChangesetSummary(pins = [], removals = []) {
    pins = pins.filter((pin) => pin.details?.staged !== false);
    const added = pins.filter((pin) => !pin.nodeId).length;
    const edited = pins.length - added;
    const deleted = removals.length;
    return {
        added,
        edited,
        deleted,
        total: added + edited + deleted,
        label: [
            added ? `${added} added` : null,
            edited ? `${edited} edited` : null,
            deleted ? `${deleted} deleted` : null,
        ]
            .filter(Boolean)
            .join(' · '),
    };
}
