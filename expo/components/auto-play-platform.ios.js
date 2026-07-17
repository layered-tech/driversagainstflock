import { CarPlayMapSurface } from './carplay-map-surface';

// CarPlay extension of the platform-agnostic auto-play core.
export const autoPlayPlatform = {
    MapSurface: CarPlayMapSurface,
    publishesSearchTemplateResultsToMap: true,
    supportsSearchAutocomplete: false,
    usesHeaderExitNavigationButton: true,

    getMapTemplatePlatformConfig() {
        // Double-tap zoom and the AUTO_DRIVE handshake are Android Auto concepts;
        // CarPlay zooms through the map buttons and pinch gesture callbacks.
        return {};
    },

    registerPlatformListeners({ autoPlayModule, makeGlyphImage }) {
        const { CarPlayDashboard } = autoPlayModule;

        // The CarPlay dashboard tile renders the same map surface. CarPlay keeps
        // the scene hidden until at least one shortcut button is configured.
        CarPlayDashboard.setComponent(CarPlayMapSurface);
        CarPlayDashboard.setButtons([
            {
                image: makeGlyphImage('location'),
                launchHeadUnitScene: true,
                onPress: () => {},
                subtitleVariants: ['Open the live map'],
                titleVariants: ['Drivers Against Flock'],
            },
        ]);
    },
};
