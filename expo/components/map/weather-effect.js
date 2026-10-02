import Mapbox from '@rnmapbox/maps';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, UIManager } from 'react-native';
import {
    getIntensityWeatherProfile,
    getWeatherEffectStyle,
} from './weather-profiles';
import { useWeatherSurface, weatherStore } from './weather-runtime';

export function WeatherEffect({ car, styleKey }) {
    const weather = useWeatherSurface(car);
    const target = weather.rendered;
    const [effect, setEffect] = useState(null);
    const [visible, setVisible] = useState(false);
    const currentRef = useRef(null);
    const rendererToken = useRef({});
    const lastIntensityBucket = useRef('Baseline');
    const profiles = weather.preferences.profiles;
    const intensityBucket =
        effect === target
            ? (weather.renderedIntensityBucket ?? 'Baseline')
            : lastIntensityBucket.current;
    const style = useMemo(
        () =>
            effect
                ? getWeatherEffectStyle(
                      getIntensityWeatherProfile(
                          profiles[effect],
                          intensityBucket,
                      ),
                      visible,
                  )
                : null,
        [effect, profiles, visible, intensityBucket],
    );
    useEffect(() => {
        if (effect === target) {
            lastIntensityBucket.current = intensityBucket;
        }
    }, [effect, target, intensityBucket]);
    const Component = effect === 'Rain' ? Mapbox.Rain : Mapbox.Snow;
    let supported =
        ['ios', 'android'].includes(Platform.OS) && Boolean(Component);
    if (
        supported &&
        effect &&
        typeof UIManager?.getViewManagerConfig === 'function'
    ) {
        try {
            supported = Boolean(
                UIManager.getViewManagerConfig(`RNMBX${effect}`),
            );
        } catch {
            supported = false;
        }
    }

    useEffect(() => {
        const token = rendererToken.current;
        return () => weatherStore.removeRenderer(token);
    }, []);
    useEffect(() => {
        weatherStore.reportRenderer(rendererToken.current, {
            surface: car ? 'Car' : 'Phone',
            effect: supported ? effect : null,
            visible: supported && visible,
            supported,
            styleKey,
            intensityBucket,
            density: style?.density ?? 0,
        });
    }, [
        car,
        effect,
        visible,
        supported,
        styleKey,
        intensityBucket,
        style?.density,
    ]);

    useEffect(() => {
        let fadeTimer;
        let appearTimer;
        const current = currentRef.current;
        const show = () => {
            currentRef.current = target;
            setEffect(target);
            setVisible(false);
            if (target) {
                // Native effect attaches at zero before its opacity transition.
                appearTimer = setTimeout(() => setVisible(true), 32);
            }
        };
        if (current && current !== target) {
            setVisible(false);
            const profile = profiles[current];
            fadeTimer = setTimeout(
                show,
                (profile.transitionDuration + profile.transitionDelay) * 1000,
            );
        } else if (current !== target) {
            show();
        } else {
            setVisible(Boolean(target));
        }
        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(appearTimer);
        };
    }, [target, profiles]);

    if (!effect || !supported) {
        return null;
    }
    return <Component key={`${effect}-${styleKey}`} style={style} />;
}
