import { AndroidAutoMapSurface } from './android-auto-map-surface';

// Android Auto extension of the platform-agnostic auto-play core.
export const autoPlayPlatform = {
  MapSurface: AndroidAutoMapSurface,
  maneuverCardAppearance: 'dark',
  maneuverCardIconColor: '#ffffff',

  // MapTemplate callbacks that only exist on Android Auto: double-tap zoom
  // and the Play Store AUTO_DRIVE simulation handshake.
  getMapTemplatePlatformConfig({ onAutoDriveEnabled, onDoubleClickZoomIn }) {
    return {
      onAutoDriveEnabled,
      onDoubleClick: onDoubleClickZoomIn,
    };
  },

  registerPlatformListeners({ autoPlayModule, onVoiceNavigation }) {
    // "Hey Google, navigate to…" style OS voice events only fire on Android.
    autoPlayModule.HybridAutoPlay.addListenerVoiceInput(onVoiceNavigation);
  },
};
