import {
    AndroidAutoClusterSurface,
    AndroidAutoMapSurface,
} from './android-auto-map-surface';

// Android Auto extension of the platform-agnostic auto-play core.
export const autoPlayPlatform = {
    ClusterSurface: AndroidAutoClusterSurface,
    MapSurface: AndroidAutoMapSurface,
    createErrorTemplate({
        autoPlayModule,
        headerActions,
        message,
        searchAction,
        title,
    }) {
        const { InformationTemplate } = autoPlayModule;

        return new InformationTemplate({
            actions: {
                android: [searchAction],
            },
            headerActions,
            items: [
                {
                    detailedText: message,
                    title,
                    type: 'text',
                },
            ],
            title,
        });
    },
    logAction(action, payload = {}) {
        if (typeof __DEV__ === 'undefined' || !__DEV__) {
            return;
        }

        console.log(`[Android Auto] ${action}`, payload);
    },
    showsSearchResultsOnMap: true,
    maneuverCardAppearance: 'dark',
    maneuverCardIconColor: '#ffffff',
    usesSearchOnlyRootHeaderAction: true,
    usesDrivingMapViewButtonForDebugging: true,

    // MapTemplate callbacks that only exist on Android Auto: double-tap zoom
    // and the Play Store AUTO_DRIVE simulation handshake.
    getMapTemplatePlatformConfig({ onAutoDriveEnabled, onDoubleClickZoomIn }) {
        return {
            onAutoDriveEnabled,
            onDoubleClick: onDoubleClickZoomIn,
        };
    },

    registerPlatformListeners({
        autoPlayModule,
        onSessionRenderState,
        onVoiceNavigation,
    }) {
        autoPlayModule.HybridAutoPlay.addListenerRenderState(
            'AutoPlayRoot',
            onSessionRenderState,
        );
        // "Hey Google, navigate to…" style OS voice events only fire on Android.
        autoPlayModule.HybridAutoPlay.addListenerVoiceInput(onVoiceNavigation);
    },
};
