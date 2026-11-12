export function areaCenterFromParams(params) {
    if (
        typeof params?.latitude !== 'string' ||
        typeof params?.longitude !== 'string' ||
        !params.latitude.trim() ||
        !params.longitude.trim()
    )
        return null;
    const latitude = Number(params.latitude);
    const longitude = Number(params.longitude);
    return Number.isFinite(latitude) &&
        Math.abs(latitude) <= 90 &&
        Number.isFinite(longitude) &&
        Math.abs(longitude) <= 180
        ? [longitude, latitude]
        : null;
}
