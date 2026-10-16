export async function saveAreaPushToken({
    notifications,
    projectId,
    devicePushToken,
    areaRequest,
    timezone,
    platform,
    application,
}) {
    const isIosSimulator =
        platform === 'ios' &&
        (await application.getIosApplicationReleaseTypeAsync()) ===
            application.ApplicationReleaseType.SIMULATOR;
    const token = await notifications.getExpoPushTokenAsync({
        projectId,
        devicePushToken,
        ...(isIosSimulator ? { development: true } : {}),
    });
    await areaRequest('/device', {
        method: 'PATCH',
        body: { push_token: token.data, timezone },
    });
}
