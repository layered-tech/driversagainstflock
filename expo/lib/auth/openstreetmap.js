import {
    AUTH_CALLBACK_URL,
    OPENSTREETMAP_AUTHORIZATION_URL,
    OPENSTREETMAP_TOKEN_URL,
    OPENSTREETMAP_USERINFO_URL,
} from './constants';
import { fetchWithTimeout, readJSONResponse } from './http';

const OPENSTREETMAP_IDENTITY_SCOPES = ['openid'];

function getOpenStreetMapClientID() {
    return process.env.EXPO_PUBLIC_OPENSTREETMAP_CLIENT_ID?.trim() ?? '';
}

function getConfiguredOpenStreetMapClientID() {
    const clientID = getOpenStreetMapClientID();

    if (!clientID) {
        throw new Error('OpenStreetMap login is not configured.');
    }

    return clientID;
}

function normalizeOpenStreetMapUser(userInfo) {
    const id = userInfo?.sub ? String(userInfo.sub) : null;
    const name =
        userInfo?.preferred_username ||
        userInfo?.display_name ||
        userInfo?.name ||
        userInfo?.email ||
        null;

    if (!id || !name) {
        throw new Error('OpenStreetMap did not return account details.');
    }

    return {
        email: userInfo?.email ?? null,
        id,
        name,
        openStreetMapId: id,
        provider: 'openstreetmap',
    };
}

export function buildOpenStreetMapAuthorizationURL({
    codeChallenge,
    codeChallengeMethod,
    state,
}) {
    const params = new URLSearchParams({
        client_id: getConfiguredOpenStreetMapClientID(),
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        redirect_uri: AUTH_CALLBACK_URL,
        response_type: 'code',
        scope: OPENSTREETMAP_IDENTITY_SCOPES.join(' '),
        state,
    });

    return `${OPENSTREETMAP_AUTHORIZATION_URL}?${params.toString()}`;
}

export async function exchangeOpenStreetMapAuthorizationCode({
    code,
    codeVerifier,
}) {
    const body = new URLSearchParams({
        client_id: getConfiguredOpenStreetMapClientID(),
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: AUTH_CALLBACK_URL,
    });
    const response = await fetchWithTimeout(OPENSTREETMAP_TOKEN_URL, {
        body: body.toString(),
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
    });
    const data = await readJSONResponse(response);

    if (!data.access_token) {
        throw new Error('OpenStreetMap did not return an access token.');
    }

    return data;
}

export async function fetchOpenStreetMapUser(accessToken) {
    const response = await fetchWithTimeout(OPENSTREETMAP_USERINFO_URL, {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
        },
    });
    const userInfo = await readJSONResponse(response);

    return {
        rawUserInfo: userInfo,
        user: normalizeOpenStreetMapUser(userInfo),
    };
}
