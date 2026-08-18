const DARK_MAP_LIGHT_PRESETS = new Set(['dusk', 'night']);

export function mapLightPresetUsesDarkAppearance(mapLightPreset) {
    return DARK_MAP_LIGHT_PRESETS.has(mapLightPreset);
}
