import { useMemo } from 'react';
import { View } from 'react-native';
import { CameraDebugOverlay } from './map/camera-debug-overlay';
import { CameraFocusDebugOverlay } from './map/camera-focus-debug-overlay';
import {
    DEBUG_OVERLAY_ANDROID_AUTO_LOCATION,
    DEBUG_OVERLAY_CAMERA,
    DEBUG_OVERLAY_CAMERA_FOCUS,
    DEBUG_OVERLAY_SAFE_AREA,
} from './map/debug-overlays';
import { LocationDebugOverlay } from './map/location-debug-overlay';
import { SafeAreaDebugOverlay } from './map/safe-area-debug-overlay';

export function autoPlayCameraDebugStateUpdatesAreEnabled({
    debugOverlayVisibility,
    debugOverlaysAreVisible,
}) {
    return (
        debugOverlaysAreVisible &&
        debugOverlayVisibility?.[DEBUG_OVERLAY_CAMERA] === true
    );
}

export function AutoPlayDebugOverlays({
    controller,
    debugOverlayVisibility,
    debugOverlaysAreVisible,
    isDrivingMode,
    presentation,
    userLocation,
    viewportMetrics,
}) {
    const safeAreaDebugOverlayIsVisible =
        debugOverlaysAreVisible &&
        debugOverlayVisibility?.[DEBUG_OVERLAY_SAFE_AREA] === true;
    const cameraFocusDebugOverlayIsVisible =
        debugOverlaysAreVisible &&
        debugOverlayVisibility?.[DEBUG_OVERLAY_CAMERA_FOCUS] === true;
    const cameraDebugOverlayIsVisible =
        debugOverlaysAreVisible &&
        debugOverlayVisibility?.[DEBUG_OVERLAY_CAMERA] === true;
    const carLocationDebugOverlayIsVisible =
        debugOverlaysAreVisible &&
        debugOverlayVisibility?.[DEBUG_OVERLAY_ANDROID_AUTO_LOCATION] === true;
    const cameraFocusDebugState = useMemo(() => {
        const followPadding = controller.nativeCameraFollowProps?.padding;

        return {
            label:
                isDrivingMode && followPadding
                    ? 'Car screen location frame'
                    : 'Car screen center frame',
            padding:
                isDrivingMode && followPadding
                    ? followPadding
                    : viewportMetrics.cameraPadding,
        };
    }, [
        controller.nativeCameraFollowProps?.padding?.paddingBottom,
        controller.nativeCameraFollowProps?.padding?.paddingLeft,
        controller.nativeCameraFollowProps?.padding?.paddingRight,
        controller.nativeCameraFollowProps?.padding?.paddingTop,
        isDrivingMode,
        viewportMetrics.cameraPadding.paddingBottom,
        viewportMetrics.cameraPadding.paddingLeft,
        viewportMetrics.cameraPadding.paddingRight,
        viewportMetrics.cameraPadding.paddingTop,
    ]);

    if (!debugOverlaysAreVisible) {
        return null;
    }

    return (
        <>
            {safeAreaDebugOverlayIsVisible ? (
                <SafeAreaDebugOverlay
                    controlInsets={presentation.mapControlLayoutInsets}
                    insets={presentation.insets}
                />
            ) : null}
            {cameraFocusDebugOverlayIsVisible ? (
                <CameraFocusDebugOverlay
                    focusState={cameraFocusDebugState}
                    windowHeight={viewportMetrics.height}
                    windowWidth={viewportMetrics.width}
                />
            ) : null}
            {cameraDebugOverlayIsVisible || carLocationDebugOverlayIsVisible ? (
                <View
                    className="absolute z-[70] items-start gap-[8px]"
                    pointerEvents="none"
                    style={{
                        left: presentation.mapControlLayoutInsets.left,
                        top: presentation.mapControlLayoutInsets.top,
                    }}
                >
                    {cameraDebugOverlayIsVisible ? (
                        <CameraDebugOverlay
                            cameraState={controller.currentCameraDebugState}
                        />
                    ) : null}
                    {carLocationDebugOverlayIsVisible ? (
                        <LocationDebugOverlay location={userLocation} />
                    ) : null}
                </View>
            ) : null}
        </>
    );
}
