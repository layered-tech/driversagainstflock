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
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
} from 'react';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { createBottomSheetModalLifecycle } from './bottom-sheet-modal-lifecycle';
import { useResponsiveMapLayout } from './use-responsive-map-layout';
import { SafeAreaViewWithBottomOffset } from './safe-area-view-with-bottom-offset';
import { Pressable, useColorScheme, View } from 'react-native';
import { Icon } from '../design-system/icon';

const RemappedBottomSheetModal = remapProps(BottomSheetModal, {
    backgroundClassName: 'backgroundStyle',
    handleIndicatorClassName: 'handleIndicatorStyle',
});

export const NativeWindBottomSheet = cssInterop(BottomSheet, {
    backgroundClassName: 'backgroundStyle',
    handleIndicatorClassName: 'handleIndicatorStyle',
});

export const NativeWindBottomSheetFlatList = remapProps(BottomSheetFlatList, {
    className: 'style',
    contentContainerClassName: 'contentContainerStyle',
});

export const NativeWindBottomSheetTouchableOpacity = cssInterop(
    BottomSheetTouchableOpacity,
    { className: 'style' },
);

export const NativeWindBottomSheetScrollView = remapProps(
    BottomSheetScrollView,
    {
        className: 'style',
        contentContainerClassName: 'contentContainerStyle',
    },
);

export const NativeWindBottomSheetModal = forwardRef(
    function NativeWindBottomSheetModal({ style, ...props }, ref) {
        const modalRef = useRef(null);
        const layout = useResponsiveMapLayout();
        const insets = useSafeAreaInsets();
        const colorScheme = useColorScheme();
        const callbacks = useRef(props);
        callbacks.current = { ...props, isWide: layout.isWide };
        const lifecycle = useMemo(
            () =>
                createBottomSheetModalLifecycle({
                    getModal: () => {
                        if (!modalRef.current || !callbacks.current.isWide)
                            return modalRef.current;
                        return {
                            ...modalRef.current,
                            snapToIndex: (_index, config) =>
                                modalRef.current?.snapToIndex(0, config),
                        };
                    },
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
        useLayoutEffect(() => {
            lifecycle.activate();
            lifecycle.setModal(modalRef.current);
            return lifecycle.dispose;
        }, [lifecycle]);
        const responsiveSheetStyle = useMemo(() => {
            if (!layout.isWide) {
                return null;
            }

            return {
                marginLeft: layout.railWidth + insets.left + 12,
                marginRight:
                    layout.width -
                    layout.railWidth -
                    insets.left -
                    12 -
                    layout.paneWidth,
            };
        }, [
            layout.isWide,
            layout.width,
            layout.railWidth,
            layout.paneWidth,
            insets.left,
        ]);
        const sheetStyle = useMemo(
            () => [responsiveSheetStyle, style],
            [responsiveSheetStyle, style],
        );

        return (
            <RemappedBottomSheetModal
                {...props}
                {...(layout.isWide
                    ? {
                          backdropComponent: null,
                          detached: true,
                          topInset: Math.max(
                              props.topInset ?? 0,
                              insets.top + 12,
                          ),
                          bottomInset: insets.bottom + 12,
                          snapPoints: ['100%'],
                          index: 0,
                          enableDynamicSizing: false,
                          enableContentPanningGesture: false,
                          enableHandlePanningGesture: false,
                          enablePanDownToClose: false,
                          handleComponent:
                              props.enablePanDownToClose === false
                                  ? null
                                  : () => (
                                        <View className="items-end px-3 pt-2">
                                            <Pressable
                                                accessibilityLabel="Close panel"
                                                accessibilityRole="button"
                                                className="h-10 w-10 items-center justify-center rounded-dafPill active:opacity-70"
                                                onPress={() =>
                                                    lifecycle.dismiss()
                                                }
                                                testID="wide-sheet-close-button"
                                            >
                                                <Icon
                                                    name="x"
                                                    size={20}
                                                    color={
                                                        colorScheme === 'dark'
                                                            ? '#F5F7F9'
                                                            : '#11151B'
                                                    }
                                                />
                                            </Pressable>
                                        </View>
                                    ),
                          keyboardBehavior: 'fillParent',
                      }
                    : {})}
                ref={modalRef}
                style={sheetStyle}
                onAnimate={lifecycle.onAnimate}
                onChange={lifecycle.onChange}
                onDismiss={lifecycle.onDismiss}
            />
        );
    },
);

export const NativeWindBottomSheetTextInput = cssInterop(BottomSheetTextInput, {
    className: 'style',
});

export const NativeWindBottomSheetView = cssInterop(BottomSheetView, {
    className: 'style',
});

export const NativeWindMapView = cssInterop(Mapbox.MapView, {
    className: 'style',
});

export const NativeWindGlassView = cssInterop(GlassView, {
    className: 'style',
});

export const NativeWindSafeAreaView = cssInterop(SafeAreaViewWithBottomOffset, {
    className: 'style',
});
