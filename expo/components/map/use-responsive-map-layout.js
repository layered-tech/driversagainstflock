import { usePathname } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useSharedMapState } from './shared-map-state';
import { getResponsiveMapLayout } from './responsive-map-layout';

export function useResponsiveMapLayout() {
    const { width, height } = useWindowDimensions();
    const pathname = usePathname();
    const { drivingModeIsActive } = useSharedMapState();
    const navigationIsActive = pathname === '/' && drivingModeIsActive;

    return {
        ...getResponsiveMapLayout(width, navigationIsActive),
        navigationIsActive,
        width,
        height,
    };
}
