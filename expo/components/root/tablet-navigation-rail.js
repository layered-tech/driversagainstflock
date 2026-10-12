import { router, usePathname } from 'expo-router';
import { Pressable, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { Icon } from '../design-system/icon';
import { getDafTheme } from '../design-system/tokens';
import { useAuth } from '../../lib/auth';

const ITEMS = [
    { label: 'Map', icon: 'map', path: '/' },
    { label: 'Scorecard', icon: 'gauge', path: '/scorecard' },
    { label: 'Hotlist', icon: 'flame', path: '/hotlist' },
    { label: 'Your edits', icon: 'pencil', path: '/edits', account: true },
];

function RailItem({ item, onPress, selected = false }) {
    const theme = getDafTheme(useColorScheme());
    return (
        <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={`h-[58px] w-[70px] items-center justify-center gap-1 rounded-dafMd active:opacity-70 ${selected ? 'bg-daf-brand/15' : ''}`}
            onPress={onPress}
            testID={`tablet-rail-${item.icon}`}
        >
            <Icon
                name={item.icon}
                size={22}
                color={selected ? theme.text.brand : theme.text.secondary}
            />
            <Text
                className={`text-[10.5px] font-semibold ${selected ? 'text-daf-text-brand dark:text-daf-brand' : 'text-daf-text-secondary dark:text-neutral-300'}`}
            >
                {item.label}
            </Text>
        </Pressable>
    );
}

export function TabletNavigationRail({ onOpenMenu }) {
    const pathname = usePathname();
    const insets = useSafeAreaInsets();
    const { isAuthenticated } = useAuth();
    const theme = getDafTheme(useColorScheme());
    return (
        <View
            className="w-[84px] items-center gap-1 border-r border-daf-border bg-white dark:border-daf-border-dark dark:bg-daf-surface-dark"
            style={{
                paddingTop: insets.top + 6,
                paddingBottom: insets.bottom + 12,
            }}
            testID="tablet-navigation-rail"
        >
            <Pressable
                accessibilityLabel="Open menu"
                accessibilityRole="button"
                className="mb-2.5 h-12 w-12 items-center justify-center rounded-dafPill active:opacity-70"
                onPress={onOpenMenu}
                testID="tablet-rail-menu"
            >
                <Icon name="menu" size={22} color={theme.text.primary} />
            </Pressable>
            {ITEMS.filter((item) => !item.account || isAuthenticated).map(
                (item) => (
                    <RailItem
                        key={item.path}
                        item={item}
                        selected={
                            item.path === '/'
                                ? pathname === '/'
                                : pathname.startsWith(item.path)
                        }
                        onPress={() => router.navigate(item.path)}
                    />
                ),
            )}
            <View className="flex-1" />
            <RailItem
                item={{ label: 'About', icon: 'info' }}
                selected={pathname === '/about-and-legal'}
                onPress={() => router.navigate('/about-and-legal')}
            />
        </View>
    );
}
