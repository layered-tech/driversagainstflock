const DEVELOPMENT_OSM_BASE_URL = 'https://api06.dev.openstreetmap.org';
const PRODUCTION_OSM_BASE_URL = 'https://www.openstreetmap.org';

export function resolveOSMBaseURL(configuredBaseURL, environment) {
    const trimmedBaseURL = configuredBaseURL?.trim();
    const baseURL =
        trimmedBaseURL ||
        (environment === 'production'
            ? PRODUCTION_OSM_BASE_URL
            : DEVELOPMENT_OSM_BASE_URL);

    let parsedURL;

    try {
        parsedURL = new URL(baseURL);
    } catch {
        throw new Error('OpenStreetMap base URL must be a valid HTTP URL.');
    }

    if (parsedURL.protocol !== 'http:' && parsedURL.protocol !== 'https:') {
        throw new Error('OpenStreetMap base URL must be a valid HTTP URL.');
    }

    return baseURL.replace(/\/+$/, '');
}
