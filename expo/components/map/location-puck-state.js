export function shouldShowNavigationPuck({
    isDrivingMode,
    navigationPuckVariant,
}) {
    return isDrivingMode || navigationPuckVariant === 'auto-play';
}

export function shouldUseAutoPlayNavigationPuckImages(navigationPuckVariant) {
    return navigationPuckVariant === 'auto-play';
}
