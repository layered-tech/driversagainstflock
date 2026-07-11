import {
    BottomSheetFlatList,
    BottomSheetModal,
    BottomSheetScrollView,
    BottomSheetView,
} from '@gorhom/bottom-sheet';
import Mapbox from '@rnmapbox/maps';
import { GlassView } from 'expo-glass-effect';
import { cssInterop, remapProps } from 'nativewind';
import { forwardRef, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import {
    MAP_SIDE_SHEET_BREAKPOINT,
    MAP_SIDE_SHEET_MAX_WIDTH,
} from './responsive-map-layout';
import { SafeAreaViewWithBottomOffset } from './safe-area-view-with-bottom-offset';

const RemappedBottomSheetModal = remapProps(BottomSheetModal, {
    backgroundClassName: 'backgroundStyle',
    handleIndicatorClassName: 'handleIndicatorStyle',
});

export const NativeWindBottomSheetFlatList = remapProps(BottomSheetFlatList, {
    className: 'style',
    contentContainerClassName: 'contentContainerStyle',
});

export const NativeWindBottomSheetScrollView = remapProps(
    BottomSheetScrollView,
    {
        className: 'style',
        contentContainerClassName: 'contentContainerStyle',
    },
);

export const NativeWindBottomSheetModal = forwardRef(
    function NativeWindBottomSheetModal({ style, ...props }, ref) {
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
            <RemappedBottomSheetModal ref={ref} style={sheetStyle} {...props} />
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
