const MAPBOX_STANDARD_LIGHT_PRESET_AUTO = 'auto';
const MAPBOX_STANDARD_LIGHT_PRESET_DAY = 'day';
const MAPBOX_STANDARD_LIGHT_PRESET_NIGHT = 'night';

export function resolveAutoPlayMapLightPresetPreference({
    colorScheme,
    lightPresetPreference = MAPBOX_STANDARD_LIGHT_PRESET_AUTO,
    usesHostColorSchemeForAutomaticMapPreset = false,
}) {
    if (
        !usesHostColorSchemeForAutomaticMapPreset ||
        lightPresetPreference !== MAPBOX_STANDARD_LIGHT_PRESET_AUTO
    ) {
        return lightPresetPreference;
    }

    return colorScheme === 'dark'
        ? MAPBOX_STANDARD_LIGHT_PRESET_NIGHT
        : MAPBOX_STANDARD_LIGHT_PRESET_DAY;
}
