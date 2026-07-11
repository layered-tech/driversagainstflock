import { useWindowDimensions, View } from 'react-native';
import { CameraFocusDebugOverlay } from './camera-focus-debug-overlay';
import { SHOW_MAP_DEBUG_CONTROLS } from './config';
import { DebugOverlayStack } from './debug-overlay-stack';
import {
    DEBUG_OVERLAY_CAMERA,
    DEBUG_OVERLAY_CAMERA_FOCUS,
    DEBUG_OVERLAY_NETWORK,
    DEBUG_OVERLAY_SAFE_AREA,
} from './debug-overlays';
import { useDebugControlsContext } from './map-screen-context';
import { SafeAreaDebugOverlay } from './safe-area-debug-overlay';

export function MapDebugControls() {
    const { height: windowHeight, width: windowWidth } = useWindowDimensions();
    const {
        cameraFocusDebugState,
        currentCameraDebugState,
        debugOverlayVisibility,
        insets,
        mapControlLayoutInsets,
        mapDebugControlPosition,
        mapPreferencesAreLoaded,
    } = useDebugControlsContext();

    if (!mapPreferencesAreLoaded || !SHOW_MAP_DEBUG_CONTROLS) {
        return null;
    }

    const safeAreaDebugOverlayIsVisible =
        debugOverlayVisibility?.[DEBUG_OVERLAY_SAFE_AREA] === true;
    const cameraFocusDebugOverlayIsVisible =
        debugOverlayVisibility?.[DEBUG_OVERLAY_CAMERA_FOCUS] === true;
    const cameraDebugOverlayIsVisible =
        debugOverlayVisibility?.[DEBUG_OVERLAY_CAMERA] === true;
    const networkDebugOverlayIsVisible =
        debugOverlayVisibility?.[DEBUG_OVERLAY_NETWORK] === true;
    const debugOverlayStackIsVisible =
        cameraDebugOverlayIsVisible || networkDebugOverlayIsVisible;

    return (
        <>
            {safeAreaDebugOverlayIsVisible ? (
                <SafeAreaDebugOverlay
                    controlInsets={mapControlLayoutInsets}
                    insets={insets}
                />
            ) : null}
            {cameraFocusDebugOverlayIsVisible ? (
                <CameraFocusDebugOverlay
                    focusState={cameraFocusDebugState}
                    windowHeight={windowHeight}
                    windowWidth={windowWidth}
                />
            ) : null}

            {debugOverlayStackIsVisible ? (
                <View
                    className="absolute items-start gap-2"
                    pointerEvents="none"
                    style={[
                        mapDebugControlPosition,
                        {
                            zIndex: 70,
                        },
                    ]}
                >
                    <DebugOverlayStack
                        cameraDebugOverlayIsVisible={
                            cameraDebugOverlayIsVisible
                        }
                        cameraState={currentCameraDebugState}
                        networkDebugOverlayIsVisible={
                            networkDebugOverlayIsVisible
                        }
                    />
                </View>
            ) : null}
        </>
    );
}
