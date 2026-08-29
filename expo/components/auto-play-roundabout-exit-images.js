const ROUNDABOUT_EXIT_IMAGES = {
    1: require('../assets/auto-play/roundabout-exits/roundabout-exit-1.png'),
    2: require('../assets/auto-play/roundabout-exits/roundabout-exit-2.png'),
    3: require('../assets/auto-play/roundabout-exits/roundabout-exit-3.png'),
    4: require('../assets/auto-play/roundabout-exits/roundabout-exit-4.png'),
    5: require('../assets/auto-play/roundabout-exits/roundabout-exit-5.png'),
    6: require('../assets/auto-play/roundabout-exits/roundabout-exit-6.png'),
    7: require('../assets/auto-play/roundabout-exits/roundabout-exit-7.png'),
    8: require('../assets/auto-play/roundabout-exits/roundabout-exit-8.png'),
    9: require('../assets/auto-play/roundabout-exits/roundabout-exit-9.png'),
    10: require('../assets/auto-play/roundabout-exits/roundabout-exit-10.png'),
    11: require('../assets/auto-play/roundabout-exits/roundabout-exit-11.png'),
    12: require('../assets/auto-play/roundabout-exits/roundabout-exit-12.png'),
    13: require('../assets/auto-play/roundabout-exits/roundabout-exit-13.png'),
    14: require('../assets/auto-play/roundabout-exits/roundabout-exit-14.png'),
    15: require('../assets/auto-play/roundabout-exits/roundabout-exit-15.png'),
    16: require('../assets/auto-play/roundabout-exits/roundabout-exit-16.png'),
    17: require('../assets/auto-play/roundabout-exits/roundabout-exit-17.png'),
    18: require('../assets/auto-play/roundabout-exits/roundabout-exit-18.png'),
    19: require('../assets/auto-play/roundabout-exits/roundabout-exit-19.png'),
};

export function getAutoPlayRoundaboutExitImage(exitNumber) {
    const normalizedExitNumber = Number(exitNumber);

    if (!Number.isInteger(normalizedExitNumber)) {
        return null;
    }

    return ROUNDABOUT_EXIT_IMAGES[normalizedExitNumber] ?? null;
}
