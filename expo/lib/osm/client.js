import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { fetchWithTimeout } from '../auth/http';
import { addSentryBreadcrumb } from '../sentry';
import {
    closeMockChangeset,
    createMockChangeset,
    fetchMockOSMPermissions,
    osmApiMocksAreEnabled,
    uploadMockCreatedNodes,
} from './api-mocks';
import { getOSMApiBaseURL } from './config';
import { OSM_ERROR_CODES, OSMApiError, throwOSMResponseError } from './errors';
import {
    buildChangesetCreateXML,
    buildOsmChangeCreateXML,
    parseChangesetCreateResponse,
    parseDiffResult,
} from './xml';

const OSM_CREATED_BY = `DriversAgainstFlock.org (${Platform.OS}:${Constants.expoConfig?.version ?? 'unknown'})`;
const OSM_UPLOAD_TIMEOUT_MS = 30000;
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

    let closeFailed = false;

    try {
        await closeChangeset({ accessToken, changesetId });
    } catch (error) {
        closeFailed = true;

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
    }

    return {
        changesetId,
        closeFailed,
        nodes: diffNodes,
    };
}
