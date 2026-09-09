export function filterQuery(filters) {
    return Object.fromEntries(
        Object.entries(filters).filter(
            ([, value]) =>
                value !== '' &&
                value !== null &&
                value !== undefined &&
                value !== false &&
                (!Array.isArray(value) || value.length),
        ),
    );
}

export function changesetNodes(details) {
    return details?.versions?.data ?? [];
}

export const nodeChangeColors = Object.freeze({
    added: '#1FBF6B',
    edited: '#FFB02E',
    deleted: '#FF4D4F',
});

export function nodeChangeKind(node) {
    if (node.visible === false) return 'deleted';

    return Number(node.osm_version) === 1 ? 'added' : 'edited';
}

export function moderationNodeFeatures(nodes) {
    return nodes
        .filter((node) => node.longitude != null && node.latitude != null)
        .map((node) => ({
            type: 'Feature',
            properties: {
                change: nodeChangeKind(node),
                nodeId: node.node_id ?? node.id,
                recordId: node.id,
            },
            geometry: {
                type: 'Point',
                coordinates: [Number(node.longitude), Number(node.latitude)],
            },
        }));
}

export function moderationNodeRecordId(feature) {
    const recordId = Number(feature?.properties?.recordId);

    return Number.isFinite(recordId) ? recordId : null;
}

function nodePosition(version) {
    if (
        version.location_is_historical ||
        version.latitude == null ||
        version.longitude == null
    )
        return null;

    return [Number(version.latitude), Number(version.longitude)];
}

function formatPosition(position) {
    return position.map((coordinate) => coordinate.toFixed(5)).join(', ');
}

function distanceMeters(from, to) {
    const radians = (degrees) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(to[0] - from[0]);
    const longitudeDelta = radians(to[1] - from[1]);
    const startLatitude = radians(from[0]);
    const endLatitude = radians(to[0]);
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(startLatitude) *
            Math.cos(endLatitude) *
            Math.sin(longitudeDelta / 2) ** 2;

    return (
        6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
}

function tagValue(value) {
    return typeof value === 'string' ? value : JSON.stringify(value);
}

export function nodeVersionHistory(versions) {
    const chronological = [...versions].sort(
        (left, right) => Number(left.osm_version) - Number(right.osm_version),
    );
    let previous = null;

    return chronological
        .map((version) => {
            const changes = [];
            const tags = version.tags || {};
            const previousTags = previous?.tags || {};
            const position = nodePosition(version);
            const previousPosition = previous ? nodePosition(previous) : null;

            if (!previous) {
                for (const [key, value] of Object.entries(tags))
                    changes.push({
                        sign: '+',
                        key,
                        value: tagValue(value),
                        tone: 'added',
                    });
                if (position)
                    changes.push({
                        sign: '+',
                        key: 'position',
                        value: formatPosition(position),
                        tone: 'added',
                    });
            } else {
                const keys = new Set([
                    ...Object.keys(previousTags),
                    ...Object.keys(tags),
                ]);
                for (const key of keys) {
                    if (!(key in previousTags))
                        changes.push({
                            sign: '+',
                            key,
                            value: tagValue(tags[key]),
                            tone: 'added',
                        });
                    else if (!(key in tags))
                        changes.push({
                            sign: '−',
                            key,
                            value: tagValue(previousTags[key]),
                            tone: 'deleted',
                        });
                    else if (
                        tagValue(previousTags[key]) !== tagValue(tags[key])
                    )
                        changes.push({
                            sign: '~',
                            key,
                            value:
                                tagValue(previousTags[key]) +
                                ' → ' +
                                tagValue(tags[key]),
                            tone: 'edited',
                        });
                }
            }

            const movementMeters =
                previousPosition && position
                    ? distanceMeters(previousPosition, position)
                    : 0;
            if (previousPosition && position && movementMeters >= 0.5)
                changes.push({
                    sign: '~',
                    key: 'position',
                    value:
                        formatPosition(previousPosition) +
                        ' → ' +
                        formatPosition(position) +
                        ' (' +
                        Math.round(movementMeters) +
                        ' m)',
                    tone: 'edited',
                });
            else if (previousPosition && version.visible === false)
                changes.push({
                    sign: '−',
                    key: 'position',
                    value: formatPosition(previousPosition),
                    tone: 'deleted',
                });

            const item = {
                ...version,
                kind:
                    version.visible === false
                        ? 'Deleted'
                        : !previous
                          ? 'Created'
                          : movementMeters >= 0.5
                            ? 'Moved'
                            : 'Retagged',
                changes,
                movement_meters: movementMeters,
                tag_edits: changes.filter((change) => change.key !== 'position')
                    .length,
            };
            previous = version;

            return item;
        })
        .reverse();
}

export function nodeProfileSummary(versions, flags = []) {
    const history = nodeVersionHistory(versions);
    const chronological = [...history].reverse();
    const latest = chronological[chronological.length - 1] || null;
    const latestVisible = [...chronological]
        .reverse()
        .find((version) => version.visible !== false);
    const editorMap = new Map();

    for (const version of chronological) {
        const key = version.osm_uid ?? version.osm_user ?? 'unknown';
        const editor = editorMap.get(key) || {
            osm_uid: version.osm_uid,
            name: version.osm_user || version.osm_uid || 'Unknown editor',
            versions: 0,
            last_version: 0,
            last_active: null,
        };
        editor.versions += 1;
        editor.last_version = Math.max(
            editor.last_version,
            Number(version.osm_version),
        );
        editor.last_active = version.osm_updated_at;
        editorMap.set(key, editor);
    }

    return {
        history,
        editors: [...editorMap.values()].sort(
            (left, right) => right.last_version - left.last_version,
        ),
        current_tags:
            latest?.visible === false
                ? latestVisible?.tags || {}
                : latest?.tags || {},
        first_mapped_at: chronological[0]?.osm_updated_at || null,
        latest,
        tag_edits: history
            .filter((version) => version.kind !== 'Created')
            .reduce((total, version) => total + version.tag_edits, 0),
        moves: history.filter((version) => version.movement_meters >= 0.5)
            .length,
        movement_meters: history.reduce(
            (total, version) => total + version.movement_meters,
            0,
        ),
        open_flags: flags.filter(
            (flag) => flag.status === 'open' && flag.rule?.enabled !== false,
        ).length,
    };
}

export function boundsGeometry(text) {
    const values = text
        .trim()
        .split(/[\s,→]+/)
        .filter(Boolean)
        .map(Number);
    if (values.length !== 4 || values.some((value) => !Number.isFinite(value)))
        throw new Error('Enter four coordinates: south, west, north, east.');
    const [south, west, north, east] = values;
    if (
        south >= north ||
        west >= east ||
        south < -90 ||
        north > 90 ||
        west < -180 ||
        east > 180
    )
        throw new Error(
            'Use valid bounds with south below north and west below east.',
        );
    return {
        type: 'Polygon',
        coordinates: [
            [
                [west, south],
                [east, south],
                [east, north],
                [west, north],
                [west, south],
            ],
        ],
    };
}
export function drawnGeometry(points) {
    if (points.length < 3)
        throw new Error('Add at least three points to draw a boundary.');
    return { type: 'Polygon', coordinates: [[...points, points[0]]] };
}
export function absoluteTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? '—'
        : new Intl.DateTimeFormat('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'UTC',
              timeZoneName: 'short',
          }).format(date);
}
export function locationLabel(row) {
    if (row.tags?.['addr:city']) return row.tags['addr:city'];
    if (row.latitude != null && row.longitude != null)
        return `${Number(row.latitude).toFixed(4)}, ${Number(row.longitude).toFixed(4)}`;
    if (row.bounds?.length === 4 && row.bounds.every((value) => value != null))
        return `${((row.bounds[1] + row.bounds[3]) / 2).toFixed(3)}, ${((row.bounds[0] + row.bounds[2]) / 2).toFixed(3)}`;
    return 'Location unavailable';
}

export function relativeTime(value, now = Date.now()) {
    if (!value) return '—';
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return '—';
    const elapsed = Math.max(0, now - timestamp);
    if (elapsed < 60_000) return 'now';
    if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
    if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
    return `${Math.floor(elapsed / 86_400_000)}d ago`;
}
