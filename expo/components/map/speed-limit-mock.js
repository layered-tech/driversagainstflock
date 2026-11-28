const MILES_PER_HOUR_TO_METERS_PER_SECOND = 0.44704;

export const MOCK_CURRENT_SPEED_MPH = 51;
export const MOCK_SPEED_LIMIT_MPH = 45;

export function getMockCurrentSpeedMps() {
    return MOCK_CURRENT_SPEED_MPH * MILES_PER_HOUR_TO_METERS_PER_SECOND;
}

export function getMockSpeedLimitSnapshot() {
    return {
        maxspeed: `${MOCK_SPEED_LIMIT_MPH} mph`,
        speedLimitMph: MOCK_SPEED_LIMIT_MPH,
        unit: 'mph',
    };
}
