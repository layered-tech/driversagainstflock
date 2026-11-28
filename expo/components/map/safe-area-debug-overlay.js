import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function getInsetDelta(outerInsets, innerInsets, edge) {
    return Math.max(
        (innerInsets?.[edge] ?? outerInsets[edge]) - outerInsets[edge],
        0,
    );
}

function formatInsets({ top, right, bottom, left }) {
    const [topPoints, rightPoints, bottomPoints, leftPoints] = [
        top,
        right,
        bottom,
        left,
    ].map((inset) => Math.round(inset * 10) / 10);

    return `T ${topPoints}  R ${rightPoints}  B ${bottomPoints}  L ${leftPoints}`;
}

export function SafeAreaDebugOverlay({
    controlInsets,
    insets,
    sceneInsets,
    surfaceLabel,
}) {
    const nativeInsets = useSafeAreaInsets();
    const [canvasSize, setCanvasSize] = useState('');
    const sourceInsets = sceneInsets ?? (surfaceLabel ? nativeInsets : insets);
    const controlTopInset = getInsetDelta(sourceInsets, controlInsets, 'top');
    const controlRightInset = getInsetDelta(
        sourceInsets,
        controlInsets,
        'right',
    );
    const controlBottomInset = getInsetDelta(
        sourceInsets,
        controlInsets,
        'bottom',
    );
    const controlLeftInset = getInsetDelta(sourceInsets, controlInsets, 'left');

    function handleLayout({ nativeEvent: { layout } }) {
        setCanvasSize(
            `${Math.round(layout.width)} × ${Math.round(layout.height)}`,
        );
    }

    return (
        <View
            className="absolute inset-0 z-50"
            onLayout={surfaceLabel ? handleLayout : undefined}
            pointerEvents="none"
            testID="safe-area-debug-overlay"
        >
            <View
                className="absolute left-0 right-0 top-0 bg-emerald-500/30"
                style={{
                    height: sourceInsets.top,
                }}
            />
            <View
                className="absolute bottom-0 left-0 right-0 bg-emerald-500/30"
                style={{
                    height: sourceInsets.bottom,
                }}
            />
            <View
                className="absolute bottom-0 left-0 top-0 bg-emerald-500/30"
                style={{
                    width: sourceInsets.left,
                }}
            />
            <View
                className="absolute bottom-0 right-0 top-0 bg-emerald-500/30"
                style={{
                    width: sourceInsets.right,
                }}
            />
            <View
                className="absolute border-2 border-emerald-500"
                style={sourceInsets}
                testID="safe-area-debug-source-frame"
            />
            <View
                className="absolute bg-red-500/25"
                style={{
                    left: sourceInsets.left,
                    top: sourceInsets.top,
                    right: sourceInsets.right,
                    height: controlTopInset,
                }}
            />
            <View
                className="absolute bg-red-500/25"
                style={{
                    bottom: sourceInsets.bottom,
                    left: sourceInsets.left,
                    right: sourceInsets.right,
                    height: controlBottomInset,
                }}
            />
            <View
                className="absolute bg-red-500/25"
                style={{
                    bottom: controlInsets?.bottom ?? sourceInsets.bottom,
                    left: sourceInsets.left,
                    top: controlInsets?.top ?? sourceInsets.top,
                    width: controlLeftInset,
                }}
            />
            <View
                className="absolute bg-red-500/25"
                style={{
                    bottom: controlInsets?.bottom ?? sourceInsets.bottom,
                    right: sourceInsets.right,
                    top: controlInsets?.top ?? sourceInsets.top,
                    width: controlRightInset,
                }}
            />
            <View
                className="absolute border-2 border-red-500"
                style={controlInsets ?? sourceInsets}
                testID="safe-area-debug-control-frame"
            />
            {surfaceLabel ? (
                <View
                    className="absolute items-end justify-center"
                    style={{
                        bottom:
                            Math.max(sourceInsets.bottom, nativeInsets.bottom) +
                            8,
                        left:
                            Math.max(sourceInsets.left, nativeInsets.left) + 8,
                        right:
                            Math.max(sourceInsets.right, nativeInsets.right) +
                            8,
                        top: Math.max(sourceInsets.top, nativeInsets.top) + 8,
                    }}
                >
                    <View className="gap-0.5 rounded-md bg-neutral-950/90 px-2 py-1">
                        <Text
                            className="text-[11px] font-bold text-white"
                            testID="safe-area-debug-surface"
                        >
                            {surfaceLabel}
                            {canvasSize ? ` · ${canvasSize} pt` : ''}
                        </Text>
                        <Text
                            className="text-[11px] text-emerald-300"
                            testID="safe-area-debug-source"
                        >
                            {sceneInsets ? 'Auto Play' : 'UIKit view'}{' '}
                            {formatInsets(sourceInsets)}
                        </Text>
                        {sceneInsets ? (
                            <Text
                                className="text-[11px] text-white"
                                testID="safe-area-debug-native"
                            >
                                UIKit view {formatInsets(nativeInsets)}
                            </Text>
                        ) : null}
                        <Text
                            className="text-[11px] text-white"
                            testID="safe-area-debug-map"
                        >
                            Map {formatInsets(insets)}
                        </Text>
                        {controlInsets ? (
                            <Text
                                className="text-[11px] text-red-300"
                                testID="safe-area-debug-controls"
                            >
                                Controls {formatInsets(controlInsets)}
                            </Text>
                        ) : null}
                    </View>
                </View>
            ) : null}
        </View>
    );
}
