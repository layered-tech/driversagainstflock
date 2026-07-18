import { APP_ENVIRONMENT } from '../auth/constants';
import { OSM_ERROR_CODES, OSMApiError } from './errors';

const E2E_OSM_API_MOCKS_ENV = process.env.EXPO_PUBLIC_E2E_MAP_API_MOCKS === '1';

const MOCK_CHANGESET_ID_START = 171224908;
const MOCK_NODE_ID_START = 12100881;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const MOCK_CREATED_BY = 'DriversAgainstFlock.org (ios:2.6.0)';
const MOCK_CURRENT_USER = { uid: 21937416, user: 'daf_mapper' };
const MOCK_OTHER_USER = { uid: 8834271, user: 'osm_sf' };

const MOCK_ALPR_TAGS = {
    'camera:type': 'fixed',
    man_made: 'surveillance',
    manufacturer: 'Flock Safety',
    'manufacturer:wikidata': 'Q108485435',
    surveillance: 'public',
    'surveillance:type': 'ALPR',
    'surveillance:zone': 'traffic',
};

const MOCK_USER_CHANGESET_FIXTURES = [
    {
        changesCount: 2,
        comment: 'Added 2 ALPR cameras',
        createdAgoMs: 2 * MINUTE_MS,
        id: MOCK_CHANGESET_ID_START,
    },
    {
        changesCount: 1,
        comment: 'Added 1 ALPR camera',
        createdAgoMs: 21 * DAY_MS,
        id: 170981554,
    },
    {
        changesCount: 3,
        comment: 'Added 3 ALPR cameras',
        createdAgoMs: 42 * DAY_MS,
        id: 169704312,
    },
];

const MOCK_NODE_FIXTURES = [
    {
        changesetId: MOCK_CHANGESET_ID_START,
        id: MOCK_NODE_ID_START,
        latitude: 37.7832121,
        longitude: -122.4074189,
        tags: { ...MOCK_ALPR_TAGS, 'camera:mount': 'pole', direction: '45' },
    },
    {
        changesetId: MOCK_CHANGESET_ID_START,
        id: MOCK_NODE_ID_START + 1,
        latitude: 37.7838342,
        longitude: -122.4066227,
        tags: { ...MOCK_ALPR_TAGS, 'camera:mount': 'pole', direction: '225' },
    },
    {
        changesetId: 170981554,
        currentState: {
            editedAgoMs: 10 * DAY_MS,
            tags: {
                ...MOCK_ALPR_TAGS,
                'camera:mount': 'traffic_signals',
                direction: '90;270',
            },
            uid: MOCK_OTHER_USER.uid,
            user: MOCK_OTHER_USER.user,
            version: 3,
        },
        id: 11640217,
        latitude: 37.7683427,
        longitude: -122.4310952,
        tags: { ...MOCK_ALPR_TAGS, direction: '90' },
    },
    {
        changesetId: 169704312,
        id: 11538221,
        latitude: 37.7599312,
        longitude: -122.4148106,
        tags: { ...MOCK_ALPR_TAGS, 'camera:mount': 'pole', direction: '0' },
    },
    {
        changesetId: 169704312,
        id: 11538222,
        latitude: 37.7565214,
        longitude: -122.4184618,
        tags: {
            ...MOCK_ALPR_TAGS,
            'camera:mount': 'traffic_signals',
            direction: '135',
        },
    },
    {
        changesetId: 169704312,
        id: 11538223,
        latitude: 37.7521448,
        longitude: -122.4207332,
        tags: { ...MOCK_ALPR_TAGS, 'camera:mount': 'pole', direction: '315' },
    },
];

let runtimeOSMApiMocksEnabled = false;
let mockChangesetCount = 0;

const deletedMockNodeIds = new Set();
const modifiedMockNodeStates = new Map();

function appCanUseOSMApiMocks() {
    return APP_ENVIRONMENT === 'e2e' || APP_ENVIRONMENT === 'development';
}

export function osmApiMocksCanBeEnabled() {
    return appCanUseOSMApiMocks();
}

export function osmApiMocksAreEnabled() {
    return (
        appCanUseOSMApiMocks() &&
        (E2E_OSM_API_MOCKS_ENV || runtimeOSMApiMocksEnabled)
    );
}

export function setOSMApiMocksEnabled(enabled) {
    if (appCanUseOSMApiMocks()) {
        runtimeOSMApiMocksEnabled = Boolean(enabled);
    }
}

function throwIfAborted(signal) {
    if (!signal?.aborted) {
        return;
    }

    const error = new Error('Request aborted.');
    error.name = 'AbortError';
    throw error;
}

export async function createMockChangeset({ signal } = {}) {
    throwIfAborted(signal);

    const changesetId = MOCK_CHANGESET_ID_START + mockChangesetCount;

    mockChangesetCount += 1;

    return changesetId;
}

export async function uploadMockCreatedNodes({ nodes, signal } = {}) {
    throwIfAborted(signal);

    return (nodes ?? []).map((node, index) => ({
        newId: MOCK_NODE_ID_START + index,
        newVersion: 1,
        oldId: -(index + 1),
    }));
}

export async function closeMockChangeset({ signal } = {}) {
    throwIfAborted(signal);
}

export async function fetchMockOSMPermissions({ signal } = {}) {
    throwIfAborted(signal);

    return ['allow_write_api'];
}

function findMockNodeFixture(nodeId) {
    return (
        MOCK_NODE_FIXTURES.find((fixture) => fixture.id === Number(nodeId)) ??
        null
    );
}

function getMockChangesetCreatedAgoMs(changesetId) {
    return (
        MOCK_USER_CHANGESET_FIXTURES.find(
            (fixture) => fixture.id === changesetId,
        )?.createdAgoMs ?? 0
    );
}

function buildMockCurrentNode(nodeId) {
    const fixture = findMockNodeFixture(nodeId);

    if (!fixture) {
        return null;
    }

    const currentState =
        modifiedMockNodeStates.get(fixture.id) ?? fixture.currentState ?? null;
    const editedAgoMs =
        currentState?.editedAgoMs ??
        getMockChangesetCreatedAgoMs(fixture.changesetId);
    const node = {
        id: fixture.id,
        latitude: currentState?.latitude ?? fixture.latitude,
        longitude: currentState?.longitude ?? fixture.longitude,
        tags: { ...(currentState?.tags ?? fixture.tags) },
        timestamp: new Date(Date.now() - editedAgoMs).toISOString(),
        uid: currentState?.uid ?? MOCK_CURRENT_USER.uid,
        user: currentState?.user ?? MOCK_CURRENT_USER.user,
        version: currentState?.version ?? 1,
        visible: true,
    };

    if (deletedMockNodeIds.has(fixture.id)) {
        return {
            ...node,
            latitude: null,
            longitude: null,
            tags: {},
            timestamp: new Date().toISOString(),
            uid: MOCK_CURRENT_USER.uid,
            user: MOCK_CURRENT_USER.user,
            version: node.version + 1,
            visible: false,
        };
    }

    return node;
}

export async function fetchMockUserChangesets({ limit = 10, signal } = {}) {
    throwIfAborted(signal);

    const now = Date.now();

    return MOCK_USER_CHANGESET_FIXTURES.slice(0, limit).map((fixture) => {
        const createdAtMs = now - fixture.createdAgoMs;

        return {
            changesCount: fixture.changesCount,
            closedAt: new Date(createdAtMs + 5000).toISOString(),
            createdAt: new Date(createdAtMs).toISOString(),
            id: fixture.id,
            open: false,
            tags: {
                comment: fixture.comment,
                created_by: MOCK_CREATED_BY,
            },
        };
    });
}

export async function fetchMockChangesetNodes({ changesetId, signal } = {}) {
    throwIfAborted(signal);

    const created = MOCK_NODE_FIXTURES.filter(
        (fixture) => fixture.changesetId === Number(changesetId),
    ).map((fixture) => ({
        id: fixture.id,
        latitude: fixture.latitude,
        longitude: fixture.longitude,
        tags: { ...fixture.tags },
        version: 1,
    }));

    return { created, deleted: [], modified: [] };
}

export async function fetchMockNodesByIds({ nodeIds, signal } = {}) {
    throwIfAborted(signal);

    return (nodeIds ?? [])
        .map((nodeId) => buildMockCurrentNode(nodeId))
        .filter(Boolean);
}

export async function fetchMockNode({ nodeId, signal } = {}) {
    throwIfAborted(signal);

    if (deletedMockNodeIds.has(Number(nodeId))) {
        throw new OSMApiError({ code: OSM_ERROR_CODES.gone, status: 410 });
    }

    const node = buildMockCurrentNode(nodeId);

    if (!node) {
        throw new OSMApiError({
            code: OSM_ERROR_CODES.server,
            detail: `Mock node ${nodeId} does not exist.`,
            status: 404,
        });
    }

    return node;
}

export async function uploadMockModifiedNode({ node, signal } = {}) {
    throwIfAborted(signal);

    const nodeId = Number(node?.id);
    const newVersion = (Number(node?.version) || 0) + 1;

    modifiedMockNodeStates.set(nodeId, {
        editedAgoMs: 0,
        latitude: node?.latitude ?? null,
        longitude: node?.longitude ?? null,
        tags: { ...(node?.tags ?? {}) },
        uid: MOCK_CURRENT_USER.uid,
        user: MOCK_CURRENT_USER.user,
        version: newVersion,
    });

    return [{ newId: nodeId, newVersion, oldId: nodeId }];
}

export async function uploadMockDeletedNode({ node, signal } = {}) {
    throwIfAborted(signal);

    const nodeId = Number(node?.id);

    deletedMockNodeIds.add(nodeId);

    return [{ newId: null, newVersion: null, oldId: nodeId }];
}
