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
    let token;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            token = await notifications.getExpoPushTokenAsync({
                projectId,
                devicePushToken,
                ...(isIosSimulator ? { development: true } : {}),
            });
            break;
        } catch (error) {
            if (
                error.code !== 'ERR_NOTIFICATIONS_NETWORK_ERROR' ||
                attempt === 3
            ) {
                throw error;
            }
            await new Promise((resolve) =>
                setTimeout(resolve, 500 * 2 ** (attempt - 1)),
            );
        }
    }
    await areaRequest('/device', {
        method: 'PATCH',
        body: { push_token: token.data, timezone },
    });
}
