import { useRef } from 'react';
import { View } from 'react-native';
import { useResponsiveMapLayout } from '../map/use-responsive-map-layout';
import { TabletNavigationRail } from './tablet-navigation-rail';

export function AdaptiveNavigationShell({ children }) {
    const { railWidth } = useResponsiveMapLayout();
    const drawerNavigation = useRef(null);
    return (
        <View className="flex-1 flex-row bg-daf-surface-page dark:bg-[#0B0E12]">
            {railWidth > 0 ? (
                <TabletNavigationRail
                    onOpenMenu={() => drawerNavigation.current?.openDrawer()}
                />
            ) : null}
            <View className="min-w-0 flex-1">{children(drawerNavigation)}</View>
        </View>
    );
}
