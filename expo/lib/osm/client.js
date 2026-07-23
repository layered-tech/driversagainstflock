import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { fetchWithTimeout, readJSONResponse } from '../auth/http';
import { buildApiURL } from '../auth/urls';
import { addSentryBreadcrumb } from '../sentry';
import {
    closeMockChangeset,
    createMockChangeset,
    fetchMockChangesetNodes,
    fetchMockNode,
    fetchMockNodesByIds,
    fetchMockOSMPermissions,
    fetchMockUserChangesets,
    osmApiMocksAreEnabled,
    uploadMockCreatedNodes,
    uploadMockDeletedNode,
    uploadMockModifiedNode,
} from './api-mocks';
import { getOSMApiBaseURL } from './config';
import { OSM_ERROR_CODES, OSMApiError, throwOSMResponseError } from './errors';
import { normalizeOsmJsonChangeset, normalizeOsmJsonNode } from './normalizers';
import {
    buildChangesetCreateXML,
    buildOsmChangeCreateXML,
    buildOsmChangeDeleteXML,
    buildOsmChangeModifyXML,
    parseChangesetCreateResponse,
    parseDiffResult,
    parseOsmChangeXML,
} from './xml';

const OSM_CREATED_BY = `DriversAgainstFlock.org (${Platform.OS}:${Constants.expoConfig?.version ?? 'unknown'})`;
const OSM_UPLOAD_TIMEOUT_MS = 30000;
const BACKEND_SYNC_TIMEOUT_MS = 15000;
const OSM_XML_CONTENT_TYPE = 'text/xml; charset=utf-8';
const AUTH_TIMEOUT_ERROR_MESSAGE =
    'The server did not respond. Please try again.';

function toOSMRequestError(error) {
    if (error instanceof OSMApiError) {
        return error;
    }

    if (
        error?.name === 'AbortError' ||
        error?.message === AUTH_TIMEOUT_ERROR_MESSAGE
    ) {
        return new OSMApiError({
            code: OSM_ERROR_CODES.timeout,
            detail: error?.message ?? '',
        });
    }

    if (error instanceof TypeError) {
        return new OSMApiError({
            code: OSM_ERROR_CODES.network,
            detail: error?.message ?? '',
        });
    }

    return error;
}

async function fetchOSM(url, options) {
    let response;

    try {
        response = await fetchWithTimeout(url, options);
    } catch (error) {
        throw toOSMRequestError(error);
    }

    if (!response.ok) {
        await throwOSMResponseError(response);
    }

    return response;
}

function normalizeNodeForUpload(node) {
    return {
        latitude: node?.latitude ?? node?.lat,
        longitude: node?.longitude ?? node?.lon,
        tags: node?.tags ?? {},
    };
}

export async function createChangeset({ accessToken, signal, tags }) {
    if (osmApiMocksAreEnabled()) {
        return createMockChangeset({ signal });
    }

    const response = await fetchOSM(`${getOSMApiBaseURL()}/changeset/create`, {
        body: buildChangesetCreateXML({
            ...tags,
            created_by: OSM_CREATED_BY,
        }),
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': OSM_XML_CONTENT_TYPE,
        },
        method: 'PUT',
        signal,
    });

    return parseChangesetCreateResponse(await response.text());
}

export async function uploadCreatedNodes({
    accessToken,
    changesetId,
    nodes,
    signal,
}) {
    if (osmApiMocksAreEnabled()) {
        return uploadMockCreatedNodes({ nodes, signal });
    }

    const response = await fetchOSM(
        `${getOSMApiBaseURL()}/changeset/${changesetId}/upload`,
        {
            body: buildOsmChangeCreateXML({
                changesetId,
                generator: OSM_CREATED_BY,
                nodes: (nodes ?? []).map(normalizeNodeForUpload),
            }),
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': OSM_XML_CONTENT_TYPE,
            },
            method: 'POST',
            signal,
            timeoutMs: OSM_UPLOAD_TIMEOUT_MS,
        },
    );

    return parseDiffResult(await response.text());
}

export async function syncPublishedNodesToBackend({
    changesetId,
    nodes,
    signal,
}) {
    if (
        osmApiMocksAreEnabled() ||
        !Array.isArray(nodes) ||
        nodes.length === 0
    ) {
        return { points: [] };
    }

    const response = await fetchWithTimeout(
        buildApiURL('v1/osm/published-nodes'),
        {
            body: JSON.stringify({
                changeset_id: changesetId,
                nodes,
            }),
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            method: 'POST',
            signal,
            timeoutMs: BACKEND_SYNC_TIMEOUT_MS,
        },
    );
    const data = await readJSONResponse(response);

    return data?.result ?? { points: [] };
}

async function uploadModifiedNode({ accessToken, changesetId, node, signal }) {
    if (osmApiMocksAreEnabled()) {
        return uploadMockModifiedNode({ node, signal });
    }

    const response = await fetchOSM(
        `${getOSMApiBaseURL()}/changeset/${changesetId}/upload`,
        {
            body: buildOsmChangeModifyXML({
                changesetId,
                generator: OSM_CREATED_BY,
                node,
            }),
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': OSM_XML_CONTENT_TYPE,
            },
            method: 'POST',
            signal,
            timeoutMs: OSM_UPLOAD_TIMEOUT_MS,
        },
    );

    return parseDiffResult(await response.text());
}

async function uploadDeletedNode({ accessToken, changesetId, node, signal }) {
    if (osmApiMocksAreEnabled()) {
        return uploadMockDeletedNode({ node, signal });
    }

    const response = await fetchOSM(
        `${getOSMApiBaseURL()}/changeset/${changesetId}/upload`,
        {
            body: buildOsmChangeDeleteXML({
                changesetId,
                generator: OSM_CREATED_BY,
                node,
            }),
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': OSM_XML_CONTENT_TYPE,
            },
            method: 'POST',
            signal,
            timeoutMs: OSM_UPLOAD_TIMEOUT_MS,
        },
    );

    return parseDiffResult(await response.text());
}

export async function closeChangeset({ accessToken, changesetId, signal }) {
    if (osmApiMocksAreEnabled()) {
        return closeMockChangeset({ signal });
    }

    await fetchOSM(`${getOSMApiBaseURL()}/changeset/${changesetId}/close`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
        method: 'PUT',
        signal,
    });
}

async function closeChangesetIgnoringFailure({ accessToken, changesetId }) {
    try {
        await closeChangeset({ accessToken, changesetId });

        return false;
    } catch (error) {
        addSentryBreadcrumb({
            category: 'osm.publish',
            data: {
                changesetId,
                errorCode: error?.code,
                errorMessage: error?.message,
            },
            level: 'warning',
            message: 'Changeset close failed',
        });

        return true;
    }
}

export async function fetchOSMPermissions({ accessToken, signal }) {
    if (osmApiMocksAreEnabled()) {
        return fetchMockOSMPermissions({ signal });
    }

    const response = await fetchOSM(`${getOSMApiBaseURL()}/permissions.json`, {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
        },
        signal,
    });
    const data = await response.json().catch(() => ({}));

    return data?.permissions ?? [];
}

export async function fetchUserChangesets({
    accessToken,
    limit = 10,
    signal,
    uid,
}) {
    if (osmApiMocksAreEnabled()) {
        return fetchMockUserChangesets({ limit, signal });
    }

    const headers = { Accept: 'application/json' };

    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetchOSM(
        `${getOSMApiBaseURL()}/changesets.json?user=${uid}&limit=${limit}`,
        { headers, signal },
    );
    const data = await response.json().catch(() => ({}));

    return (data?.changesets ?? []).map(normalizeOsmJsonChangeset);
}

export async function fetchChangesetNodes({ changesetId, signal }) {
    if (osmApiMocksAreEnabled()) {
        return fetchMockChangesetNodes({ changesetId, signal });
    }

    const response = await fetchOSM(
        `${getOSMApiBaseURL()}/changeset/${changesetId}/download`,
        { signal },
    );

    return parseOsmChangeXML(await response.text());
}

export async function fetchNodesByIds({ nodeIds, signal }) {
    if ((nodeIds ?? []).length === 0) {
        return [];
    }

    if (osmApiMocksAreEnabled()) {
        return fetchMockNodesByIds({ nodeIds, signal });
    }

    const response = await fetchOSM(
        `${getOSMApiBaseURL()}/nodes.json?nodes=${nodeIds.join(',')}`,
        {
            headers: {
                Accept: 'application/json',
            },
            signal,
        },
    );
    const data = await response.json().catch(() => ({}));

    return (data?.elements ?? [])
        .filter((element) => element?.type === 'node')
        .map(normalizeOsmJsonNode);
}

export async function fetchNode({ nodeId, signal }) {
    if (osmApiMocksAreEnabled()) {
        return fetchMockNode({ nodeId, signal });
    }

    const response = await fetchOSM(
        `${getOSMApiBaseURL()}/node/${nodeId}.json`,
        {
            headers: {
                Accept: 'application/json',
            },
            signal,
        },
    );
    const data = await response.json().catch(() => ({}));

    return normalizeOsmJsonNode(data?.elements?.[0]);
}

export async function publishNodes({
    accessToken,
    changesetTags,
    nodes,
    onProgress,
}) {
    onProgress?.('creating-changeset');

    const changesetId = await createChangeset({
        accessToken,
        tags: changesetTags,
    });

    onProgress?.('uploading');

    const diffNodes = await uploadCreatedNodes({
        accessToken,
        changesetId,
        nodes,
    });

    onProgress?.('closing');

    const closeFailed = await closeChangesetIgnoringFailure({
        accessToken,
        changesetId,
    });

    return {
        changesetId,
        closeFailed,
        nodes: diffNodes,
    };
}

export async function publishNodeUpdate({
    accessToken,
    changesetTags,
    node,
    onProgress,
}) {
    onProgress?.('creating-changeset');

    const changesetId = await createChangeset({
        accessToken,
        tags: changesetTags,
    });

    onProgress?.('uploading');

    const diffNodes = await uploadModifiedNode({
        accessToken,
        changesetId,
        node,
    });

    onProgress?.('closing');

    const closeFailed = await closeChangesetIgnoringFailure({
        accessToken,
        changesetId,
    });

    return {
        changesetId,
        closeFailed,
        newVersion: diffNodes?.[0]?.newVersion ?? null,
    };
}

export async function publishNodeDeletion({
    accessToken,
    changesetTags,
    node,
    onProgress,
}) {
    onProgress?.('creating-changeset');

    const changesetId = await createChangeset({
        accessToken,
        tags: changesetTags,
    });

    onProgress?.('uploading');

    await uploadDeletedNode({
        accessToken,
        changesetId,
        node,
    });

    onProgress?.('closing');

    const closeFailed = await closeChangesetIgnoringFailure({
        accessToken,
        changesetId,
    });

    return {
        changesetId,
        closeFailed,
    };
}
