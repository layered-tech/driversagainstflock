import { PersistentMapScene } from '../map/persistent-map-host';
import { useIsFocused } from 'expo-router';
import { useVerticalBarEdgeIOS } from 'expo-status-bar';
import { cssInterop } from 'nativewind';
import {
    createContext,
    useContext,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';
import {
    Platform,
    useColorScheme,
    useWindowDimensions,
    View,
} from 'react-native';
import { ScreenStack, ScreenStackItem } from 'react-native-screens';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
    SafeAreaInsetsOverrideProvider,
    useSafeAreaInsets,
} from '../../lib/safe-area-insets';
import {
    createNativeNavigationActions,
    getNativeNavigationHeader,
    resolveNativeNavigationActions,
} from './native-navigation-actions';

import { useDuoDevice } from './duo-device-context';

const NativeNavigationContext = createContext(null);
const NativeNavigationHeightContext = createContext(0);
const HorizontalSafeAreaContext = createContext({ left: 0, right: 0 });
const NativeWindScreenStack = cssInterop(ScreenStack, { className: 'style' });
const NativeWindScreenStackItem = cssInterop(ScreenStackItem, {
    className: 'style',
});

// A single native screen supplies a UINavigationController without introducing a
// second Router history. State-only map overlays retain their existing handlers.
export function NativeNavigationContainer({ children, inheritedActions }) {
    if (Platform.OS !== 'ios') {
        return children;
    }

    return (
        <IOSNativeNavigationContainer inheritedActions={inheritedActions}>
            {children}
        </IOSNativeNavigationContainer>
    );
}

const EMPTY_ACTIONS = [];
const emptySnapshot = () => EMPTY_ACTIONS;
const emptySubscription = () => () => {};

export function useNativeNavigationActions() {
    return useContext(NativeNavigationContext);
}

function IOSNativeNavigationContainer({ children, inheritedActions }) {
    const contextualActions = useNativeNavigationActions();
    const parentActions = inheritedActions ?? contextualActions;
    const inherited = useSyncExternalStore(
        parentActions?.subscribe ?? emptySubscription,
        parentActions?.getSnapshot ?? emptySnapshot,
        parentActions?.getSnapshot ?? emptySnapshot,
    );
    const id = useId();
    const colorScheme = useColorScheme();
    const verticalBarEdge = useVerticalBarEdgeIOS();
    const actions = useMemo(createNativeNavigationActions, []);
    const overlayHosts = useSyncExternalStore(
        actions.subscribe,
        actions.getOverlayHostCount,
        actions.getOverlayHostCount,
    );
    useLayoutEffect(() => {
        if (inheritedActions) return inheritedActions.acquireOverlayHost();
    }, [inheritedActions]);
    const action = useSyncExternalStore(
        actions.subscribe,
        actions.getSnapshot,
        actions.getSnapshot,
    );
    const visibleActions = resolveNativeNavigationActions([
        ...inherited,
        ...action,
    ]);
    const [headerHeight, setHeaderHeight] = useState(0);
    const headerConfig = getNativeNavigationHeader(
        visibleActions,
        colorScheme === 'dark' ? '#F5F7F9' : '#11151B',
    );

    return (
        <NativeNavigationContext.Provider value={actions}>
            <NativeWindScreenStack
                className="flex-1 bg-transparent"
                accessibilityElementsHidden={overlayHosts > 0}
                nativeContainerStyle={{ backgroundColor: 'transparent' }}
            >
                <NativeWindScreenStackItem
                    screenId={id}
                    activityState={2}
                    gestureEnabled={false}
                    headerConfig={
                        overlayHosts
                            ? { ...headerConfig, hidden: true }
                            : headerConfig
                    }
                    onHeaderHeightChange={(event) =>
                        setHeaderHeight(event.nativeEvent.headerHeight)
                    }
                    unstable_safeAreaEdges={{
                        top: false,
                        bottom: false,
                        left: false,
                        right: false,
                    }}
                    className="flex-1 bg-transparent"
                >
                    <SafeAreaProvider>
                        <NativeNavigationHeightContext.Provider
                            value={
                                visibleActions.length && !verticalBarEdge
                                    ? headerHeight
                                    : 0
                            }
                        >
                            {children}
                        </NativeNavigationHeightContext.Provider>
                    </SafeAreaProvider>
                </NativeWindScreenStackItem>
            </NativeWindScreenStack>
        </NativeNavigationContext.Provider>
    );
}

export function HorizontalSafeAreaContent({
    children,
    className = 'flex-1 bg-daf-surface-page dark:bg-[#0B0E12]',
}) {
    const insets = useSafeAreaInsets();
    if (Platform.OS !== 'ios') return children;
    return (
        <View
            className={className}
            style={{ paddingLeft: insets.left, paddingRight: insets.right }}
        >
            <SafeAreaInsetsOverrideProvider
                insets={{ ...insets, left: 0, right: 0 }}
            >
                <HorizontalSafeAreaContext.Provider value={insets}>
                    {children}
                </HorizontalSafeAreaContext.Provider>
            </SafeAreaInsetsOverrideProvider>
        </View>
    );
}

export function FullWidthSafeAreaBand({
    children,
    className,
    gutter = 0,
    style,
    ...props
}) {
    const insets = useContext(HorizontalSafeAreaContext);
    return (
        <View
            {...props}
            className={className}
            style={[
                {
                    marginLeft: -insets.left,
                    marginRight: -insets.right,
                    paddingLeft: insets.left + gutter,
                    paddingRight: insets.right + gutter,
                },
                style,
            ]}
        >
            {children}
        </View>
    );
}

export function horizontalSafeAreaScreenLayout({ children }) {
    return <HorizontalSafeAreaContent>{children}</HorizontalSafeAreaContent>;
}

export function NativeModalContent({ children }) {
    return (
        <SafeAreaProvider>
            <SafeAreaInsetsOverrideProvider insets={null}>
                <NativeNavigationContainer>
                    <HorizontalSafeAreaContent className="flex-1 bg-transparent">
                        {children}
                    </HorizontalSafeAreaContent>
                </NativeNavigationContainer>
            </SafeAreaInsetsOverrideProvider>
        </SafeAreaProvider>
    );
}

export function useDuoRailEdge() {
    const edge = useVerticalBarEdgeIOS();
    return Platform.OS === 'ios' ? edge : null;
}

const INFORMATION_ROUTES = new Set([
    'faqs',
    'about-and-legal',
    'privacy-policy',
    'terms-of-use',
    'contribute-to-daf',
]);

export function nativeNavigationScreenLayout({ children, route }) {
    const content = (
        <NativeNavigationContainer>
            {INFORMATION_ROUTES.has(route?.name) ? (
                <HorizontalSafeAreaContent>
                    {children}
                </HorizontalSafeAreaContent>
            ) : (
                children
            )}
        </NativeNavigationContainer>
    );
    return ['scorecard', 'areas', 'contribute', 'edits'].includes(
        route?.name,
    ) ? (
        content
    ) : (
        <PersistentMapScene>{content}</PersistentMapScene>
    );
}

export function useNativeNavigationTopInset(safeAreaTop = 0) {
    return Math.max(safeAreaTop, useContext(NativeNavigationHeightContext));
}

export function NativeNavigationAction({
    children = null,
    enabled = true,
    kind = 'back',
    label = children?.props?.accessibilityLabel ??
        (kind === 'close' ? 'Close' : 'Back'),
    native = true,
    onPress = children?.props?.onPress,
    placeholder = null,
    priority = 0,
    testID = children?.props?.testID,
    tintColor,
    symbol,
    icon,
    disabled = children?.props?.disabled ?? false,
    railOnly = false,
    order = 0,
    badge,
    group,
    visibilityPriority,
    sharesBackground,
    overflowOnly,
}) {
    const usesNativeNavigation = useNativeNavigationAction({
        enabled,
        kind,
        label,
        native,
        onPress,
        priority,
        testID,
        tintColor,
        symbol,
        icon,
        disabled,
        railOnly,
        order,
        badge,
        group,
        visibilityPriority,
        sharesBackground,
        overflowOnly,
    });
    if (!enabled) {
        return null;
    }

    return usesNativeNavigation ? placeholder : children;
}

export function useNativeNavigationAction({
    enabled = true,
    kind = 'back',
    label = kind === 'close' ? 'Close' : 'Back',
    native = true,
    onPress,
    priority = 0,
    testID,
    tintColor,
    symbol,
    icon,
    disabled = false,
    railOnly = false,
    order = 0,
    badge,
    group,
    visibilityPriority,
    sharesBackground,
    overflowOnly,
}) {
    const actions = useContext(NativeNavigationContext);
    const focused = useIsFocused();
    const railEdge = useDuoRailEdge();
    const duoDevice = useDuoDevice();
    const { width } = useWindowDimensions();
    const duoNavigation =
        duoDevice &&
        (kind === 'back' || kind === 'close' || symbol === 'line.3.horizontal');
    const usesNativeAction =
        Platform.OS === 'ios' &&
        !(Platform.isPad && width >= 768) &&
        native &&
        Boolean(actions) &&
        (!railOnly || Boolean(railEdge) || duoNavigation);
    const id = useId();
    const handler = useRef(onPress);
    useLayoutEffect(() => {
        handler.current = onPress;
    }, [onPress]);
    useLayoutEffect(() => {
        if (!usesNativeAction || !enabled || !focused) {
            return;
        }

        return actions.register(id, {
            kind,
            label,
            onPress: () => handler.current?.(),
            priority,
            testID,
            tintColor,
            symbol,
            icon,
            disabled,
            order,
            badge,
            group,
            visibilityPriority,
            sharesBackground,
            overflowOnly,
        });
    }, [
        actions,
        enabled,
        focused,
        id,
        kind,
        label,
        native,
        priority,
        testID,
        tintColor,
        symbol,
        icon,
        disabled,
        usesNativeAction,
        order,
        badge,
        group,
        visibilityPriority,
        sharesBackground,
        overflowOnly,
    ]);

    return usesNativeAction;
}
