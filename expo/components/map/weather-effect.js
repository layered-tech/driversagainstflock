import Mapbox from '@rnmapbox/maps';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, UIManager } from 'react-native';
import { getWeatherEffectStyle } from './weather-profiles';
import { useWeatherSurface, weatherStore } from './weather-runtime';

export function WeatherEffect({ car, styleKey }) {
    const weather = useWeatherSurface(car);
    const target = weather.rendered;
    const [effect, setEffect] = useState(null);
    const [visible, setVisible] = useState(false);
    const currentRef = useRef(null);
    const rendererToken = useRef({});
    const profiles = weather.preferences.profiles;
    const style = useMemo(
        () =>
            effect ? getWeatherEffectStyle(profiles[effect], visible) : null,
        [effect, profiles, visible],
    );
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
        });
    }, [car, effect, visible, supported, styleKey]);

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
