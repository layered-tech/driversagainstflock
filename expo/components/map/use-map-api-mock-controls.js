import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
    getMockMarkerPointsSnapshot,
    setMapApiMocksEnabled,
} from './api-mocks';
import { getMarkerCoordinate } from './geo';

function getSearchParamValue(value) {
    return Array.isArray(value) ? value[0] : value;
}

export function useMapApiMockControls({ locationController }) {
    const searchParams = useLocalSearchParams();
    const initialMockCameraMoveHasRunRef = useRef(false);
    const e2eMapApiMocksParam = getSearchParamValue(
        searchParams.e2eMapApiMocks,
    );
    const e2eMapApiMocksAreRequested = e2eMapApiMocksParam === '1';
    const e2eMapApiMocksAreDisabled = e2eMapApiMocksParam === '0';

    useEffect(() => {
        if (e2eMapApiMocksAreRequested) {
            setMapApiMocksEnabled(true);
            return;
        }

        if (e2eMapApiMocksAreDisabled) {
            setMapApiMocksEnabled(false);
        }
    }, [e2eMapApiMocksAreDisabled, e2eMapApiMocksAreRequested]);

    useEffect(() => {
        if (!e2eMapApiMocksAreRequested) {
            initialMockCameraMoveHasRunRef.current = false;
            return;
        }

        if (initialMockCameraMoveHasRunRef.current) {
            return;
        }

        const markerCoordinate = getMockMarkerPointsSnapshot()
            .map(getMarkerCoordinate)
            .find(Boolean);

        if (markerCoordinate) {
            initialMockCameraMoveHasRunRef.current = true;
            locationController.moveCameraToCoordinate(markerCoordinate);
        }
    }, [e2eMapApiMocksAreRequested, locationController.moveCameraToCoordinate]);

    return {
        e2eMapApiMocksAreRequested,
    };
}
