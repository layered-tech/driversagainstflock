export const WEATHER_PROFILE_DEFAULTS = Object.freeze({
    Rain: {
        density: 0.15,
        intensity: 0.35,
        opacity: 0.35,
        color: '#A8ADBC',
        centerThinning: 0.65,
        direction: [0, 80],
        dropletSize: [1, 10],
        distortionStrength: 0,
        vignette: 0,
        vignetteColor: '#464646',
        transitionDuration: 2,
        transitionDelay: 0,
    },
    Snow: {
        density: 0.2,
        intensity: 0.35,
        opacity: 0.65,
        color: '#FFFFFF',
        centerThinning: 0.65,
        direction: [0, 50],
        flakeSize: 0.7,
        vignette: 0,
        vignetteColor: '#FFFFFF',
        transitionDuration: 2,
        transitionDelay: 0,
    },
});

export const WEATHER_INTENSITY_DENSITY = Object.freeze({
    Light: 0.5,
    Baseline: 1,
    Heavy: 1.75,
    maximumHeavyDensity: 0.4,
});

export function getIntensityWeatherProfile(profile, bucket = 'Baseline') {
    const factor = ['Light', 'Heavy'].includes(bucket)
        ? WEATHER_INTENSITY_DENSITY[bucket]
        : 1;
    const maximum =
        bucket === 'Heavy'
            ? Math.max(
                  profile.density,
                  WEATHER_INTENSITY_DENSITY.maximumHeavyDensity,
              )
            : 1;
    return { ...profile, density: Math.min(maximum, profile.density * factor) };
}

export function validateWeatherProfile(condition, profile) {
    const defaults = WEATHER_PROFILE_DEFAULTS[condition];
    if (!defaults || !profile || typeof profile !== 'object') {
        return 'Unknown weather profile.';
    }
    for (const key of Object.keys(defaults)) {
        const value = profile[key];
        if (key === 'color' || key === 'vignetteColor') {
            if (
                typeof value !== 'string' ||
                !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)
            ) {
                return `${key} must be a six or eight digit hex color.`;
            }
        } else if (key === 'direction' || key === 'dropletSize') {
            const maximum = key === 'direction' ? 360 : 50;
            if (
                !Array.isArray(value) ||
                value.length !== 2 ||
                !value.every(
                    (number) =>
                        Number.isFinite(number) &&
                        number >= 0 &&
                        number <= maximum,
                )
            ) {
                return `${key} requires two finite values from 0 to ${maximum}.`;
            }
        } else {
            const maximum =
                key === 'flakeSize' ? 5 : key.startsWith('transition') ? 10 : 1;
            if (!Number.isFinite(value) || value < 0 || value > maximum) {
                return `${key} must be a finite value from 0 to ${maximum}.`;
            }
        }
    }
    if (Object.keys(profile).some((key) => !(key in defaults))) {
        return 'Unknown appearance property.';
    }
    return null;
}

export function restoreWeatherSettings(value) {
    const profiles = {};
    for (const condition of ['Rain', 'Snow']) {
        profiles[condition] = !validateWeatherProfile(
            condition,
            value?.profiles?.[condition],
        )
            ? value.profiles[condition]
            : { ...WEATHER_PROFILE_DEFAULTS[condition] };
    }
    return { enabled: value?.enabled !== false, profiles };
}

export function getWeatherEffectStyle(profile, visible = true) {
    const { transitionDuration, transitionDelay, ...style } = profile;
    const transition = {
        duration: transitionDuration * 1000,
        delay: transitionDelay * 1000,
    };
    return {
        ...style,
        opacity: visible ? style.opacity : 0,
        density: visible ? style.density : 0,
        vignette: visible ? style.vignette : 0,
        opacityTransition: transition,
        densityTransition: transition,
        vignetteTransition: transition,
    };
}
