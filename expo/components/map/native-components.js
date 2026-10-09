import {
    BottomSheetFlatList,
    BottomSheetModal,
    BottomSheetScrollView,
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
import { useWindowDimensions } from 'react-native';
import { createBottomSheetModalLifecycle } from './bottom-sheet-modal-lifecycle';
import {
    MAP_SIDE_SHEET_BREAKPOINT,
    MAP_SIDE_SHEET_MAX_WIDTH,
} from './responsive-map-layout';
import { SafeAreaViewWithBottomOffset } from './safe-area-view-with-bottom-offset';

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
        useLayoutEffect(() => {
            lifecycle.activate();
            lifecycle.setModal(modalRef.current);
            return lifecycle.dispose;
        }, [lifecycle]);
        const { width } = useWindowDimensions();
        const responsiveSheetStyle = useMemo(() => {
            if (width < MAP_SIDE_SHEET_BREAKPOINT) {
                return null;
            }

            return {
                marginHorizontal: 'auto',
                maxWidth: MAP_SIDE_SHEET_MAX_WIDTH,
                width: '100%',
            };
        }, [width]);
        const sheetStyle = useMemo(
            () => [responsiveSheetStyle, style],
            [responsiveSheetStyle, style],
        );

        return (
            <RemappedBottomSheetModal
                {...props}
                ref={modalRef}
                style={sheetStyle}
                onAnimate={lifecycle.onAnimate}
                onChange={lifecycle.onChange}
                onDismiss={lifecycle.onDismiss}
            />
        );
    },
);

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
