import { createContext, createElement, useContext, useMemo } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets as useNativeSafeAreaInsets } from 'react-native-safe-area-context';

export const IOS_BOTTOM_SAFE_AREA_OFFSET = 16;
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

export function useSafeAreaInsets() {
    const overrideInsets = useContext(SafeAreaInsetsOverrideContext);
    const insets = useNativeSafeAreaInsets();
    const bottomOffset = getBottomSafeAreaOffset();
    const sourceInsets = overrideInsets ?? insets ?? EMPTY_SAFE_AREA_INSETS;
    const resolvedBottomOffset = overrideInsets ? 0 : bottomOffset;

    return useMemo(
        () => ({
            bottom: getInsetValue(sourceInsets.bottom) + resolvedBottomOffset,
            left: getInsetValue(sourceInsets.left),
            right: getInsetValue(sourceInsets.right),
            top: getInsetValue(sourceInsets.top),
        }),
        [
            resolvedBottomOffset,
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
