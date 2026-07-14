function getInset(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}

export function getMapboxCompassSafeAreaInsets({ insets, platformOS }) {
    if (platformOS === 'ios') {
        return {
            bottom: 0,
            left: 0,
            top: 0,
        };
    }

    return {
        bottom: getInset(insets?.bottom),
        left: getInset(insets?.left),
        top: getInset(insets?.top),
    };
}
