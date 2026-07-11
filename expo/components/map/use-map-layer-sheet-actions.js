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
    const [layerSheetResetCount, setLayerSheetResetCount] = useState(0);
    const handleMapLayerPress = useCallback(() => {
        layerSheetRef.current?.present();
    }, []);
    const handleMapLayerSheetDismiss = useCallback(() => {
        setLayerSheetResetCount((resetCount) => resetCount + 1);
    }, []);
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
        handleMapLayerSheetDismiss,
        handleMapLightPresetPreferenceChange,
        handleMapTrafficEnabledChange,
        handlePoliceAlertsVisibleChange,
        layerSheetRef,
        layerSheetResetCount,
    };
}
