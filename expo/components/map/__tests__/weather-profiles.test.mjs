import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getWeatherEffectStyle,
    restoreWeatherSettings,
    validateWeatherProfile,
    WEATHER_PROFILE_DEFAULTS,
} from '../weather-profiles.js';

test('all initial profiles validate and have explicit density, vignette, and colors', () => {
    for (const condition of ['Rain', 'Snow']) {
        const profile = WEATHER_PROFILE_DEFAULTS[condition];
        assert.equal(validateWeatherProfile(condition, profile), null);
        const style = getWeatherEffectStyle(profile);
        assert.equal(style.vignette, 0);
        assert.ok(style.density > 0);
        assert.match(style.color, /^#/);
        assert.match(style.vignetteColor, /^#/);
        assert.deepEqual(style.opacityTransition, { duration: 2000, delay: 0 });
        assert.equal('transitionDuration' in style, false);
        assert.equal(getWeatherEffectStyle(profile, false).density, 0);
        assert.equal(getWeatherEffectStyle(profile, false).opacity, 0);
    }
});

test('profile validation rejects nonfinite, out of range, empty, and unknown properties', () => {
    const snow = WEATHER_PROFILE_DEFAULTS.Snow;
    for (const edit of [
        { opacity: NaN },
        { opacity: Infinity },
        { density: -1 },
        { flakeSize: 6 },
        { direction: [361, 0] },
        { direction: [0] },
        { color: 'red' },
        { vignetteColor: '#xyxyxy' },
        { transitionDuration: 11 },
        { transitionDelay: -1 },
        { intensity: null },
        { foo: 3 },
    ]) {
        assert.ok(validateWeatherProfile('Snow', { ...snow, ...edit }));
    }
    assert.ok(
        validateWeatherProfile('Rain', {
            ...WEATHER_PROFILE_DEFAULTS.Rain,
            dropletSize: [51, 3],
        }),
    );
    assert.equal(
        validateWeatherProfile('Snow', {
            ...snow,
            direction: [0, 360],
            flakeSize: 5,
            opacity: 1,
            color: '#ffffffff',
            transitionDelay: 10,
        }),
        null,
    );
});

test('restoration preserves valid appearance and disabled preference but discards forced modes', () => {
    const profiles = {
        ...WEATHER_PROFILE_DEFAULTS,
        Rain: { ...WEATHER_PROFILE_DEFAULTS.Rain, density: 0.4 },
    };
    const restored = restoreWeatherSettings({
        enabled: false,
        profiles,
        mode: 'Rain',
    });
    assert.equal(restored.enabled, false);
    assert.equal(restored.profiles.Rain.density, 0.4);
    assert.equal('mode' in restored, false);
    assert.deepEqual(
        restoreWeatherSettings({ profiles: { Snow: { color: 'invalid' } } })
            .profiles.Snow,
        WEATHER_PROFILE_DEFAULTS.Snow,
    );
});
