import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
    MAPBOX_STANDARD_LIGHT_PRESET_AUTO,
    MAPBOX_STANDARD_LIGHT_PRESET_DAWN,
    MAPBOX_STANDARD_LIGHT_PRESET_DAY,
    MAPBOX_STANDARD_LIGHT_PRESET_DUSK,
    MAPBOX_STANDARD_LIGHT_PRESET_NIGHT,
} from './config';

const MAP_LIGHT_PRESET_REFRESH_MS = 60 * 1000;
const MAP_LIGHT_LOCATION_KEY_PRECISION = 1;
const SOLAR_ZENITH_SUNRISE_DEGREES = 90.833;
const SOLAR_ZENITH_CIVIL_TWILIGHT_DEGREES = 96;
const FIXED_MAP_LIGHT_PRESETS = new Set([
    MAPBOX_STANDARD_LIGHT_PRESET_DAWN,
    MAPBOX_STANDARD_LIGHT_PRESET_DAY,
    MAPBOX_STANDARD_LIGHT_PRESET_DUSK,
    MAPBOX_STANDARD_LIGHT_PRESET_NIGHT,
]);

function getMapLightLocationKey(location) {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return '';
    }

    return `${latitude.toFixed(MAP_LIGHT_LOCATION_KEY_PRECISION)},${longitude.toFixed(MAP_LIGHT_LOCATION_KEY_PRECISION)}`;
}

function degreesToRadians(degrees) {
    return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians) {
    return (radians * 180) / Math.PI;
}

function normalizeDegrees(degrees) {
    return ((degrees % 360) + 360) % 360;
}

function normalizeHours(hours) {
    return ((hours % 24) + 24) % 24;
}

function getDayOfYear(date) {
    const startOfYear = new Date(date.getFullYear(), 0, 0);
    const localMidnight = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
    );

    return Math.floor((localMidnight - startOfYear) / 86400000);
}

function getFiniteLocationNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

function getSolarEventTime({ date, latitude, longitude, zenith, isSunrise }) {
    const dayOfYear = getDayOfYear(date);
    const longitudeHour = longitude / 15;
    const approximateTime =
        dayOfYear + ((isSunrise ? 6 : 18) - longitudeHour) / 24;
    const meanAnomaly = 0.9856 * approximateTime - 3.289;
    const trueLongitude = normalizeDegrees(
        meanAnomaly +
            1.916 * Math.sin(degreesToRadians(meanAnomaly)) +
            0.02 * Math.sin(degreesToRadians(2 * meanAnomaly)) +
            282.634,
    );
    let rightAscension = radiansToDegrees(
        Math.atan(0.91764 * Math.tan(degreesToRadians(trueLongitude))),
    );
    rightAscension = normalizeDegrees(rightAscension);
    rightAscension +=
        Math.floor(trueLongitude / 90) * 90 -
        Math.floor(rightAscension / 90) * 90;
    rightAscension /= 15;

    const sinDeclination = 0.39782 * Math.sin(degreesToRadians(trueLongitude));
    const cosDeclination = Math.cos(Math.asin(sinDeclination));
    const cosHourAngle =
        (Math.cos(degreesToRadians(zenith)) -
            sinDeclination * Math.sin(degreesToRadians(latitude))) /
        (cosDeclination * Math.cos(degreesToRadians(latitude)));

    if (cosHourAngle > 1 || cosHourAngle < -1) {
        return null;
    }

    const hourAngle = isSunrise
        ? 360 - radiansToDegrees(Math.acos(cosHourAngle))
        : radiansToDegrees(Math.acos(cosHourAngle));
    const localMeanTime =
        hourAngle / 15 + rightAscension - 0.06571 * approximateTime - 6.622;
    const utcHour = normalizeHours(localMeanTime - longitudeHour);
    const localHour = normalizeHours(utcHour - date.getTimezoneOffset() / 60);
    const localMidnight = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
    );

    return new Date(localMidnight.getTime() + localHour * 60 * 60 * 1000);
}

export function getMapboxStandardLightPreset(date = new Date()) {
    const hour = date.getHours() + date.getMinutes() / 60;

    if (hour >= 5 && hour < 8) {
        return MAPBOX_STANDARD_LIGHT_PRESET_DAWN;
    }

    if (hour >= 8 && hour < 17) {
        return MAPBOX_STANDARD_LIGHT_PRESET_DAY;
    }

    if (hour >= 17 && hour < 20) {
        return MAPBOX_STANDARD_LIGHT_PRESET_DUSK;
    }

    return MAPBOX_STANDARD_LIGHT_PRESET_NIGHT;
}

export function getMapboxStandardLightPresetForLocation(
    location,
    date = new Date(),
) {
    const latitude = getFiniteLocationNumber(location?.latitude);
    const longitude = getFiniteLocationNumber(location?.longitude);

    if (
        latitude === null ||
        longitude === null ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        return getMapboxStandardLightPreset(date);
    }

    const dawn = getSolarEventTime({
        date,
        latitude,
        longitude,
        zenith: SOLAR_ZENITH_CIVIL_TWILIGHT_DEGREES,
        isSunrise: true,
    });
    const sunrise = getSolarEventTime({
        date,
        latitude,
        longitude,
        zenith: SOLAR_ZENITH_SUNRISE_DEGREES,
        isSunrise: true,
    });
    const sunset = getSolarEventTime({
        date,
        latitude,
        longitude,
        zenith: SOLAR_ZENITH_SUNRISE_DEGREES,
        isSunrise: false,
    });
    const dusk = getSolarEventTime({
        date,
        latitude,
        longitude,
        zenith: SOLAR_ZENITH_CIVIL_TWILIGHT_DEGREES,
        isSunrise: false,
    });

    if (!dawn || !sunrise || !sunset || !dusk) {
        return getMapboxStandardLightPreset(date);
    }

    const time = date.getTime();

    if (time >= dawn.getTime() && time < sunrise.getTime()) {
        return MAPBOX_STANDARD_LIGHT_PRESET_DAWN;
    }

    if (time >= sunrise.getTime() && time < sunset.getTime()) {
        return MAPBOX_STANDARD_LIGHT_PRESET_DAY;
    }

    if (time >= sunset.getTime() && time < dusk.getTime()) {
        return MAPBOX_STANDARD_LIGHT_PRESET_DUSK;
    }

    return MAPBOX_STANDARD_LIGHT_PRESET_NIGHT;
}

export function getResolvedMapboxStandardLightPreset(
    lightPresetPreference = MAPBOX_STANDARD_LIGHT_PRESET_AUTO,
    date = new Date(),
    location = null,
) {
    if (FIXED_MAP_LIGHT_PRESETS.has(lightPresetPreference)) {
        return lightPresetPreference;
    }

    return getMapboxStandardLightPresetForLocation(location, date);
}

export function useMapboxStandardLightPreset(
    lightPresetPreference = MAPBOX_STANDARD_LIGHT_PRESET_AUTO,
    location = null,
) {
    const locationRef = useRef(location);
    const locationKey = getMapLightLocationKey(location);
    const [lightPreset, setLightPreset] = useState(() =>
        getResolvedMapboxStandardLightPreset(
            lightPresetPreference,
            new Date(),
            location,
        ),
    );

    locationRef.current = location;

    useEffect(() => {
        if (FIXED_MAP_LIGHT_PRESETS.has(lightPresetPreference)) {
            setLightPreset(lightPresetPreference);

            return undefined;
        }

        const updateLightPreset = () => {
            setLightPreset(
                getMapboxStandardLightPresetForLocation(locationRef.current),
            );
        };
        const intervalId = setInterval(
            updateLightPreset,
            MAP_LIGHT_PRESET_REFRESH_MS,
        );
        const appStateSubscription = AppState.addEventListener(
            'change',
            (appState) => {
                if (appState === 'active') {
                    updateLightPreset();
                }
            },
        );

        updateLightPreset();

        return () => {
            clearInterval(intervalId);
            appStateSubscription.remove();
        };
    }, [lightPresetPreference, locationKey]);

    return lightPreset;
}
