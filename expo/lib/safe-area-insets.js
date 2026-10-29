import { createContext, createElement, useContext, useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets as useNativeSafeAreaInsets } from 'react-native-safe-area-context';
import { useDuoDevice } from '../components/root/duo-device-context';

export const IOS_BOTTOM_SAFE_AREA_OFFSET = 16;
export const DUO_CORNER_SAFE_AREA_PADDING = 24;
const EMPTY_SAFE_AREA_INSETS = {
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
};
const SafeAreaInsetsOverrideContext = createContext(null);

function getBottomSafeAreaOffset() {
    return Platform.OS === 'ios' ? IOS_BOTTOM_SAFE_AREA_OFFSET : 0;
}

function getInsetValue(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}

function normalizeInsets(insets) {
    if (!insets) {
        return null;
    }

    return {
        bottom: getInsetValue(insets.bottom),
        left: getInsetValue(insets.left),
        right: getInsetValue(insets.right),
        top: getInsetValue(insets.top),
    };
}

export function SafeAreaInsetsOverrideProvider({ children, insets }) {
    const normalizedInsets = useMemo(
        () => normalizeInsets(insets),
        [insets?.bottom, insets?.left, insets?.right, insets?.top],
    );

    return createElement(
        SafeAreaInsetsOverrideContext.Provider,
        { value: normalizedInsets },
        children,
    );
}

export function useSafeAreaInsets({ ignoreOverride = false } = {}) {
    const duo = useDuoDevice();
    const { width, height } = useWindowDimensions();
    const inheritedInsets = useContext(SafeAreaInsetsOverrideContext);
    const overrideInsets = ignoreOverride ? null : inheritedInsets;
    const insets = useNativeSafeAreaInsets();
    const bottomOffset = getBottomSafeAreaOffset();
    const sourceInsets = overrideInsets ?? insets ?? EMPTY_SAFE_AREA_INSETS;
    const resolvedBottomOffset = overrideInsets ? 0 : bottomOffset;
    const cornerPadding =
        !overrideInsets && duo && Math.min(width, height) >= 600
            ? DUO_CORNER_SAFE_AREA_PADDING
            : 0;

    return useMemo(
        () => ({
            bottom:
                getInsetValue(sourceInsets.bottom) +
                resolvedBottomOffset +
                cornerPadding,
            left: getInsetValue(sourceInsets.left) + cornerPadding,
            right: getInsetValue(sourceInsets.right) + cornerPadding,
            top: getInsetValue(sourceInsets.top) + cornerPadding,
        }),
        [
            resolvedBottomOffset,
            cornerPadding,
            sourceInsets.bottom,
            sourceInsets.left,
            sourceInsets.right,
            sourceInsets.top,
        ],
    );
}

export function getSafeAreaBottomOffset() {
    return getBottomSafeAreaOffset();
}
