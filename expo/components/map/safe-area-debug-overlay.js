import { View } from 'react-native';

function getInsetDelta(outerInsets, innerInsets, edge) {
    return Math.max(
        (innerInsets?.[edge] ?? outerInsets[edge]) - outerInsets[edge],
        0,
    );
}

export function SafeAreaDebugOverlay({ controlInsets, insets }) {
    const controlTopInset = getInsetDelta(insets, controlInsets, 'top');
    const controlRightInset = getInsetDelta(insets, controlInsets, 'right');
    const controlBottomInset = getInsetDelta(insets, controlInsets, 'bottom');
    const controlLeftInset = getInsetDelta(insets, controlInsets, 'left');

    return (
        <View className="absolute inset-0 z-50" pointerEvents="none">
            <View
                className="absolute left-0 right-0 top-0 bg-emerald-500/30"
                style={{
                    height: insets.top,
                }}
            />
            <View
                className="absolute bottom-0 left-0 right-0 bg-emerald-500/30"
                style={{
                    height: insets.bottom,
                }}
            />
            <View
                className="absolute bottom-0 left-0 top-0 bg-emerald-500/30"
                style={{
                    width: insets.left,
                }}
            />
            <View
                className="absolute bottom-0 right-0 top-0 bg-emerald-500/30"
                style={{
                    width: insets.right,
                }}
            />
            <View
                className="absolute border-2 border-emerald-500"
                style={{
                    bottom: insets.bottom,
                    left: insets.left,
                    right: insets.right,
                    top: insets.top,
                }}
            />
            <View
                className="absolute bg-red-500/25"
                style={{
                    left: insets.left,
                    top: insets.top,
                    right: insets.right,
                    height: controlTopInset,
                }}
            />
            <View
                className="absolute bg-red-500/25"
                style={{
                    bottom: insets.bottom,
                    left: insets.left,
                    right: insets.right,
                    height: controlBottomInset,
                }}
            />
            <View
                className="absolute bg-red-500/25"
                style={{
                    bottom: controlInsets?.bottom ?? insets.bottom,
                    left: insets.left,
                    top: controlInsets?.top ?? insets.top,
                    width: controlLeftInset,
                }}
            />
            <View
                className="absolute bg-red-500/25"
                style={{
                    bottom: controlInsets?.bottom ?? insets.bottom,
                    right: insets.right,
                    top: controlInsets?.top ?? insets.top,
                    width: controlRightInset,
                }}
            />
            <View
                className="absolute border-2 border-red-500"
                style={{
                    bottom: controlInsets?.bottom ?? insets.bottom,
                    left: controlInsets?.left ?? insets.left,
                    right: controlInsets?.right ?? insets.right,
                    top: controlInsets?.top ?? insets.top,
                }}
            />
        </View>
    );
}
