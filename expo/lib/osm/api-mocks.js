import { APP_ENVIRONMENT } from '../auth/constants';

const E2E_OSM_API_MOCKS_ENV = process.env.EXPO_PUBLIC_E2E_MAP_API_MOCKS === '1';

const MOCK_CHANGESET_ID_START = 171224908;
const MOCK_NODE_ID_START = 12100881;

let runtimeOSMApiMocksEnabled = false;
let mockChangesetCount = 0;

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
