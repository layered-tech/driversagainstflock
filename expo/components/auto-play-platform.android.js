import { AndroidAutoMapSurface } from './android-auto-map-surface';

// Android Auto extension of the platform-agnostic auto-play core.
export const autoPlayPlatform = {
  MapSurface: AndroidAutoMapSurface,
  keepsSearchTemplateUnderRoutePreview: true,
  maneuverCardAppearance: 'dark',
  maneuverCardIconColor: '#ffffff',
  // Android Auto owns the pan affordance in the map action strip. Keeping the
  // old driving-mode toggle in the header made it look like the required pan
  // action had been replaced even though the host may hide PAN on touch units.
  usesHeaderDrivingModeButton: false,

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
