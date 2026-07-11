/**
 * Pure view-model builders for the "Your edits" screen.
 *
 * Everything here is intentionally framework-free (no react / react-native /
 * expo imports) so the module can run under `node --test`. Time is always
 * injected via `now`; nothing in this file calls Date.now().
 */

const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * HOUR_IN_MS;
const NODE_COLOR_HUE_OFFSET = 12;

const SHORT_MONTH_LABELS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

function toEpochMs(value) {
    if (typeof value === 'number') {
        return value;
    }

    if (value instanceof Date) {
        return value.getTime();
    }

    if (typeof value === 'string' && value !== '') {
        return new Date(value).getTime();
    }

    return Number.NaN;
}

function hasTags(tags) {
    return Boolean(tags) && Object.keys(tags).length > 0;
}

function changesetTimestampMs(changeset) {
    return toEpochMs(changeset?.closedAt ?? changeset?.createdAt);
}

function pluralizeCount(count, singularLabel) {
    return `${count} ${singularLabel}${count === 1 ? '' : 's'}`;
}

function compareNodeIds(firstNodeId, secondNodeId) {
    const numericDifference = Number(firstNodeId) - Number(secondNodeId);

    if (Number.isFinite(numericDifference) && numericDifference !== 0) {
        return numericDifference;
    }

    return String(firstNodeId).localeCompare(String(secondNodeId));
}

/**
 * Gives every camera currently displayed on the screen a distinct marker
 * color. Colors are keyed by node id, so repeated appearances of a node in
 * separate changesets remain visually connected.
 */
function buildNodeMarkerColors(nodeIds) {
    const colorsByNodeId = new Map();
    const sortedNodeIds = [...nodeIds].sort(compareNodeIds);

    sortedNodeIds.forEach((nodeId, index) => {
        const hue = Math.round(
            (NODE_COLOR_HUE_OFFSET + (index * 360) / sortedNodeIds.length) %
                360,
        );

        colorsByNodeId.set(nodeId, {
            darkBackground: `hsla(${hue}, 76%, 58%, 0.2)`,
            fill: `hsl(${hue}, 76%, 48%)`,
            lightBackground: `hsla(${hue}, 76%, 48%, 0.14)`,
        });
    });

    return colorsByNodeId;
}

/**
 * Flattens a fetchChangesetNodes() result ({ created, modified, deleted })
 * into one node per id, preferring the highest version when a node appears
 * in several groups of the same changeset.
 */
function listChangesetNodes(nodeGroups) {
    if (!nodeGroups) {
        return [];
    }

    const nodesById = new Map();
    const allNodes = [
        ...(nodeGroups.created ?? []),
        ...(nodeGroups.modified ?? []),
        ...(nodeGroups.deleted ?? []),
    ];

    for (const node of allNodes) {
        if (node?.id == null) {
            continue;
        }

        const existingNode = nodesById.get(node.id);

        if (
            !existingNode ||
            (node.version ?? 0) >= (existingNode.version ?? 0)
        ) {
            nodesById.set(node.id, node);
        }
    }

    return [...nodesById.values()];
}

/**
 * A node counts as a surveillance camera when it is tagged as one, including
 * decommissioned (disused:) cameras.
 */
export function isSurveillanceTags(tags) {
    if (!tags || typeof tags !== 'object') {
        return false;
    }

    return (
        tags.man_made === 'surveillance' ||
        tags['disused:man_made'] === 'surveillance' ||
        Boolean(tags['surveillance:type'])
    );
}

/**
 * Comma-groups an integer id ("171224908" -> "171,224,908") independent of
 * the device locale so tests and UI always match the design.
 */
export function formatGroupedNumber(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return String(value);
    }

    const digits = String(Math.trunc(Math.abs(numericValue)));
    const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    return numericValue < 0 ? `-${grouped}` : grouped;
}

/**
 * "ALPR reader" / "Gantry camera" / "CCTV camera", suffixed with the
 * manufacturer tag when present. Gantry-mounted readers read as gantries.
 */
export function buildCameraTypeLabel(tags = {}) {
    const surveillanceType = String(
        tags['surveillance:type'] ?? '',
    ).toLowerCase();
    const isPlateReader =
        surveillanceType === 'alpr' || surveillanceType === 'anpr';
    let typeLabel = 'CCTV camera';

    if (tags['camera:mount'] === 'gantry') {
        typeLabel = 'Gantry camera';
    } else if (isPlateReader) {
        typeLabel = 'ALPR reader';
    }

    const manufacturer =
        typeof tags.manufacturer === 'string' ? tags.manufacturer.trim() : '';

    return manufacturer ? `${typeLabel} · ${manufacturer}` : typeLabel;
}

/**
 * "37.7749, -122.4194" from raw coordinates, or a friendly fallback when a
 * node (for example a deleted one) no longer carries a position.
 */
export function formatCoordinateLabel(latitude, longitude) {
    const numericLatitude = Number(latitude);
    const numericLongitude = Number(longitude);

    if (
        latitude == null ||
        longitude == null ||
        !Number.isFinite(numericLatitude) ||
        !Number.isFinite(numericLongitude)
    ) {
        return 'Location unavailable';
    }

    return `${numericLatitude.toFixed(4)}, ${numericLongitude.toFixed(4)}`;
}

/**
 * "Just now" under an hour, "3h ago" under a day, then a short "21 Jun"
 * date (with the year appended when it is not the current year).
 */
export function formatChangesetDateLabel(timestamp, now) {
    const timestampMs = toEpochMs(timestamp);
    const nowMs = toEpochMs(now);

    if (!Number.isFinite(timestampMs) || !Number.isFinite(nowMs)) {
        return 'Pending';
    }

    const ageMs = Math.max(0, nowMs - timestampMs);

    if (ageMs < HOUR_IN_MS) {
        return 'Just now';
    }

    if (ageMs < DAY_IN_MS) {
        return `${Math.floor(ageMs / HOUR_IN_MS)}h ago`;
    }

    const date = new Date(timestampMs);
    const nowDate = new Date(nowMs);
    const dayMonthLabel = `${date.getDate()} ${SHORT_MONTH_LABELS[date.getMonth()]}`;

    return date.getFullYear() === nowDate.getFullYear()
        ? dayMonthLabel
        : `${dayMonthLabel} ${date.getFullYear()}`;
}

/**
 * Node ids worth resolving to current state: everything the changesets tag
 * as surveillance, plus tagless entries (deletes often omit tags, so only
 * the current state can classify them).
 */
export function collectSurveillanceNodeIds({
    changesets = [],
    changesetNodesById = {},
} = {}) {
    const nodeIds = new Set();

    for (const changeset of changesets) {
        for (const node of listChangesetNodes(
            changesetNodesById?.[changeset.id],
        )) {
            if (isSurveillanceTags(node.tags) || !hasTags(node.tags)) {
                nodeIds.add(node.id);
            }
        }
    }

    return [...nodeIds];
}

/**
 * Builds the full "Your edits" view model.
 *
 * @param {object} input
 * @param {Array<{ id: number, changesCount: number, closedAt: string|null, createdAt: string, open: boolean, tags: object }>} input.changesets
 * @param {Record<string|number, { created: Array, modified: Array, deleted: Array }>} input.changesetNodesById keyed by changeset id
 * @param {Record<string|number, { id: number, latitude: number|null, longitude: number|null, tags: object, uid: number|null, user: string|null, version: number, visible: boolean }>} input.currentNodesById keyed by node id
 * @param {{ id: string, name: string }|null} input.currentUser
 * @param {number|string|Date} input.now
 */
export function buildYourEditsModel({
    changesets = [],
    changesetNodesById = {},
    currentNodesById = {},
    currentUser = null,
    now,
} = {}) {
    const nowMs = toEpochMs(now);
    const currentUserId = Number(currentUser?.id);
    const cameraNodeIds = new Set();
    const liveNodeIds = new Set();
    const sections = [];

    const orderedChangesets = [...changesets].sort((a, b) => {
        const aMs = changesetTimestampMs(a);
        const bMs = changesetTimestampMs(b);

        return (
            (Number.isFinite(bMs) ? bMs : Number.NEGATIVE_INFINITY) -
            (Number.isFinite(aMs) ? aMs : Number.NEGATIVE_INFINITY)
        );
    });

    for (const changeset of orderedChangesets) {
        const rows = [];

        for (const changesetNode of listChangesetNodes(
            changesetNodesById?.[changeset.id],
        )) {
            const currentNode = currentNodesById?.[changesetNode.id] ?? null;

            if (
                !isSurveillanceTags(changesetNode.tags) &&
                !isSurveillanceTags(currentNode?.tags)
            ) {
                continue;
            }

            const isRemoved = currentNode?.visible === false;
            const displayTags = hasTags(currentNode?.tags)
                ? currentNode.tags
                : (changesetNode.tags ?? {});
            const latitude = currentNode?.latitude ?? changesetNode.latitude;
            const longitude = currentNode?.longitude ?? changesetNode.longitude;
            const version = currentNode?.version ?? changesetNode.version ?? 1;
            const updatedByOther =
                !isRemoved &&
                currentNode?.uid != null &&
                Number.isFinite(currentUserId) &&
                currentNode.uid !== currentUserId;

            cameraNodeIds.add(changesetNode.id);

            if (!isRemoved) {
                liveNodeIds.add(changesetNode.id);
            }

            rows.push({
                id: changesetNode.id,
                isRemoved,
                refLabel: `node/${changesetNode.id} · v${version}`,
                subtitle: formatCoordinateLabel(latitude, longitude),
                typeLabel: buildCameraTypeLabel(displayTags),
                updatedByLabel:
                    updatedByOther && currentNode.user
                        ? `Updated by @${currentNode.user}`
                        : null,
            });
        }

        if (rows.length === 0) {
            continue;
        }

        const timestampMs = changesetTimestampMs(changeset);

        sections.push({
            id: changeset.id,
            idLabel: `changeset/${formatGroupedNumber(changeset.id)}`,
            isFresh:
                Number.isFinite(timestampMs) &&
                Number.isFinite(nowMs) &&
                nowMs - timestampMs < HOUR_IN_MS,
            isOpen: changeset.open === true,
            nodes: rows,
            title: `${formatChangesetDateLabel(timestampMs, nowMs)} · ${pluralizeCount(rows.length, 'camera')}`,
        });
    }

    const nodeMarkerColors = buildNodeMarkerColors(cameraNodeIds);

    for (const section of sections) {
        for (const node of section.nodes) {
            node.markerColor = nodeMarkerColors.get(node.id);
        }
    }

    return {
        cameraCount: cameraNodeIds.size,
        changesetCount: sections.length,
        countsLabel: `${pluralizeCount(cameraNodeIds.size, 'camera')} · ${pluralizeCount(sections.length, 'changeset')}`,
        liveCount: liveNodeIds.size,
        livePillLabel: `${liveNodeIds.size} live`,
        sections,
    };
}
