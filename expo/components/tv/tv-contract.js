export const TV_PROTOCOL_VERSION = 1;

const label = (value) =>
    typeof value === 'string' ? value.trim().slice(0, 160) : '';
const count = (value) =>
    Number.isSafeInteger(value) && value >= 0 ? value : 0;
const identifier = (value) =>
    Number.isSafeInteger(value) && value > 0 ? value : null;
const MAX_SNAPSHOT_BYTES = 900_000;
const utf8Length = (value) => {
    let bytes = 0;
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code <= 0x7f) bytes += 1;
        else if (code <= 0x7ff) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff) {
            bytes += 4;
            index++;
        } else bytes += 3;
    }
    return bytes;
};

/** Only public area/feed fields cross the household connection. */
export function createTvAreaSnapshot(
    areas,
    feeds = {},
    now = Date.now(),
    cameras = {},
) {
    const snapshot = {
        protocolVersion: TV_PROTOCOL_VERSION,
        publishedAt: now,
        areas: (Array.isArray(areas) ? areas : [])
            .filter((area) => identifier(area?.id))
            .slice(0, 25)
            .map((area) => ({
                id: area.id,
                name: label(area.name),
                kind: ['city', 'county', 'zip', 'radius', 'drawn'].includes(
                    area.kind,
                )
                    ? area.kind
                    : '',
                description: label(area.definition),
                cadence:
                    {
                        instant: 'Instant',
                        daily: 'Daily',
                        weekly: 'Weekly',
                        off: 'In-app',
                    }[area.alert_mode] ?? '',
                cameraCount: count(area.camera_count),
                addedCount: count(area.counts?.added),
                removedCount: count(area.counts?.removed),
                changesStatus: feeds[area.id] ? 'ready' : 'unavailable',
                mappedCameras: (Array.isArray(cameras[area.id]?.cameras?.data)
                    ? cameras[area.id].cameras.data
                    : []
                )
                    .filter(
                        (camera) =>
                            Number.isFinite(camera?.latitude) &&
                            Math.abs(camera.latitude) <= 90 &&
                            Number.isFinite(camera?.longitude) &&
                            Math.abs(camera.longitude) <= 180,
                    )
                    .slice(0, 500)
                    .map((camera) => ({
                        latitude: camera.latitude,
                        longitude: camera.longitude,
                        direction: label(camera.direction),
                    })),
                changes: (Array.isArray(feeds[area.id]?.changes?.data)
                    ? feeds[area.id].changes.data
                    : []
                )
                    .filter((change) => identifier(change?.id))
                    .slice(0, 100)
                    .map((change) => ({
                        id: change.id,
                        kind: ['added', 'removed'].includes(change.kind)
                            ? change.kind
                            : 'updated',
                        street: label(change.street),
                        nodeId: identifier(change.node_id),
                        latitude:
                            Number.isFinite(change.latitude) &&
                            Math.abs(change.latitude) <= 90
                                ? change.latitude
                                : null,
                        longitude:
                            Number.isFinite(change.longitude) &&
                            Math.abs(change.longitude) <= 180
                                ? change.longitude
                                : null,
                        operator: label(change.operator),
                        direction: label(change.direction),
                        changedAt: Number.isFinite(
                            Date.parse(change.changed_at),
                        )
                            ? Date.parse(change.changed_at)
                            : null,
                    })),
            })),
    };
    while (utf8Length(JSON.stringify(snapshot)) > MAX_SNAPSHOT_BYTES) {
        const field = snapshot.areas.some((area) => area.mappedCameras.length)
            ? 'mappedCameras'
            : 'changes';
        const populated = snapshot.areas.filter((area) => area[field].length);
        if (!populated.length) break;
        for (const area of populated) {
            area[field] = area[field].slice(
                0,
                Math.floor(area[field].length * 0.7),
            );
        }
    }
    return snapshot;
}
