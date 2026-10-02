import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import {
    getPrivateCacheItem,
    setPrivateCacheItem,
} from '../../lib/private-cache-storage';
import {
    addAcceptedDeviceLocationListener,
    getLatestAcceptedDeviceLocation,
} from './accepted-device-location';
import { createNwsWeatherClient } from './weather-nws-client';
import { createWeatherStore } from './weather-store';

export const weatherStore = createWeatherStore({
    client: createNwsWeatherClient(),
    storage: { getItem: getPrivateCacheItem, setItem: setPrivateCacheItem },
    rolloutEnabled: process.env.EXPO_PUBLIC_MAP_WEATHER_ENABLED !== 'false',
});

let retainedSurfaces = 0;
let locationSubscription = null;
let appSubscription = null;

function applyPhysicalLocation(location) {
    if (location?.locationProvider === 'auto-drive-simulation') {
        return;
    }
    weatherStore.setLocation({
        latitude: location?.latitude ?? location?.coords?.latitude,
        longitude: location?.longitude ?? location?.coords?.longitude,
    });
}

function retainWeatherRuntime(car) {
    if (retainedSurfaces++ === 0) {
        applyPhysicalLocation(getLatestAcceptedDeviceLocation());
        weatherStore.setForeground(AppState.currentState === 'active');
        locationSubscription = addAcceptedDeviceLocationListener(
            applyPhysicalLocation,
        );
        appSubscription = AppState.addEventListener('change', (state) => {
            weatherStore.setForeground(state === 'active');
        });
    }
    const release = weatherStore.retainSurface({ car });
    return () => {
        release();
        if (--retainedSurfaces === 0) {
            locationSubscription?.remove();
            appSubscription?.remove();
            locationSubscription = null;
            appSubscription = null;
        }
    };
}

export function useWeatherState() {
    useEffect(() => {
        weatherStore.hydrate();
    }, []);
    return useSyncExternalStore(
        weatherStore.subscribe,
        weatherStore.getSnapshot,
        weatherStore.getSnapshot,
    );
}

export function useWeatherSurface(car) {
    useEffect(() => retainWeatherRuntime(car), [car]);
    return useWeatherState();
}
