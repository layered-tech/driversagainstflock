export function tvActionPlace(action) {
    if (
        !action ||
        !['camera', 'watch-camera'].includes(action.type)
    )
        return null;
    const payload = action.payload;
    const latitude = payload?.latitude;
    const longitude = payload?.longitude;
    if (
        !Number.isFinite(latitude) ||
        Math.abs(latitude) > 90 ||
        !Number.isFinite(longitude) ||
        Math.abs(longitude) > 180
    )
        return null;
    const name = String(
        payload?.street ?? payload?.name ?? 'Shared place',
    ).slice(0, 160);
    return { latitude, longitude, name };
}
