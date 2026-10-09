import { useCallback, useState } from 'react';

export function useBottomSheetPresentedState({ onChange, onDismiss } = {}) {
    const [bottomSheetIsPresented, setBottomSheetIsPresented] = useState(false);
    const handleBottomSheetChange = useCallback(
        (index, ...args) => {
            onChange?.(index, ...args);

            setBottomSheetIsPresented(index >= 0);
        },
        [onChange],
    );
    const handleBottomSheetDismiss = useCallback(
        (...args) => {
            setBottomSheetIsPresented(false);
            onDismiss?.(...args);
        },
        [onDismiss],
    );

    return {
        bottomSheetIsPresented,
        handleBottomSheetChange,
        handleBottomSheetDismiss,
    };
}
