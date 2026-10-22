// One visual tuning factor for app-owned navigation overlays on Apple displays.
// Bitmap image density is handled separately by the native image loader.
export function getMapPresentationScale(platform) {
    return platform === 'ios' ? 0.85 : 1;
}
