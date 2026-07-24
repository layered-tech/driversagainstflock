import { CarPlayDashboard } from '@iternio/react-native-auto-play';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAutoPlayState } from './auto-play-state';
import { CarPlayMapSurface } from './carplay-map-surface';

function normalizeColorScheme(colorScheme) {
    return colorScheme === 'dark' ? 'dark' : 'light';
}

function getCarPlayDashboardPresentation(autoPlayState) {
    const routeLoadingDestination = String(
        autoPlayState.routeLoading?.destinationLabel ?? '',
    ).trim();
    const routeEstimate = [
        autoPlayState.routeDurationText,
        autoPlayState.routeDistanceText,
    ]
        .filter(Boolean)
        .join(' • ');

    if (autoPlayState.routeLoading) {
        return {
            detail: 'Loading navigation options.',
            isLoading: true,
            status: 'Finding route',
            title: routeLoadingDestination || 'Preparing your route',
        };
    }

    if (autoPlayState.errorText) {
        return {
            detail: autoPlayState.errorText,
            isLoading: false,
            status: autoPlayState.statusLabel || 'Needs attention',
            title: autoPlayState.title || 'Navigation needs attention',
        };
    }

    if (autoPlayState.isNavigating) {
        return {
            detail:
                routeEstimate ||
                autoPlayState.routeName ||
                'Navigation is active.',
            isLoading: false,
            status: 'Navigating',
            title:
                autoPlayState.maneuverText ||
                autoPlayState.detailText ||
                'Guidance active',
        };
    }

    if (autoPlayState.directionsRoute) {
        return {
            detail:
                routeEstimate ||
                autoPlayState.detailText ||
                'Review the route on the live map.',
            isLoading: false,
            status: 'Route ready',
            title: autoPlayState.title || 'Destination',
        };
    }

    return {
        detail: 'Open the live map to choose a destination.',
        isLoading: false,
        status: 'Drivers Against Flock',
        title: 'Ready to navigate',
    };
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

function CarPlayDashboardStatusCard({ isVisible, presentation }) {
    return (
        <View
            accessibilityLabel={`${presentation.status}. ${presentation.title}. ${presentation.detail}`}
            accessibilityLiveRegion="polite"
            className="absolute inset-x-4 bottom-4"
            pointerEvents="none"
            testID="carplay-dashboard-status-card"
        >
            <View className="dark:border-daf-border-glass-dark dark:bg-daf-surface-dark/95 flex-row items-center gap-3 rounded-dafMd border border-daf-border-glass bg-white/95 px-4 py-3 shadow-[0px_4px_18px_rgba(11,14,18,0.22)]">
                {presentation.isLoading || !isVisible ? (
                    <ActivityIndicator color="#2563eb" size="small" />
                ) : null}
                <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-[12px] font-semibold leading-[16px] text-daf-text-tertiary dark:text-neutral-400">
                        {presentation.status}
                    </Text>
                    <Text
                        className="text-[17px] font-bold leading-[21px] text-daf-text-primary dark:text-white"
                        numberOfLines={1}
                    >
                        {presentation.title}
                    </Text>
                    <Text
                        className="text-[13px] leading-[17px] text-daf-text-secondary dark:text-neutral-300"
                        numberOfLines={2}
                    >
                        {presentation.detail}
                    </Text>
                </View>
            </View>
        </View>
    );
}

// Dashboard has its own UIWindow. Delay Mapbox until CarPlay reports that the
// scene is active so it attaches to the Dashboard pane rather than a hidden
// window. The status card remains available even if the map takes longer.
export function CarPlayDashboardSurface(props) {
    const autoPlayState = useAutoPlayState();
    const { colorScheme, isVisible } = useCarPlayDashboardVisibility(
        props?.colorScheme,
    );
    const presentation = useMemo(
        () => getCarPlayDashboardPresentation(autoPlayState),
        [autoPlayState],
    );

    return (
        <View className="flex-1">
            {isVisible ? (
                <CarPlayMapSurface {...props} colorScheme={colorScheme} />
            ) : (
                <View className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]" />
            )}
            <CarPlayDashboardStatusCard
                isVisible={isVisible}
                presentation={presentation}
            />
        </View>
    );
}
