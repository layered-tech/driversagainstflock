import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { areaRequest } from './areas-api';
import { saveAreaPushToken } from './area-push-token';

export function notificationsModule() {
    if (
        Platform.OS === 'web' ||
        !requireOptionalNativeModule('ExpoNotificationPermissionsModule')
    )
        return null;
    return require('expo-notifications');
}
export async function registerAreaNotifications({
    requestPermission = false,
    devicePushToken,
} = {}) {
    const notifications = notificationsModule();
    if (!notifications) {
        if (requestPermission)
            throw new Error(
                'Push alerts need an updated app build. You can still watch this area in the app.',
            );
        return false;
    }
    if (Platform.OS === 'android') {
        await notifications.setNotificationChannelAsync('area-changes', {
            name: 'Area camera changes',
            importance: notifications.AndroidImportance.DEFAULT,
        });
    }
    let permission = await notifications.getPermissionsAsync();
    if (!permission.granted && requestPermission && permission.canAskAgain)
        permission = await notifications.requestPermissionsAsync();
    if (!permission.granted) {
        await areaRequest('/device', {
            method: 'PATCH',
            body: { push_token: null },
        });
        if (requestPermission)
            throw new Error(
                'Notifications are disabled for this app. Enable them in your phone’s settings to receive pushes.',
            );
        return false;
    }
    const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;
    await saveAreaPushToken({
        notifications,
        projectId,
        devicePushToken,
        areaRequest,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });
    return true;
}
