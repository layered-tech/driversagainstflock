const COMPASS_DIRECTION_COUNT = 32;
const COMPASS_DIRECTION_STEP_DEGREES = 360 / COMPASS_DIRECTION_COUNT;

// These PNG silhouettes use the pointer geometry from Font Awesome Free's
// solid compass icon. Android Auto receives only these raster assets.
const DARK_COMPASS_NEEDLE_IMAGES = [
    require('../assets/auto-play/compass/compass-dark-0.png'),
    require('../assets/auto-play/compass/compass-dark-1.png'),
    require('../assets/auto-play/compass/compass-dark-2.png'),
    require('../assets/auto-play/compass/compass-dark-3.png'),
    require('../assets/auto-play/compass/compass-dark-4.png'),
    require('../assets/auto-play/compass/compass-dark-5.png'),
    require('../assets/auto-play/compass/compass-dark-6.png'),
    require('../assets/auto-play/compass/compass-dark-7.png'),
    require('../assets/auto-play/compass/compass-dark-8.png'),
    require('../assets/auto-play/compass/compass-dark-9.png'),
    require('../assets/auto-play/compass/compass-dark-10.png'),
    require('../assets/auto-play/compass/compass-dark-11.png'),
    require('../assets/auto-play/compass/compass-dark-12.png'),
    require('../assets/auto-play/compass/compass-dark-13.png'),
    require('../assets/auto-play/compass/compass-dark-14.png'),
    require('../assets/auto-play/compass/compass-dark-15.png'),
    require('../assets/auto-play/compass/compass-dark-16.png'),
    require('../assets/auto-play/compass/compass-dark-17.png'),
    require('../assets/auto-play/compass/compass-dark-18.png'),
    require('../assets/auto-play/compass/compass-dark-19.png'),
    require('../assets/auto-play/compass/compass-dark-20.png'),
    require('../assets/auto-play/compass/compass-dark-21.png'),
    require('../assets/auto-play/compass/compass-dark-22.png'),
    require('../assets/auto-play/compass/compass-dark-23.png'),
    require('../assets/auto-play/compass/compass-dark-24.png'),
    require('../assets/auto-play/compass/compass-dark-25.png'),
    require('../assets/auto-play/compass/compass-dark-26.png'),
    require('../assets/auto-play/compass/compass-dark-27.png'),
    require('../assets/auto-play/compass/compass-dark-28.png'),
    require('../assets/auto-play/compass/compass-dark-29.png'),
    require('../assets/auto-play/compass/compass-dark-30.png'),
    require('../assets/auto-play/compass/compass-dark-31.png'),
];

const LIGHT_COMPASS_NEEDLE_IMAGES = [
    require('../assets/auto-play/compass/compass-light-0.png'),
    require('../assets/auto-play/compass/compass-light-1.png'),
    require('../assets/auto-play/compass/compass-light-2.png'),
    require('../assets/auto-play/compass/compass-light-3.png'),
    require('../assets/auto-play/compass/compass-light-4.png'),
    require('../assets/auto-play/compass/compass-light-5.png'),
    require('../assets/auto-play/compass/compass-light-6.png'),
    require('../assets/auto-play/compass/compass-light-7.png'),
    require('../assets/auto-play/compass/compass-light-8.png'),
    require('../assets/auto-play/compass/compass-light-9.png'),
    require('../assets/auto-play/compass/compass-light-10.png'),
    require('../assets/auto-play/compass/compass-light-11.png'),
    require('../assets/auto-play/compass/compass-light-12.png'),
    require('../assets/auto-play/compass/compass-light-13.png'),
    require('../assets/auto-play/compass/compass-light-14.png'),
    require('../assets/auto-play/compass/compass-light-15.png'),
    require('../assets/auto-play/compass/compass-light-16.png'),
    require('../assets/auto-play/compass/compass-light-17.png'),
    require('../assets/auto-play/compass/compass-light-18.png'),
    require('../assets/auto-play/compass/compass-light-19.png'),
    require('../assets/auto-play/compass/compass-light-20.png'),
    require('../assets/auto-play/compass/compass-light-21.png'),
    require('../assets/auto-play/compass/compass-light-22.png'),
    require('../assets/auto-play/compass/compass-light-23.png'),
    require('../assets/auto-play/compass/compass-light-24.png'),
    require('../assets/auto-play/compass/compass-light-25.png'),
    require('../assets/auto-play/compass/compass-light-26.png'),
    require('../assets/auto-play/compass/compass-light-27.png'),
    require('../assets/auto-play/compass/compass-light-28.png'),
    require('../assets/auto-play/compass/compass-light-29.png'),
    require('../assets/auto-play/compass/compass-light-30.png'),
    require('../assets/auto-play/compass/compass-light-31.png'),
];

function normalizeCompassDirectionIndex(directionIndex) {
    const numericDirectionIndex = Number(directionIndex);

    if (!Number.isFinite(numericDirectionIndex)) {
        return 0;
    }

    return (
        ((Math.round(numericDirectionIndex) % COMPASS_DIRECTION_COUNT) +
            COMPASS_DIRECTION_COUNT) %
        COMPASS_DIRECTION_COUNT
    );
}

export function getAutoPlayCompassNorthDirection(cameraHeading) {
    const numericCameraHeading = Number(cameraHeading);

    if (!Number.isFinite(numericCameraHeading)) {
        return 0;
    }

    const northRelativeToCamera =
        ((-numericCameraHeading % 360) + 360) % 360;

    return normalizeCompassDirectionIndex(
        northRelativeToCamera / COMPASS_DIRECTION_STEP_DEGREES,
    );
}

export function getAutoPlayCompassNeedleImage(
    directionIndex,
    usesDarkAppearance,
) {
    const images = usesDarkAppearance
        ? DARK_COMPASS_NEEDLE_IMAGES
        : LIGHT_COMPASS_NEEDLE_IMAGES;

    return images[normalizeCompassDirectionIndex(directionIndex)];
}
