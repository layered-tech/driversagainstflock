import Constants from 'expo-constants';

export const MAPBOX_ACCESS_TOKEN =
    process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';
export const MAPBOX_STANDARD_STYLE_URL = 'mapbox://styles/mapbox/standard';
export const MAPBOX_STANDARD_SATELLITE_STYLE_URL =
    'mapbox://styles/mapbox/standard-satellite';
export const MAPBOX_STANDARD_STYLE_IMPORT_ID = 'basemap';
export const MAPBOX_STANDARD_LIGHT_PRESET_AUTO = 'auto';
export const MAPBOX_STANDARD_LIGHT_PRESET_DAWN = 'dawn';
export const MAPBOX_STANDARD_LIGHT_PRESET_DAY = 'day';
export const MAPBOX_STANDARD_LIGHT_PRESET_DUSK = 'dusk';
export const MAPBOX_STANDARD_LIGHT_PRESET_NIGHT = 'night';
export const MAPBOX_TRAFFIC_SOURCE_URL = 'mapbox://mapbox.mapbox-traffic-v1';
export const MAPBOX_TRAFFIC_SOURCE_ID = 'mapbox-traffic';
export const MAPBOX_TRAFFIC_SOURCE_LAYER_ID = 'traffic';

export const APP_ENVIRONMENT =
    Constants.expoConfig?.extra?.environment ?? 'production';
const MAP_DEBUG_CONTROLS_ARE_HIDDEN = false;
export const SHOW_MAP_DEBUG_CONTROLS =
    !MAP_DEBUG_CONTROLS_ARE_HIDDEN &&
    (APP_ENVIRONMENT === 'development' || APP_ENVIRONMENT === 'staging');

export function getApiBaseURL() {
    const configuredBaseURL = process.env.EXPO_PUBLIC_API_BASE_URL;

    if (configuredBaseURL) {
        return configuredBaseURL.replace(/\/+$/, '');
    }

    if (APP_ENVIRONMENT === 'development') {
        return 'http://127.0.0.1:8000/api';
    }

    if (APP_ENVIRONMENT === 'staging') {
        return 'https://staging.driversagainstflock.com/api';
    }

    return 'https://driversagainstflock.com/api';
}

export const API_BASE_URL = getApiBaseURL();

export function buildApiURL(path, params = {}) {
    const queryString = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(
            ([key, value]) =>
                `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
        )
        .join('&');
    const normalizedPath = path.replace(/^\/+/, '');

    return `${API_BASE_URL}/${normalizedPath}${queryString ? `?${queryString}` : ''}`;
}
