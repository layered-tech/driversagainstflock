import {
    Easing,
    FadeIn,
    FadeOut,
    LinearTransition,
} from 'react-native-reanimated';

export const MAP_OVERLAY_LAYOUT_ANIMATION = LinearTransition.duration(
    220,
).easing(Easing.inOut(Easing.cubic));

export const SEARCH_RESULTS_ENTER_ANIMATION = FadeIn.duration(180);
export const SEARCH_RESULTS_EXIT_ANIMATION = FadeOut.duration(140);
