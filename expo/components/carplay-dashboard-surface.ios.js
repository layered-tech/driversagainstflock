import { CarPlayDashboard } from '@iternio/react-native-auto-play';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { CarPlayMapSurface } from './carplay-map-surface';

function normalizeColorScheme(colorScheme) {
    return colorScheme === 'dark' ? 'dark' : 'light';
}

function useCarPlayDashboardVisibility(initialColorScheme) {
    const [colorScheme, setColorScheme] = useState(() =>
        normalizeColorScheme(initialColorScheme),
    );
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setColorScheme(normalizeColorScheme(initialColorScheme));
    }, [initialColorScheme]);

    useEffect(() => {
        const removeRenderStateListener =
            CarPlayDashboard.addListenerRenderState((state) => {
                if (state === 'didAppear') {
                    setIsVisible(true);
                }

                if (state === 'didDisappear') {
                    setIsVisible(false);
                }
            });
        const removeColorSchemeListener =
            CarPlayDashboard.addListenerColorScheme((nextColorScheme) => {
                setColorScheme(normalizeColorScheme(nextColorScheme));
            });

        return () => {
            removeRenderStateListener?.();
            removeColorSchemeListener?.();
        };
    }, []);

    return { colorScheme, isVisible };
}

// Dashboard has its own UIWindow. Delay Mapbox until CarPlay reports that the
// scene is active so it attaches to the Dashboard pane rather than a hidden
// window.
export function CarPlayDashboardSurface(props) {
    const { colorScheme, isVisible } = useCarPlayDashboardVisibility(
        props?.colorScheme,
    );

    return (
        <View className="flex-1">
            {isVisible ? (
                <CarPlayMapSurface
                    {...props}
                    colorScheme={colorScheme}
                    showDrivingStatus
                />
            ) : (
                <View className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]" />
            )}
        </View>
    );
}
