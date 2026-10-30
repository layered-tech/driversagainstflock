import { AutoPlayClusterSurface } from './auto-play-cluster-surface';
import { carPlayInstrumentClusterEnabled } from '../car-display-config';
import { createCarPlayVoiceSearchController } from './auto-play-carplay-voice-search';
import { prepareCarPlaySearchMap } from './auto-play-search-template-lifecycle';
import { CarPlayDashboardSurface } from './carplay-dashboard-surface';
import { CarPlayMapSurface } from './carplay-map-surface';
import { getCarPlayE2EVoice } from './map/carplay-e2e-fixture';

let voiceSearchController;
let refreshDashboardButtons;

function applyDashboardButtons({
    CarPlayDashboard,
    makeGlyphImage,
    onDashboardAction,
    primaryLocations,
}) {
    const buttons = [
        {
            image: makeGlyphImage('search'),
            launchHeadUnitScene: true,
            onPress: () => onDashboardAction('search'),
            subtitleVariants: [],
            titleVariants: ['Search'],
        },
    ];
    const primaryType = primaryLocations?.home
        ? 'home'
        : primaryLocations?.work
          ? 'work'
          : null;

    if (primaryType) {
        buttons.push({
            image: makeGlyphImage(
                primaryType === 'home' ? 'house' : 'briefcase',
            ),
            launchHeadUnitScene: true,
            onPress: () => onDashboardAction(primaryType),
            subtitleVariants: [],
            titleVariants: [primaryType === 'home' ? 'Home' : 'Work'],
        });
    }

    CarPlayDashboard.setButtons(buttons);
}

// CarPlay extension of the platform-agnostic auto-play core.
export const autoPlayPlatform = {
    MapSurface: CarPlayMapSurface,
    usesHostButtonColors: true,
    prepareSearchMap(options) {
        return prepareCarPlaySearchMap(options);
    },
    createErrorTemplate({ autoPlayModule, alertMessage, searchAction }) {
        const { HybridAutoPlay, MessageTemplate } = autoPlayModule;
        const recoverSearchAction = {
            ...searchAction,
            onPress: async () => {
                await HybridAutoPlay.popTemplate();
                searchAction.onPress();
            },
        };

        return new MessageTemplate({
            actions: {
                ios: [recoverSearchAction],
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
    opensSavedDestinationsBeforeSearch: true,
    usesHeaderExitNavigationButton: true,
    usesPanZoomControlsOnly: true,
    autoHidesNavigationHeader: true,

    updateDashboardButtons() {
        refreshDashboardButtons?.();
    },

    cancelSearchVoiceInput() {
        voiceSearchController?.cancel();
    },

    startSearchVoiceInput(callbacks) {
        return voiceSearchController?.start(callbacks) ?? false;
    },

    getMapTemplatePlatformConfig() {
        // Double-tap zoom and the AUTO_DRIVE handshake are Android Auto concepts;
        // CarPlay zooms through the map buttons and pinch gesture callbacks.
        return {
            hideControls: 'none',
        };
    },

    registerPlatformListeners({
        autoPlayModule,
        getPrimaryLocations,
        makeGlyphImage,
        onDashboardAction,
        onSessionRenderState,
        onVoiceNavigation,
    }) {
        const { CarPlayDashboard, ErrorUtil, HybridAutoPlay, HybridVoice } =
            autoPlayModule;

        voiceSearchController?.cancel();
        const registeredVoiceSearchController =
            createCarPlayVoiceSearchController({
                getHybridVoice: () => getCarPlayE2EVoice(HybridVoice),
                isVoiceInputCanceledError: ErrorUtil.isVoiceInputCanceledError,
                onVoiceNavigation,
            });
        voiceSearchController = registeredVoiceSearchController;

        if (carPlayInstrumentClusterEnabled) {
            autoPlayModule.AutoPlayCluster.setComponent(
                AutoPlayClusterSurface,
            ).catch(() => {});
        }

        // Dashboard runs in a secondary CarPlay scene, so it owns a surface
        // that waits for that scene before mounting Mapbox. A shortcut is still
        // required for visibility.
        CarPlayDashboard.setComponent(CarPlayDashboardSurface);
        refreshDashboardButtons = () => {
            applyDashboardButtons({
                CarPlayDashboard,
                makeGlyphImage,
                onDashboardAction,
                primaryLocations: getPrimaryLocations(),
            });
        };
        refreshDashboardButtons();
        CarPlayDashboard.addListener('didConnect', () => {
            refreshDashboardButtons();
        });
        HybridAutoPlay.addListenerRenderState(
            'AutoPlayRoot',
            onSessionRenderState,
        );
    },
};
