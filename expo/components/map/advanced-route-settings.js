export const DEFAULT_AVOID_BUFFER_METERS = 50;
export const MIN_AVOID_BUFFER_METERS = 25;
export const MAX_AVOID_BUFFER_METERS = 1000;
export const AVOID_BUFFER_STEP_METERS = 25;

export function normalizeAvoidBufferMeters(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return DEFAULT_AVOID_BUFFER_METERS;
    }

    const steppedValue =
        Math.round(numericValue / AVOID_BUFFER_STEP_METERS) *
        AVOID_BUFFER_STEP_METERS;

    return Math.min(
        MAX_AVOID_BUFFER_METERS,
        Math.max(MIN_AVOID_BUFFER_METERS, steppedValue),
    );
}

export function normalizeAdvancedRouteSettings(settings = {}) {
    return {
        allowAlprNearStartDestination:
            settings?.allowAlprNearStartDestination !== false,
        avoidBufferMeters: normalizeAvoidBufferMeters(
            settings?.avoidBufferMeters,
        ),
    };
}

export function getAdvancedRouteSettings(route) {
    return normalizeAdvancedRouteSettings(route?.advancedRouteSettings);
}

export function getStoredAdvancedRouteSettings(preferences) {
    return normalizeAdvancedRouteSettings(preferences?.advancedRouteSettings);
}

export function getAdvancedRouteSettingsKey(settings) {
    const normalizedSettings = normalizeAdvancedRouteSettings(settings);

    return [
        normalizedSettings.allowAlprNearStartDestination ? '1' : '0',
        normalizedSettings.avoidBufferMeters,
    ].join(':');
}

export function getAdvancedRouteSettingsRequestPayload(settings) {
    const normalizedSettings = normalizeAdvancedRouteSettings(settings);

    return {
        allow_alpr_near_start_destination:
            normalizedSettings.allowAlprNearStartDestination,
        avoid_buffer: normalizedSettings.avoidBufferMeters,
    };
}
