import {
    Platform,
    Pressable,
    ScrollView,
    useColorScheme,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { NativeNavigationAction } from '../root/native-navigation';
import { DuoPaneContentContext } from '../root/duo-device-context';
import { getDuoPaneLayout } from './duo-bottom-sheet-layout';
import { getTabletPaneLayout } from './responsive-map-layout';
import { Icon } from '../design-system/icon';

export function DuoMapSheet({
    children,
    map,
    onClose,
    sheetHeight,
    testID,
    header,
    footer,
    onHeaderLayout,
    onFooterLayout,
    tabletDevice = false,
}) {
    const insets = useSafeAreaInsets();
    const dark = useColorScheme() === 'dark';
    const { width } = useWindowDimensions();
    const pane = tabletDevice
        ? getTabletPaneLayout(width, insets)
        : getDuoPaneLayout(width, insets);
    const paneClose = Boolean(
        pane && (tabletDevice || Platform.OS === 'android'),
    );
    return (
        <View
            className="flex-1 bg-daf-surface-page dark:bg-[#0B0E12]"
            testID={testID}
        >
            <View className="absolute inset-0">{map}</View>
            {header ? (
                <View
                    className="absolute overflow-hidden rounded-dafLg border border-daf-border-glass bg-white shadow-areaControl dark:border-daf-border-glass-dark dark:bg-[#11151B]"
                    style={{
                        left: pane ? pane.left : insets.left + 12,
                        right: pane ? pane.right : insets.right + 12,
                        top: insets.top + 14,
                    }}
                    onLayout={onHeaderLayout}
                    testID="duo-map-floating-header"
                >
                    {header}
                </View>
            ) : null}
            {footer ? (
                <View
                    className="absolute overflow-hidden rounded-dafLg border border-daf-border-glass bg-white shadow-areaControl dark:border-daf-border-glass-dark dark:bg-[#11151B]"
                    style={{
                        left: pane ? pane.left : insets.left + 12,
                        right: pane ? pane.right : insets.right + 12,
                        bottom: Math.max(insets.bottom, 14) + 12,
                    }}
                    onLayout={onFooterLayout}
                    testID="duo-map-floating-footer"
                >
                    {footer}
                </View>
            ) : null}
            {!header ? (
                <View
                    className="absolute overflow-hidden rounded-dafXl border border-daf-border-glass bg-white shadow-areaSheet dark:border-daf-border-glass-dark dark:bg-[#11151B]"
                    style={{
                        maxHeight: sheetHeight,
                        left: pane ? pane.left : insets.left,
                        right: pane ? pane.right : insets.right,
                        top: pane ? insets.top + 14 : undefined,
                        bottom: pane ? undefined : 0,
                    }}
                >
                    <ScrollView
                        className="grow-0"
                        contentContainerStyle={{
                            paddingBottom: pane ? 20 : insets.bottom,
                        }}
                        showsVerticalScrollIndicator={false}
                    >
                        {!pane ? (
                            <View className="mt-2 h-[5px] w-8 self-center rounded-full bg-daf-border-strong dark:bg-[#3A434E]" />
                        ) : null}
                        <DuoPaneContentContext.Provider value={Boolean(pane)}>
                            {children}
                        </DuoPaneContentContext.Provider>
                    </ScrollView>
                </View>
            ) : null}
            <NativeNavigationAction
                railOnly
                kind="close"
                label="Close"
                priority={100}
                onPress={onClose}
            >
                <Pressable
                    accessibilityLabel="Close"
                    accessibilityRole="button"
                    onPress={onClose}
                    className="absolute right-3 top-3 h-11 w-11 items-center justify-center rounded-full bg-white dark:bg-daf-surface-dark"
                    style={{
                        top: insets.top + (paneClose ? 22 : 12),
                        right: paneClose ? pane.right + 8 : insets.right + 12,
                        zIndex: 10,
                    }}
                >
                    <Icon
                        name="x"
                        size={20}
                        color={dark ? '#F5F7F9' : '#11151B'}
                    />
                </Pressable>
            </NativeNavigationAction>
        </View>
    );
}
