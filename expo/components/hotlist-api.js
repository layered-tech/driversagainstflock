import { addSentryBreadcrumb } from '../lib/sentry';
import { mapApiMocksAreEnabled } from './map/api-mocks';
import { buildApiURL } from './map/config';

const DEFAULT_HOTLIST_PAYLOAD = {
    filters: {
        direction: 'desc',
        manufacturer: 'all',
        query: '',
        sort: 'updated',
        window: '7',
    },
    latestSyncedAt: null,
    manufacturerCounts: {
        all: 0,
        flock: 0,
        other: 0,
    },
    nodes: {
        currentPage: 1,
        data: [],
        from: null,
        lastPage: 1,
        perPage: 25,
        to: null,
        total: 0,
    },
    stats: [],
};

const MOCK_HOTLIST_PAYLOAD = {
    filters: {
        direction: 'desc',
        manufacturer: 'all',
        query: '',
        sort: 'updated',
        window: '7',
    },
    latestSyncedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    manufacturerCounts: {
        all: 38,
        flock: 21,
        other: 17,
    },
    nodes: {
        currentPage: 1,
        data: [
            {
                id: 'mock-hotlist-1',
                operator: 'Flock Safety',
                osm: 'node/11820431',
                osmId: 11820431,
                street: '16th St & Mission St',
                type: 'alpr',
                typeLabel: 'ALPR reader',
                updatedAt: new Date(
                    Date.now() - 2 * 60 * 60 * 1000,
                ).toISOString(),
            },
            {
                id: 'mock-hotlist-2',
                operator: 'Flock Safety',
                osm: 'node/11819007',
                osmId: 11819007,
                street: 'Embarcadero & Market St',
                type: 'alpr',
                typeLabel: 'ALPR reader',
                updatedAt: new Date(
                    Date.now() - 5 * 60 * 60 * 1000,
                ).toISOString(),
            },
            {
                id: 'mock-hotlist-3',
                operator: 'Genetec',
                osm: 'node/11815320',
                osmId: 11815320,
                street: 'Geary Blvd & 19th Ave',
                type: 'alpr',
                typeLabel: 'ALPR reader',
                updatedAt: new Date(
                    Date.now() - 14 * 60 * 60 * 1000,
                ).toISOString(),
            },
        ],
        from: 1,
        lastPage: 2,
        perPage: 25,
        to: 25,
        total: 38,
    },
    stats: [
        {
            icon: 'plus',
            isUp: true,
            label: 'Added last 7 days',
            sub: '+11 vs last week',
            tone: 'up',
            value: '38',
        },
        {
            icon: 'camera',
            isUp: false,
            label: 'Flock readers',
            sub: '55% of added',
            tone: 'muted',
            value: '21',
        },
    ],
};

function normalizeHotlistNode(node, index) {
    return {
        city: typeof node?.city === 'string' ? node.city : '',
        contributor:
            typeof node?.contributor === 'string' ? node.contributor : 'OSM',
        id: node?.id ?? node?.osmId ?? `hotlist-node-${index}`,
        operator:
            typeof node?.operator === 'string' ? node.operator : 'Unknown',
        osm:
            typeof node?.osm === 'string'
                ? node.osm
                : `node/${node?.osmId ?? ''}`,
        osmId: node?.osmId ?? null,
        street:
            typeof node?.street === 'string'
                ? node.street
                : 'OpenStreetMap node',
        type: typeof node?.type === 'string' ? node.type : 'camera',
        typeLabel:
            typeof node?.typeLabel === 'string'
                ? node.typeLabel
                : 'Traffic camera',
        updatedAt: typeof node?.updatedAt === 'string' ? node.updatedAt : null,
    };
}

function normalizeHotlistPayload(data) {
    const nodes = data?.nodes ?? {};
    const manufacturerCounts = data?.manufacturerCounts ?? {};

    return {
        filters: {
            ...DEFAULT_HOTLIST_PAYLOAD.filters,
            ...(data?.filters ?? {}),
        },
        latestSyncedAt:
            typeof data?.latestSyncedAt === 'string'
                ? data.latestSyncedAt
                : null,
        manufacturerCounts: {
            all: Number(manufacturerCounts.all ?? 0),
            flock: Number(manufacturerCounts.flock ?? 0),
            other: Number(manufacturerCounts.other ?? 0),
        },
        nodes: {
            ...DEFAULT_HOTLIST_PAYLOAD.nodes,
            ...nodes,
            data: Array.isArray(nodes.data)
                ? nodes.data.map(normalizeHotlistNode)
                : [],
            total: Number(nodes.total ?? 0),
        },
        stats: Array.isArray(data?.stats) ? data.stats : [],
    };
}

async function readHotlistResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data?.message || 'Hotlist could not be loaded.');
    }

    return normalizeHotlistPayload(data);
}

export async function getHotlist({
    manufacturer = 'all',
    signal,
    timeWindow = '7',
} = {}) {
    addSentryBreadcrumb({
        category: 'hotlist',
        data: {
            manufacturer,
            window: timeWindow,
        },
        message: 'Mobile hotlist requested',
    });

    if (mapApiMocksAreEnabled()) {
        return normalizeHotlistPayload({
            ...MOCK_HOTLIST_PAYLOAD,
            filters: {
                ...MOCK_HOTLIST_PAYLOAD.filters,
                manufacturer,
                window: timeWindow,
            },
        });
    }

    const response = await fetch(
        buildApiURL('v1/hotlist', {
            direction: 'desc',
            manufacturer,
            sort: 'updated',
            window: timeWindow,
        }),
        {
            headers: {
                Accept: 'application/json',
            },
            signal,
        },
    );
    const payload = await readHotlistResponse(response);

    addSentryBreadcrumb({
        category: 'hotlist',
        data: {
            resultCount: payload.nodes.data.length,
            total: payload.nodes.total,
        },
        message: 'Mobile hotlist loaded',
    });

    return payload;
}
