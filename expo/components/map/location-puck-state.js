export function shouldShowNavigationPuck({
    isDrivingMode,
    isFollowing,
    navigationPuckVariant,
}) {
    return (
        isDrivingMode || isFollowing || navigationPuckVariant === 'auto-play'
    );
}

export function shouldUseAutoPlayNavigationPuckImages(navigationPuckVariant) {
    return navigationPuckVariant === 'auto-play';
}
