import { AppState } from 'react-native';
import { IS_AUTOMOTIVE } from '../lib/app-target';
import {
    automotiveLocationPermissions,
    subscribeAutomotiveLocationReady,
} from './automotive/runtime';
import { openAutomotiveSetup } from './automotive/native';
import { AndroidAutoMapSurface } from './android-auto-map-surface';
import { AutoPlayClusterSurface } from './auto-play-cluster-surface';
import { androidInstrumentClusterEnabled } from '../car-display-config';

// Android Auto extension of the platform-agnostic auto-play core.
export const autoPlayPlatform = {
    MapSurface: AndroidAutoMapSurface,
    isAutomotive: IS_AUTOMOTIVE,
    openSetup: IS_AUTOMOTIVE ? openAutomotiveSetup : undefined,
    async prepareSession() {
        if (!IS_AUTOMOTIVE) return;
        const state = await automotiveLocationPermissions.ensure();
        if (!state.ready) throw new Error(state.message);
    },
    async ensureLocation() {
        if (!IS_AUTOMOTIVE) return;
        const state = await automotiveLocationPermissions.ensure({
            request: false,
        });
        if (!state.ready) throw new Error(state.message);
    },
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
                android: [
                    searchAction,
                    ...(IS_AUTOMOTIVE
                        ? [
                              {
                                  type: 'text',
                                  title: 'Car setup',
                                  onPress: () => {
                                      void openAutomotiveSetup().catch(
                                          () => {},
                                      );
                                  },
                              },
                          ]
                        : []),
                ],
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
    buttonIconColor: 'default',
    maneuverCardAppearance: 'dark',
    maneuverCardIconColor: '#ffffff',
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
        onLocationReady,
    }) {
        if (IS_AUTOMOTIVE) {
            subscribeAutomotiveLocationReady(onLocationReady);
            AppState.addEventListener('change', () => {
                void automotiveLocationPermissions
                    .ensure({ request: false })
                    .catch(() => {});
            });
        }
        if (androidInstrumentClusterEnabled) {
            autoPlayModule.AutoPlayCluster.setComponent(
                AutoPlayClusterSurface,
            ).catch(() => {});
        }
        autoPlayModule.HybridAutoPlay.addListenerRenderState(
            'AutoPlayRoot',
            onSessionRenderState,
        );
        // Upstream reports only coordinates and query for Android Auto voice requests.
        autoPlayModule.HybridAutoPlay.addListenerVoiceInput(
            (coordinates, query) => onVoiceNavigation(coordinates, query),
        );
    },
};
