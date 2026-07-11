import { Text, View } from 'react-native';

const CAMERA_DEBUG_OVERLAY_WIDTH = 248;

function formatCameraDebugValue(value, precision, suffix = '') {
    if (!Number.isFinite(value)) {
        return 'n/a';
    }

    return `${value.toFixed(precision)}${suffix}`;
}

export function CameraDebugOverlay({ cameraState }) {
    const rows = [
        {
            label: 'Lng',
            value: formatCameraDebugValue(cameraState?.longitude, 6),
        },
        {
            label: 'Lat',
            value: formatCameraDebugValue(cameraState?.latitude, 6),
        },
        {
            label: 'Zoom',
            value: formatCameraDebugValue(cameraState?.zoomLevel, 2),
        },
        {
            label: 'Heading',
            value: formatCameraDebugValue(cameraState?.heading, 2, ' deg'),
        },
        {
            label: 'Pitch',
            value: formatCameraDebugValue(cameraState?.pitch, 2, ' deg'),
        },
    ];

    return (
        <View
            className="self-start"
            style={{ width: CAMERA_DEBUG_OVERLAY_WIDTH }}
        >
            <View className="elevation-[3] gap-1 rounded-md border border-neutral-950/10 bg-neutral-950/90 p-2 shadow-[0px_2px_8px_rgba(0,0,0,0.16)]">
                <Text className="text-[10px] font-bold uppercase text-neutral-300">
                    Camera
                </Text>
                {rows.map((row) => (
                    <View
                        className="h-4 flex-row items-center gap-2"
                        key={row.label}
                    >
                        <Text className="w-14 text-[10px] font-semibold text-neutral-300">
                            {row.label}
                        </Text>
                        <Text
                            className="flex-1 text-[10px] font-bold text-white"
                            numberOfLines={1}
                            style={{ fontVariant: ['tabular-nums'] }}
                        >
                            {row.value}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}
