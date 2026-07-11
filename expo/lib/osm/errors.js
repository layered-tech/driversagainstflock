export const OSM_ERROR_CODES = {
    badRequest: 'bad-request',
    conflict: 'conflict',
    forbidden: 'forbidden',
    network: 'network',
    rateLimited: 'rate-limited',
    server: 'server',
    timeout: 'timeout',
    tooLarge: 'too-large',
    unauthorized: 'unauthorized',
};

const OSM_ERROR_MESSAGES = {
    [OSM_ERROR_CODES.badRequest]:
        'OpenStreetMap rejected the edit — check the details and try again.',
    [OSM_ERROR_CODES.conflict]:
        'The changeset was closed before the upload finished — try publishing again.',
    [OSM_ERROR_CODES.forbidden]:
        'Your OpenStreetMap account is not allowed to edit the map — sign in again and allow map editing.',
    [OSM_ERROR_CODES.network]:
        'No connection to OpenStreetMap — check your network.',
    [OSM_ERROR_CODES.rateLimited]:
        'OpenStreetMap is rate limiting edits — try again in a few minutes.',
    [OSM_ERROR_CODES.server]:
        'OpenStreetMap had a problem processing the edit — try again shortly.',
    [OSM_ERROR_CODES.timeout]: 'OpenStreetMap did not respond — try again.',
    [OSM_ERROR_CODES.tooLarge]:
        'This edit covers too large an area — publish fewer cameras at once.',
    [OSM_ERROR_CODES.unauthorized]:
        'Your OpenStreetMap session expired — sign in again.',
};

const OSM_STATUS_ERROR_CODES = {
    400: OSM_ERROR_CODES.badRequest,
    401: OSM_ERROR_CODES.unauthorized,
    403: OSM_ERROR_CODES.forbidden,
    409: OSM_ERROR_CODES.conflict,
    413: OSM_ERROR_CODES.tooLarge,
    429: OSM_ERROR_CODES.rateLimited,
};

export class OSMApiError extends Error {
    constructor({ code, detail = '', status = null }) {
        super(OSM_ERROR_MESSAGES[code] ?? OSM_ERROR_MESSAGES.server);

        this.code = code;
        this.detail = detail;
        this.name = 'OSMApiError';
        this.status = status;
    }
}

export async function throwOSMResponseError(response) {
    const detail = await response.text().catch(() => '');
    const code =
        OSM_STATUS_ERROR_CODES[response.status] ?? OSM_ERROR_CODES.server;

    throw new OSMApiError({ code, detail, status: response.status });
}
