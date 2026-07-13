export function shouldShowNavigationPuck({
    isFollowing,
    navigationPuckVariant,
}) {
    return isFollowing || navigationPuckVariant === 'auto-play';
}

export function shouldUseAutoPlayNavigationPuckImages(navigationPuckVariant) {
    return navigationPuckVariant === 'auto-play';
}
