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
    createErrorTemplate({ autoPlayModule, alertMessage, searchAction }) {
        const { MessageTemplate } = autoPlayModule;

        return new MessageTemplate({
            actions: {
                ios: [searchAction],
            },
            message: alertMessage,
        });
    },
    logAction(action, payload = {}) {
        if (typeof __DEV__ === 'undefined' || !__DEV__) {
            return;
        }

        console.log(`[CarPlay] ${action}`, payload);
    },
    presentsVoiceSearchResultsInList: true,
    publishesSearchTemplateResultsToMap: true,
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
        onSessionRenderState,
        onVoiceNavigation,
    }) {
        const { CarPlayDashboard, ErrorUtil, HybridAutoPlay, HybridVoice } =
            autoPlayModule;

        voiceSearchController?.cancel();
        const registeredVoiceSearchController =
            createCarPlayVoiceSearchController({
                getHybridVoice: () => HybridVoice,
                isVoiceInputCanceledError: ErrorUtil.isVoiceInputCanceledError,
                onVoiceNavigation,
            });
        voiceSearchController = registeredVoiceSearchController;

        // Dashboard runs in a secondary CarPlay scene, so it owns a surface
        // that waits for that scene before mounting Mapbox. A shortcut is still
        // required for visibility.
        CarPlayDashboard.setComponent(CarPlayDashboardSurface);
        applyDashboardButtons(CarPlayDashboard, makeGlyphImage);
        CarPlayDashboard.addListener('didConnect', () => {
            applyDashboardButtons(CarPlayDashboard, makeGlyphImage);
        });
        HybridAutoPlay.addListenerRenderState(
            'AutoPlayRoot',
            onSessionRenderState,
        );
    },
};
