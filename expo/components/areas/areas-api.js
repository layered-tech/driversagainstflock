import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { removePrivateCacheItem } from '../../lib/private-cache-storage';
import { buildApiURL } from '../map/config';
import { createAreaClient } from './area-client';
import { AREA_BOUNDARIES_STORAGE_KEY } from './area-boundary-cache';

const TOKEN_KEY = 'daf.area-device.v1';
const INSTALL_KEY = 'daf.area-install.v1';
const secureOptions = {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
export async function hasAreaDevice() {
    return Boolean(await AsyncStorage.getItem(INSTALL_KEY));
}
export const areaRequest = createAreaClient({
    buildURL: buildApiURL,
    fetchRequest: (...args) => fetch(...args),
    storage: {
        async get() {
            if (!(await SecureStore.isAvailableAsync()))
                throw new Error('Secure storage is unavailable on this phone.');
            return (await hasAreaDevice())
                ? SecureStore.getItemAsync(TOKEN_KEY, secureOptions)
                : null;
        },
        async set(token) {
            await SecureStore.setItemAsync(TOKEN_KEY, token, secureOptions);
            await AsyncStorage.setItem(INSTALL_KEY, '1');
        },
        async clear() {
            await SecureStore.deleteItemAsync(TOKEN_KEY, secureOptions);
            await AsyncStorage.removeItem(INSTALL_KEY);
            await removePrivateCacheItem(AREA_BOUNDARIES_STORAGE_KEY);
        },
    },
});
