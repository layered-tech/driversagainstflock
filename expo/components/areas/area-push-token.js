export async function saveAreaPushToken({
    notifications,
    projectId,
    devicePushToken,
    areaRequest,
    timezone,
}) {
    const token = await notifications.getExpoPushTokenAsync({
        projectId,
        devicePushToken,
    });
    await areaRequest('/device', {
        method: 'PATCH',
        body: { push_token: token.data, timezone },
    });
}
