import { useCallback, useEffect, useRef, useState } from 'react';
import {
    logMapLayerSelected,
    logMapLightPresetSelected,
    logMapPoliceAlertsToggled,
    logMapTrafficToggled,
} from './analytics';
import { MAP_LAYER_STYLES } from './constants';

export function useMapLayerSheetActions({
    setMapLightPresetPreference,
    setMapStyleURL,
    setMapTrafficEnabled,
    setPoliceAlertsVisible,
}) {
    const layerSheetRef = useRef(null);
    const layerSheetHasMountedRef = useRef(false);
    const layerSheetPresentationFrameRef = useRef(null);
    const layerSheetPresentationRetryRef = useRef(null);
    const layerSheetPresentationAttemptRef = useRef(0);
    const layerSheetIsDismissingRef = useRef(false);
    const layerSheetPresentationIsPendingRef = useRef(false);
    const [layerSheetResetCount, setLayerSheetResetCount] = useState(0);
    const clearScheduledPresentation = useCallback(() => {
        if (layerSheetPresentationFrameRef.current !== null) {
            cancelAnimationFrame(layerSheetPresentationFrameRef.current);
            layerSheetPresentationFrameRef.current = null;
        }
        if (layerSheetPresentationRetryRef.current !== null) {
            clearTimeout(layerSheetPresentationRetryRef.current);
            layerSheetPresentationRetryRef.current = null;
        }
    }, []);
    useEffect(
        () => () => {
            layerSheetPresentationIsPendingRef.current = false;
            clearScheduledPresentation();
        },
        [clearScheduledPresentation],
    );

    const presentMapLayerSheet = useCallback(
        function presentMapLayerSheet() {
            if (layerSheetIsDismissingRef.current) {
                return;
            }
            clearScheduledPresentation();
            if (layerSheetRef.current) {
                layerSheetPresentationIsPendingRef.current = false;
                layerSheetRef.current.present();
                return;
            }
            if (!layerSheetPresentationIsPendingRef.current) {
                return;
            }
            if (layerSheetPresentationAttemptRef.current >= 10) {
                layerSheetPresentationIsPendingRef.current = false;
                return;
            }
            layerSheetPresentationAttemptRef.current += 1;
            layerSheetPresentationFrameRef.current = requestAnimationFrame(
                () => {
                    layerSheetPresentationFrameRef.current = null;
                    if (layerSheetRef.current) {
                        presentMapLayerSheet();
                        return;
                    }
                    layerSheetPresentationRetryRef.current = setTimeout(() => {
                        layerSheetPresentationRetryRef.current = null;
                        presentMapLayerSheet();
                    }, 300);
                },
            );
        },
        [clearScheduledPresentation],
    );
    const handleMapLayerPress = useCallback(() => {
        layerSheetPresentationIsPendingRef.current = true;
        layerSheetPresentationAttemptRef.current = 0;
        presentMapLayerSheet();
    }, [presentMapLayerSheet]);
    const dismissMapLayerSheet = useCallback(() => {
        clearScheduledPresentation();
        layerSheetPresentationIsPendingRef.current = false;
        if (!layerSheetHasMountedRef.current) {
            layerSheetRef.current?.dismiss();
            return;
        }
        if (layerSheetIsDismissingRef.current) {
            return;
        }
        layerSheetIsDismissingRef.current = true;
        layerSheetRef.current?.dismiss();
    }, [clearScheduledPresentation]);
    const handleMapLayerSheetAnimate = useCallback((_fromIndex, toIndex) => {
        layerSheetIsDismissingRef.current = toIndex < 0;
        if (toIndex >= 0) {
            layerSheetHasMountedRef.current = true;
        }
    }, []);
    const handleMapLayerSheetChange = useCallback(
        (index) => {
            layerSheetIsDismissingRef.current = false;
            if (index >= 0) {
                layerSheetHasMountedRef.current = true;
                layerSheetPresentationIsPendingRef.current = false;
                clearScheduledPresentation();
                return;
            }
            if (layerSheetPresentationIsPendingRef.current) {
                layerSheetPresentationFrameRef.current =
                    requestAnimationFrame(presentMapLayerSheet);
            }
        },
        [clearScheduledPresentation, presentMapLayerSheet],
    );
    const handleMapLayerSheetDismiss = useCallback(() => {
        layerSheetHasMountedRef.current = false;
        layerSheetIsDismissingRef.current = false;
        setLayerSheetResetCount((resetCount) => resetCount + 1);
        clearScheduledPresentation();
        if (layerSheetPresentationIsPendingRef.current) {
            layerSheetPresentationFrameRef.current =
                requestAnimationFrame(presentMapLayerSheet);
        }
    }, [clearScheduledPresentation, presentMapLayerSheet]);
    const handleMapLightPresetPreferenceChange = useCallback(
        (preset) => {
            setMapLightPresetPreference(preset);
            logMapLightPresetSelected({ preset });
        },
        [setMapLightPresetPreference],
    );
    const handleMapTrafficEnabledChange = useCallback(
        (enabled) => {
            setMapTrafficEnabled(enabled);
            logMapTrafficToggled({ enabled });
        },
        [setMapTrafficEnabled],
    );
    const handlePoliceAlertsVisibleChange = useCallback(
        (enabled) => {
            setPoliceAlertsVisible(enabled);
            logMapPoliceAlertsToggled({ enabled });
        },
        [setPoliceAlertsVisible],
    );
    const handleMapLayerSelect = useCallback(
        (styleURL) => {
            setMapStyleURL(styleURL);
            dismissMapLayerSheet();
            logMapLayerSelected({
                layerKey:
                    MAP_LAYER_STYLES.find(
                        (mapLayer) => mapLayer.styleURL === styleURL,
                    )?.key || 'unknown',
            });
        },
        [dismissMapLayerSheet, setMapStyleURL],
    );

    return {
        dismissMapLayerSheet,
        handleMapLayerPress,
        handleMapLayerSelect,
        handleMapLayerSheetAnimate,
        handleMapLayerSheetChange,
        handleMapLayerSheetDismiss,
        handleMapLightPresetPreferenceChange,
        handleMapTrafficEnabledChange,
        handlePoliceAlertsVisibleChange,
        layerSheetRef,
        layerSheetResetCount,
    };
}
