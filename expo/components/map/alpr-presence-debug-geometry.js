import { PRESENCE_POLICY, presenceCoordinate, presenceLocationIsReliable, presenceNodeIsWithinTrackingRange } from './alpr-presence-policy.js';

/** Ephemeral map geometry, kept out of shareable diagnostic snapshots. */
export function buildPresenceDebugGeometry(inspection, enabled) {
    const features = [];
    const location = inspection?.context?.location;
    if (!enabled || !presenceLocationIsReliable(location))
        return { type: 'FeatureCollection', features };
    const center = presenceCoordinate(location);
    const offset = (east, north) => [
        ((center[0] +
            east / (111195 * Math.cos((center[1] * Math.PI) / 180)) +
            540) %
            360) -
            180,
        center[1] + north / 111195,
    ];
    const heading = (location.heading * Math.PI) / 180;
    const ring = Array.from({ length: 65 }, (_, i) => {
        const angle = ((i % 64) * Math.PI) / 32;
        const right =
            Math.sin(angle) *
            (Math.sin(angle) >= 0
                ? PRESENCE_POLICY.rightPassDistanceMeters
                : PRESENCE_POLICY.leftPassDistanceMeters);
        const forward =
            Math.cos(angle) * PRESENCE_POLICY.forwardPassDistanceMeters;
        return offset(
            forward * Math.sin(heading) + right * Math.cos(heading),
            forward * Math.cos(heading) - right * Math.sin(heading),
        );
    });
    features.push({
        type: 'Feature',
        properties: { kind: 'radius' },
        geometry: { type: 'Polygon', coordinates: [ring] },
    });
    const approaches = inspection.pass?.approaches ?? [];
    const encounter = inspection.encounter;
    const tracks = encounter ? [...approaches, encounter] : approaches;
    for (const track of tracks) {
        if (!presenceNodeIsWithinTrackingRange(location, track.node)) continue;
        const coordinate = presenceCoordinate(track.node);
        if (!coordinate.every(Number.isFinite)) continue;
        const qualified = track.withinPassRange === true;
        const color = qualified ? '#22c55e' : '#ef4444';
        features.push({
            type: 'Feature',
            properties: { kind: 'track', color },
            geometry: { type: 'LineString', coordinates: [center, coordinate] },
        });
        features.push({
            type: 'Feature',
            properties: {
                kind: 'target',
                color,
            },
            geometry: { type: 'Point', coordinates: coordinate },
        });
    }
    return { type: 'FeatureCollection', features };
}
