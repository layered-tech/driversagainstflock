import { createCarPlayVoiceSearchController } from './auto-play-carplay-voice-search';
import { CarPlayMapSurface } from './carplay-map-surface';

let voiceSearchController;

function applyDashboardButtons(CarPlayDashboard, makeGlyphImage) {
    CarPlayDashboard.setButtons([
        {
            image: makeGlyphImage('location'),
            launchHeadUnitScene: true,
            onPress: () => {},
            subtitleVariants: ['Open the live map'],
            titleVariants: ['Drivers Against Flock'],
        },
    ]);
}

// CarPlay extension of the platform-agnostic auto-play core.
export const autoPlayPlatform = {
    MapSurface: CarPlayMapSurface,
    presentsVoiceSearchResultsInList: true,
    publishesSearchTemplateResultsToMap: true,
    supportsSearchAutocomplete: false,
    usesHeaderDrivingModeButton: false,
    usesHeaderExitNavigationButton: true,

    cancelSearchVoiceInput() {
        voiceSearchController?.cancel();
    },

    startSearchVoiceInput(callbacks) {
        return voiceSearchController?.start(callbacks) ?? false;
    },

    getMapTemplatePlatformConfig() {
        // Double-tap zoom and the AUTO_DRIVE handshake are Android Auto concepts;
        // CarPlay zooms through the map buttons and pinch gesture callbacks.
        return {};
    },

    registerPlatformListeners({
        autoPlayModule,
        makeGlyphImage,
        onVoiceNavigation,
    }) {
        const { CarPlayDashboard, HybridAutoPlay } = autoPlayModule;

        voiceSearchController?.cancel();
        const registeredVoiceSearchController =
            createCarPlayVoiceSearchController({
                getHybridAutoPlay: () => HybridAutoPlay,
                onVoiceNavigation,
            });
        voiceSearchController = registeredVoiceSearchController;

        // The CarPlay dashboard tile renders the same map surface. CarPlay keeps
        // the scene hidden until at least one shortcut button is configured.
        CarPlayDashboard.setComponent(CarPlayMapSurface);
        applyDashboardButtons(CarPlayDashboard, makeGlyphImage);
        CarPlayDashboard.addListener('didConnect', () => {
            applyDashboardButtons(CarPlayDashboard, makeGlyphImage);
        });
        HybridAutoPlay.addListenerVoiceInput(
            (coordinates, query, requestType) => {
                registeredVoiceSearchController.handleNativeEvent(
                    coordinates,
                    query,
                    requestType,
                );
            },
        );
    },
};
