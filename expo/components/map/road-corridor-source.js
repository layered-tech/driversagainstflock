let snapshot = { source: 'unavailable', reason: 'Waiting for roads' };
const listeners = new Set();
export const getCorridorSource = () => snapshot;
export function subscribeCorridorSource(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
export function publishCorridorSource(next) {
    if (next.source === snapshot.source && next.reason === snapshot.reason)
        return false;
    snapshot = next;
    listeners.forEach((listener) => listener());
    return true;
}
export function corridorSourceLabel(state) {
    const label =
        state.source === 'download'
            ? 'Road corridors: Wisconsin download'
            : state.source === 'service'
              ? 'Road corridors: Existing service — fallback'
              : 'Road corridors: Unavailable';
    return state.reason ? `${label}\n${state.reason}` : label;
}
