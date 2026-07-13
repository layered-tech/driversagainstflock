const FOLLOW_CAMERA_PADDING_KEYS = [
    'paddingBottom',
    'paddingLeft',
    'paddingRight',
    'paddingTop',
];

function copyPadding(padding) {
    if (!padding) {
        return undefined;
    }

    return FOLLOW_CAMERA_PADDING_KEYS.reduce((copiedPadding, key) => {
        copiedPadding[key] = padding[key];

        return copiedPadding;
    }, {});
}

function haveSamePadding(firstPadding, secondPadding) {
    if (!firstPadding || !secondPadding) {
        return firstPadding === secondPadding;
    }

    return FOLLOW_CAMERA_PADDING_KEYS.every(
        (key) => firstPadding[key] === secondPadding[key],
    );
}

export function getFollowCameraSettings(followProps) {
    return {
        padding: copyPadding(followProps?.padding),
        pitch: followProps?.pitch,
        zoomLevel: followProps?.zoomLevel,
    };
}

export function getLocationUpdateKey(location) {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    return [
        latitude,
        longitude,
        location?.recordedAt ?? location?.timestamp ?? '',
        location?.courseHeading ?? location?.heading ?? '',
        location?.compassHeading ?? '',
        location?.compassHeadingRecordedAt ?? '',
    ].join(':');
}

export function createLocationBoundCameraFollowState({
    isFollowing,
    locationKey,
    settings,
}) {
    return {
        appliedSettings: settings,
        isFollowing,
        locationKey,
        pendingSettings: null,
    };
}

export function reconcileLocationBoundCameraFollowState({
    deferSettingsUntilNextLocation = false,
    desiredSettings,
    isFollowing,
    locationKey,
    state,
}) {
    const locationChanged =
        locationKey !== null && locationKey !== state.locationKey;
    const shouldApplyImmediately = !isFollowing || !state.isFollowing;

    if (shouldApplyImmediately) {
        return createLocationBoundCameraFollowState({
            isFollowing,
            locationKey,
            settings: desiredSettings,
        });
    }

    if (locationChanged) {
        if (deferSettingsUntilNextLocation) {
            if (state.pendingSettings) {
                return {
                    ...state,
                    appliedSettings: state.pendingSettings,
                    isFollowing,
                    locationKey,
                    pendingSettings: desiredSettings,
                };
            }

            return {
                ...state,
                isFollowing,
                locationKey,
                pendingSettings: desiredSettings,
            };
        }

        return createLocationBoundCameraFollowState({
            isFollowing,
            locationKey,
            settings: desiredSettings,
        });
    }

    const settingsMatch =
        state.appliedSettings.pitch === desiredSettings.pitch &&
        state.appliedSettings.zoomLevel === desiredSettings.zoomLevel &&
        haveSamePadding(state.appliedSettings.padding, desiredSettings.padding);

    if (settingsMatch) {
        return {
            ...state,
            isFollowing,
            locationKey,
            pendingSettings: null,
        };
    }

    return {
        ...state,
        isFollowing,
        locationKey,
        pendingSettings: desiredSettings,
    };
}
