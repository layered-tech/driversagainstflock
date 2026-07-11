import { View } from 'react-native';
import { CameraDebugOverlay } from './camera-debug-overlay';
import { NetworkDebugOverlay } from './network-debug-overlay';

export function DebugOverlayStack({
    cameraDebugOverlayIsVisible,
    cameraState,
    networkDebugOverlayIsVisible,
}) {
    return (
        <View className="gap-2">
            {cameraDebugOverlayIsVisible ? (
                <CameraDebugOverlay cameraState={cameraState} />
            ) : null}
            {networkDebugOverlayIsVisible ? <NetworkDebugOverlay /> : null}
        </View>
    );
}
