import {
    BottomSheetFlatList,
    BottomSheetModal,
    BottomSheetScrollView,
    BottomSheetTextInput,
    BottomSheetView,
    default as BottomSheet,
    TouchableOpacity as BottomSheetTouchableOpacity,
} from '@gorhom/bottom-sheet';
import Mapbox from '@rnmapbox/maps';
import { GlassView } from 'expo-glass-effect';
import { cssInterop, remapProps } from 'nativewind';
import {
    forwardRef,
    useCallback,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Platform,
    useColorScheme,
    useWindowDimensions,
    View,
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { useVerticalBarEdgeIOS } from 'expo-status-bar';
import {
    NativeNavigationContainer,
    useNativeNavigationAction,
    useNativeNavigationActions,
} from '../root/native-navigation';
import { createBottomSheetModalLifecycle } from './bottom-sheet-modal-lifecycle';
import {
    getDuoBottomSheetLayout,
    getDuoPaneLayout,
} from './duo-bottom-sheet-layout';
import { useDuoDevice } from '../root/duo-device-context';
import {
    getTabletPaneLayout,
    MAP_SIDE_SHEET_BREAKPOINT,
    MAP_SIDE_SHEET_MAX_WIDTH,
} from './responsive-map-layout';
import { SafeAreaViewWithBottomOffset } from './safe-area-view-with-bottom-offset';

const RemappedBottomSheetModal = remapProps(BottomSheetModal, {
    backgroundClassName: 'backgroundStyle',
    handleIndicatorClassName: 'handleIndicatorStyle',
});

const StyledBottomSheet = cssInterop(BottomSheet, {
    backgroundClassName: 'backgroundStyle',
    handleIndicatorClassName: 'handleIndicatorStyle',
});

export const NativeWindBottomSheet = forwardRef(function NativeWindBottomSheet(
    { style, ...props },
    ref,
) {
    const insets = useSafeAreaInsets();
    const railEdge = useVerticalBarEdgeIOS();
    const duo = useDuoDevice();
    const { width } = useWindowDimensions();
    const pane = Platform?.isPad
        ? getTabletPaneLayout(width, insets)
        : duo && getDuoPaneLayout(width, insets);
    return (
        <StyledBottomSheet
            accessible={false}
            {...props}
            bottomInset={props.bottomInset}
            ref={ref}
            style={[
                style,
                railEdge || pane
                    ? {
                          marginLeft: pane ? pane.left : insets.left,
                          marginRight: pane ? pane.right : insets.right,
                      }
                    : null,
            ]}
        />
    );
});

const StyledBottomSheetFlatList = remapProps(BottomSheetFlatList, {
    className: 'style',
    contentContainerClassName: 'contentContainerStyle',
});

export const NativeWindBottomSheetTouchableOpacity = cssInterop(
    BottomSheetTouchableOpacity,
    { className: 'style' },
);

const StyledBottomSheetScrollView = remapProps(BottomSheetScrollView, {
    className: 'style',
    contentContainerClassName: 'contentContainerStyle',
});

function DuoPaneHeaderSpace() {
    return <View className="h-3.5" />;
}

export const NativeWindBottomSheetModal = forwardRef(
    function NativeWindBottomSheetModal(
        {
            style,
            nativeCloseAction = true,
            tabletPresentation = 'pane',
            ...props
        },
        ref,
    ) {
        const navigationActions = useNativeNavigationActions();
        const duoDevice = useDuoDevice();
        const tabletDevice = Platform?.isPad === true;
        const modalRef = useRef(null);
        const [presented, setPresented] = useState(false);
        const callbacks = useRef(props);
        callbacks.current = props;
        const lifecycle = useMemo(
            () =>
                createBottomSheetModalLifecycle({
                    getModal: () => modalRef.current,
                    onAnimate: (...args) =>
                        callbacks.current.onAnimate?.(...args),
                    onChange: (...args) =>
                        callbacks.current.onChange?.(...args),
                    onDismiss: (...args) =>
                        callbacks.current.onDismiss?.(...args),
                }),
            [],
        );
        useImperativeHandle(ref, () => lifecycle, [lifecycle]);
        useNativeNavigationAction({
            enabled: nativeCloseAction && presented,
            railOnly: !duoDevice,
            kind: 'close',
            label: 'Close panel',
            priority: 200,
            onPress: () => lifecycle.dismiss(),
        });
        useLayoutEffect(() => {
            lifecycle.activate();
            lifecycle.setModal(modalRef.current);
            return lifecycle.dispose;
        }, [lifecycle]);
        const { width, height } = useWindowDimensions();
        const insets = useSafeAreaInsets({ ignoreOverride: true });
        const railEdge = useVerticalBarEdgeIOS();
        const dark = useColorScheme() === 'dark';
        const localPosition = useSharedValue(height);
        const sheetPosition = props.animatedPosition ?? localPosition;
        const tabletConfirmation =
            tabletDevice &&
            width >= 768 &&
            tabletPresentation === 'confirmation';
        const centered =
            tabletConfirmation ||
            ((duoDevice || tabletDevice) &&
                width >= 768 &&
                props.snapPoints?.[0] === '100%');
        const floatingRadius = tabletConfirmation ? 32 : 24;
        const duoLayout = getDuoBottomSheetLayout({
            railEdge,
            duoDevice,
            tabletDevice,
            tabletPresentation,
            width,
            insets,
            height,
            maxDynamicContentSize: props.maxDynamicContentSize,
            fullScreen: props.snapPoints?.[0] === '100%',
        });
        const responsiveSheetStyle = useMemo(() => {
            if (
                duoDevice ||
                tabletDevice ||
                width < MAP_SIDE_SHEET_BREAKPOINT
            ) {
                return null;
            }

            return {
                marginHorizontal: 'auto',
                maxWidth: MAP_SIDE_SHEET_MAX_WIDTH,
                width: '100%',
            };
        }, [width, duoDevice, tabletDevice]);
        const sheetStyle = useMemo(
            () => [responsiveSheetStyle, style, duoLayout.style],
            [
                responsiveSheetStyle,
                style,
                duoDevice,
                tabletDevice,
                tabletPresentation,
                width,
                insets.left,
                insets.right,
            ],
        );
        const floatingContainerStyle = useAnimatedStyle(
            () => ({
                transform: [
                    {
                        translateY: centered
                            ? (12 +
                                  insets.top -
                                  insets.bottom -
                                  sheetPosition.value) /
                              2
                            : duoLayout.detached
                              ? insets.top + 14 - sheetPosition.value
                              : 0,
                    },
                ],
            }),
            [
                centered,
                duoLayout.detached,
                insets.top,
                insets.bottom,
                sheetPosition,
            ],
        );
        const backdropContainerStyle = useAnimatedStyle(
            () => ({
                transform: [
                    {
                        translateY: centered
                            ? -(
                                  12 +
                                  insets.top -
                                  insets.bottom -
                                  sheetPosition.value
                              ) / 2
                            : 0,
                    },
                ],
            }),
            [centered, insets.top, insets.bottom, sheetPosition],
        );
        const floatingStyleRef = useRef(floatingContainerStyle);
        floatingStyleRef.current = floatingContainerStyle;
        const backdropStyleRef = useRef(backdropContainerStyle);
        backdropStyleRef.current = backdropContainerStyle;
        const renderWindowBackdrop = useCallback((backdropProps) => {
            const Backdrop = callbacks.current.backdropComponent;
            return Backdrop ? (
                <Animated.View
                    className="absolute inset-0"
                    style={backdropStyleRef.current}
                >
                    <Backdrop {...backdropProps} />
                </Animated.View>
            ) : null;
        }, []);
        const renderNavigationContainer = useCallback(
            ({ children }) =>
                duoDevice || tabletDevice ? (
                    <View
                        className="absolute inset-0"
                        pointerEvents="box-none"
                        accessibilityViewIsModal
                    >
                        <NativeNavigationContainer
                            inheritedActions={navigationActions}
                        >
                            <Animated.View
                                className="absolute inset-0"
                                pointerEvents="box-none"
                                style={floatingStyleRef.current}
                            >
                                {children}
                            </Animated.View>
                        </NativeNavigationContainer>
                    </View>
                ) : (
                    children
                ),
            [navigationActions, duoDevice, tabletDevice],
        );

        return (
            <RemappedBottomSheetModal
                accessible={false}
                {...props}
                {...duoLayout}
                containerComponent={
                    props.containerComponent ?? renderNavigationContainer
                }
                backdropComponent={
                    duoLayout.detached && !centered
                        ? undefined
                        : centered && props.backdropComponent
                          ? renderWindowBackdrop
                          : props.backdropComponent
                }
                ref={modalRef}
                style={sheetStyle}
                animatedPosition={sheetPosition}
                handleComponent={
                    duoLayout.detached
                        ? DuoPaneHeaderSpace
                        : props.handleComponent
                }
                backgroundStyle={[
                    props.backgroundStyle,
                    duoDevice || tabletDevice
                        ? {
                              backgroundColor: dark ? '#11151B' : '#FFFFFF',
                              borderTopLeftRadius: duoLayout.detached
                                  ? floatingRadius
                                  : 22,
                              borderTopRightRadius: duoLayout.detached
                                  ? floatingRadius
                                  : 22,
                              borderBottomLeftRadius:
                                  duoLayout.detached || duoLayout.bottomInset
                                      ? floatingRadius
                                      : 0,
                              borderBottomRightRadius:
                                  duoLayout.detached || duoLayout.bottomInset
                                      ? floatingRadius
                                      : 0,
                              borderTopWidth: 1,
                              borderColor: dark
                                  ? 'rgba(255,255,255,0.10)'
                                  : 'rgba(11,14,18,0.10)',
                          }
                        : null,
                ]}
                onAnimate={lifecycle.onAnimate}
                onChange={(index, ...args) => {
                    setPresented(index >= 0);
                    lifecycle.onChange(index, ...args);
                }}
                onDismiss={(...args) => {
                    setPresented(false);
                    lifecycle.onDismiss(...args);
                }}
            />
        );
    },
);

export const NativeWindBottomSheetTextInput = cssInterop(BottomSheetTextInput, {
    className: 'style',
});

const StyledBottomSheetView = cssInterop(BottomSheetView, {
    className: 'style',
});

function withDuoSheetSurface(Component, scrollable = false) {
    return forwardRef(function DuoSheetSurface({ className, ...props }, ref) {
        const duo = useDuoDevice();
        const railEdge = duo || Platform?.isPad === true;
        const insets = useSafeAreaInsets();
        const paddingBottom = props.contentContainerStyle?.paddingBottom;
        const contentContainerStyle =
            railEdge && scrollable && Number.isFinite(paddingBottom)
                ? {
                      ...props.contentContainerStyle,
                      paddingBottom: Math.min(
                          paddingBottom,
                          Math.max(20, paddingBottom - insets.bottom),
                      ),
                  }
                : props.contentContainerStyle;
        return (
            <Component
                {...props}
                {...(scrollable ? { contentContainerStyle } : {})}
                ref={ref}
                className={
                    railEdge
                        ? className?.replaceAll(
                              'dark:bg-daf-surface-dark',
                              'dark:bg-[#11151B]',
                          )
                        : className
                }
            />
        );
    });
}

export const NativeWindBottomSheetView = withDuoSheetSurface(
    StyledBottomSheetView,
);
export const NativeWindBottomSheetScrollView = withDuoSheetSurface(
    StyledBottomSheetScrollView,
    true,
);
export const NativeWindBottomSheetFlatList = withDuoSheetSurface(
    StyledBottomSheetFlatList,
);

export const NativeWindMapView = cssInterop(Mapbox.MapView, {
    className: 'style',
});

export const NativeWindGlassView = cssInterop(GlassView, {
    className: 'style',
});

export const NativeWindSafeAreaView = cssInterop(SafeAreaViewWithBottomOffset, {
    className: 'style',
});
