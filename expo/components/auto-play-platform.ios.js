import { createCarPlayVoiceSearchController } from './auto-play-carplay-voice-search';
import { CarPlayDashboardSurface } from './carplay-dashboard-surface';
import { CarPlayMapSurface } from './carplay-map-surface';

let voiceSearchController;

function applyDashboardButtons(CarPlayDashboard, makeGlyphImage) {
    CarPlayDashboard.setButtons([
        {
            image: makeGlyphImage('location'),
            launchHeadUnitScene: true,
            onPress: () => {},
            subtitleVariants: ['Find a destination'],
            titleVariants: ['Open map'],
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

        // Dashboard runs in a secondary CarPlay scene, so it owns a surface
        // that waits for that scene before mounting Mapbox and shows routing
        // status alongside it. A shortcut is still required for visibility.
        CarPlayDashboard.setComponent(CarPlayDashboardSurface);
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
