import { useCallback, useRef, useState } from 'react';
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
    const layerSheetIsDismissingRef = useRef(false);
    const layerSheetPresentationIsPendingRef = useRef(false);
    const [layerSheetResetCount, setLayerSheetResetCount] = useState(0);
    const presentMapLayerSheet = useCallback(() => {
        if (layerSheetRef.current) {
            layerSheetRef.current.present();

            return;
        }

        requestAnimationFrame(() => {
            layerSheetRef.current?.present();
        });
    }, []);
    const handleMapLayerPress = useCallback(() => {
        if (layerSheetIsDismissingRef.current) {
            layerSheetPresentationIsPendingRef.current = true;

            return;
        }

        presentMapLayerSheet();
    }, [presentMapLayerSheet]);
    const handleMapLayerSheetAnimate = useCallback((_fromIndex, toIndex) => {
        if (toIndex < 0) {
            layerSheetIsDismissingRef.current = true;
        }
    }, []);
    const handleMapLayerSheetChange = useCallback((index) => {
        if (index >= 0) {
            layerSheetIsDismissingRef.current = false;
            layerSheetPresentationIsPendingRef.current = false;
        }
    }, []);
    const handleMapLayerSheetDismiss = useCallback(() => {
        layerSheetIsDismissingRef.current = false;
        setLayerSheetResetCount((resetCount) => resetCount + 1);

        if (!layerSheetPresentationIsPendingRef.current) {
            return;
        }

        layerSheetPresentationIsPendingRef.current = false;
        requestAnimationFrame(presentMapLayerSheet);
    }, [presentMapLayerSheet]);
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
            layerSheetIsDismissingRef.current = true;
            layerSheetRef.current?.dismiss();
            logMapLayerSelected({
                layerKey:
                    MAP_LAYER_STYLES.find(
                        (mapLayer) => mapLayer.styleURL === styleURL,
                    )?.key || 'unknown',
            });
        },
        [setMapStyleURL],
    );

    return {
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
