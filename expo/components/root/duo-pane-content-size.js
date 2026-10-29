import { useCallback, useContext, useLayoutEffect } from 'react';
import { DuoPaneSizeContext } from './duo-device-context';

export function useDuoPaneContentSize({ header = true, footer = true } = {}) {
    const setSize = useContext(DuoPaneSizeContext);
    const measure = useCallback(
        (part, value) => {
            if (!Number.isFinite(value)) return;
            setSize?.((size) =>
                size[part] === value ? size : { ...size, [part]: value },
            );
        },
        [setSize],
    );
    useLayoutEffect(() => {
        if (!header) measure('header', 0);
        if (!footer) measure('footer', 0);
    }, [header, footer, measure]);
    return {
        onHeaderLayout: (event) =>
            measure('header', event.nativeEvent.layout.height),
        onContentSizeChange: (_width, height) => measure('content', height),
        onFooterLayout: (event) =>
            measure('footer', event.nativeEvent.layout.height),
    };
}
