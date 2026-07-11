import { useCallback, useEffect, useRef, useState } from 'react';
import { getMarkerCoordinate } from './geo';
import {
    findMarkerPointForFeature,
    getMarkerPointId,
} from './marker-selection';

const MARKER_TAP_MAP_PRESS_IGNORE_MS = 250;

export function useMapMarkerSelectionState({ markerPoints }) {
    const markerDetailsIsOpenRef = useRef(false);
    const markerDetailsSheetRef = useRef(null);
    const markerTapTimestampRef = useRef(0);
    const pendingMarkerSelectionRef = useRef(null);
    const [selectedMarker, setSelectedMarker] = useState(null);
    const selectedMarkerId = getMarkerPointId(selectedMarker);

    useEffect(() => {
        if (!selectedMarkerId) {
            return;
        }

        const nextSelectedMarker = markerPoints.find(
            (marker) => getMarkerPointId(marker) === selectedMarkerId,
        );

        if (nextSelectedMarker && nextSelectedMarker !== selectedMarker) {
            setSelectedMarker(nextSelectedMarker);
        }
    }, [markerPoints, selectedMarker, selectedMarkerId]);

    useEffect(() => {
        if (!selectedMarker) {
            return;
        }

        if (!markerDetailsIsOpenRef.current) {
            markerDetailsIsOpenRef.current = true;
            markerDetailsSheetRef.current?.present();
        }

        requestAnimationFrame(() => {
            markerDetailsSheetRef.current?.snapToIndex(0);
        });
    }, [selectedMarker]);

    return {
        markerDetailsIsOpenRef,
        markerDetailsSheetRef,
        markerTapTimestampRef,
        pendingMarkerSelectionRef,
        selectedMarker,
        selectedMarkerId,
        setSelectedMarker,
    };
}

export function useMapMarkerInteractionHandlers({
    locationController,
    markerDetailsIsOpenRef,
    markerDetailsSheetRef,
    markerPoints,
    markerTapTimestampRef,
    pendingMarkerSelectionRef,
    searchController,
    selectedMarker,
    selectedMarkerId,
    setSelectedMarker,
}) {
    const handleIndividualMarkerFeaturePress = useCallback(
        (feature) => {
            const marker = findMarkerPointForFeature(markerPoints, feature);

            if (!marker) {
                return;
            }

            markerTapTimestampRef.current = Date.now();
            searchController.dismissPlaceSheet();
            searchController.dismissDirectionsRouteSheet();

            const nextMarkerId = getMarkerPointId(marker);
            const selectedMarkerIsDifferent =
                selectedMarker &&
                (nextMarkerId && selectedMarkerId
                    ? nextMarkerId !== selectedMarkerId
                    : marker !== selectedMarker);

            if (markerDetailsIsOpenRef.current && selectedMarkerIsDifferent) {
                pendingMarkerSelectionRef.current = marker;
                markerDetailsSheetRef.current?.dismiss();
                return;
            }

            setSelectedMarker(marker);
        },
        [
            markerDetailsIsOpenRef,
            markerDetailsSheetRef,
            markerPoints,
            markerTapTimestampRef,
            pendingMarkerSelectionRef,
            searchController.dismissDirectionsRouteSheet,
            searchController.dismissPlaceSheet,
            selectedMarker,
            selectedMarkerId,
            setSelectedMarker,
        ],
    );
    const handleMarkerSourcePress = useCallback(
        (event) => {
            const feature = event?.features?.[0];

            if (!feature) {
                return;
            }

            if (
                feature?.properties?.cluster ||
                feature?.properties?.point_count
            ) {
                locationController.handleMarkerSourcePress(event);
                return;
            }

            handleIndividualMarkerFeaturePress(feature);
        },
        [
            handleIndividualMarkerFeaturePress,
            locationController.handleMarkerSourcePress,
        ],
    );
    const handleMapPress = useCallback(
        (event) => {
            if (
                Date.now() - markerTapTimestampRef.current <
                MARKER_TAP_MAP_PRESS_IGNORE_MS
            ) {
                return;
            }

            if (markerDetailsIsOpenRef.current || selectedMarker) {
                pendingMarkerSelectionRef.current = null;

                if (markerDetailsIsOpenRef.current) {
                    markerDetailsSheetRef.current?.dismiss();
                } else {
                    setSelectedMarker(null);
                }

                return;
            }

            searchController.handleMapPress(event);
        },
        [
            markerDetailsIsOpenRef,
            markerDetailsSheetRef,
            markerTapTimestampRef,
            pendingMarkerSelectionRef,
            searchController.handleMapPress,
            selectedMarker,
            setSelectedMarker,
        ],
    );
    const handleMarkerDetailsRecenterPress = useCallback(() => {
        const coordinate = getMarkerCoordinate(selectedMarker);

        if (coordinate) {
            locationController.moveCameraToCoordinate(coordinate);
        }
    }, [locationController.moveCameraToCoordinate, selectedMarker]);

    return {
        handleMapPress,
        handleMarkerDetailsRecenterPress,
        handleMarkerSourcePress,
    };
}
