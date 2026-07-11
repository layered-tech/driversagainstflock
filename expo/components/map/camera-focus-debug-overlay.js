import { Text, View } from 'react-native';

const CAMERA_FOCUS_LABEL_WIDTH = 220;
const CAMERA_FOCUS_TARGET_SIZE = 52;

function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }

    return Math.min(Math.max(value, min), max);
}

function getCameraFocusPaddingValue(padding, objectKey, arrayIndex) {
    const value = Array.isArray(padding)
        ? padding[arrayIndex]
        : typeof padding === 'number'
          ? padding
          : padding?.[objectKey];
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}

function getCameraFocusFrame({ focusState, windowHeight, windowWidth }) {
    const padding = focusState?.padding;

    if (!padding || windowHeight <= 0 || windowWidth <= 0) {
        return null;
    }

    const paddingTop = getCameraFocusPaddingValue(padding, 'paddingTop', 0);
    const paddingRight = getCameraFocusPaddingValue(padding, 'paddingRight', 1);
    const paddingBottom = getCameraFocusPaddingValue(
        padding,
        'paddingBottom',
        2,
    );
    const paddingLeft = getCameraFocusPaddingValue(padding, 'paddingLeft', 3);
    const left = clamp(paddingLeft, 0, windowWidth);
    const top = clamp(paddingTop, 0, windowHeight);
    const right = clamp(windowWidth - paddingRight, left, windowWidth);
    const bottom = clamp(windowHeight - paddingBottom, top, windowHeight);
    const width = right - left;
    const height = bottom - top;

    if (width <= 0 || height <= 0) {
        return null;
    }

    return {
        bottom,
        centerX: left + width / 2,
        centerY: top + height / 2,
        height,
        left,
        right,
        top,
        width,
    };
}

export function CameraFocusDebugOverlay({
    focusState,
    windowHeight,
    windowWidth,
}) {
    const frame = getCameraFocusFrame({
        focusState,
        windowHeight,
        windowWidth,
    });

    if (!frame) {
        return null;
    }

    const targetOffset = CAMERA_FOCUS_TARGET_SIZE / 2;
    const labelLeft = clamp(
        frame.centerX + 12,
        8,
        Math.max(8, windowWidth - CAMERA_FOCUS_LABEL_WIDTH - 8),
    );
    const labelTop = clamp(
        frame.centerY + 12,
        8,
        Math.max(8, windowHeight - 32),
    );

    return (
        <View className="absolute inset-0 z-50" pointerEvents="none">
            <View
                className="absolute left-0 right-0 top-0 bg-sky-950/20"
                style={{ height: frame.top }}
            />
            <View
                className="absolute bottom-0 left-0 right-0 bg-sky-950/20"
                style={{ height: windowHeight - frame.bottom }}
            />
            <View
                className="absolute bg-sky-950/20"
                style={{
                    bottom: windowHeight - frame.bottom,
                    left: 0,
                    top: frame.top,
                    width: frame.left,
                }}
            />
            <View
                className="absolute bg-sky-950/20"
                style={{
                    bottom: windowHeight - frame.bottom,
                    right: 0,
                    top: frame.top,
                    width: windowWidth - frame.right,
                }}
            />
            <View
                className="absolute border-2 border-sky-400"
                style={{
                    height: frame.height,
                    left: frame.left,
                    top: frame.top,
                    width: frame.width,
                }}
            />
            <View
                className="absolute rounded-full border-2 border-sky-300"
                style={{
                    height: CAMERA_FOCUS_TARGET_SIZE,
                    left: frame.centerX - targetOffset,
                    top: frame.centerY - targetOffset,
                    width: CAMERA_FOCUS_TARGET_SIZE,
                }}
            />
            <View
                className="absolute bg-sky-300"
                style={{
                    height: 2,
                    left: frame.centerX - targetOffset,
                    top: frame.centerY - 1,
                    width: CAMERA_FOCUS_TARGET_SIZE,
                }}
            />
            <View
                className="absolute bg-sky-300"
                style={{
                    height: CAMERA_FOCUS_TARGET_SIZE,
                    left: frame.centerX - 1,
                    top: frame.centerY - targetOffset,
                    width: 2,
                }}
            />
            <View
                className="absolute rounded-md bg-sky-500 px-2 py-1"
                style={{
                    left: labelLeft,
                    top: labelTop,
                    width: CAMERA_FOCUS_LABEL_WIDTH,
                }}
            >
                <Text
                    className="text-[10px] font-bold uppercase text-white"
                    numberOfLines={1}
                >
                    {focusState.label}
                </Text>
            </View>
        </View>
    );
}
