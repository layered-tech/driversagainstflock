import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function usePersistentTour(configuration) {
    const {
        storageKey,
        createProgress,
        readProgress,
        updateProgress,
        writeProgress,
    } = configuration;
    const [progress, setProgress] = useState(null);
    const storageWritesRef = useRef(Promise.resolve());

    useEffect(() => {
        let isActive = true;
        readProgress(AsyncStorage).then((savedProgress) => {
            if (isActive) {
                setProgress(savedProgress);
            }
        });
        return () => {
            isActive = false;
        };
    }, [readProgress]);

    useEffect(() => {
        if (!progress || progress.status === 'pending') {
            return;
        }
        // Preserve write order, including a reset requested during a slow write.
        storageWritesRef.current = storageWritesRef.current.then(() =>
            writeProgress(AsyncStorage, progress),
        );
    }, [progress, writeProgress]);

    const dispatch = useCallback(
        (action) => {
            setProgress((current) => updateProgress(current, action));
        },
        [updateProgress],
    );

    const reset = useCallback(async () => {
        const resetWrite = storageWritesRef.current.then(() =>
            AsyncStorage.removeItem(storageKey),
        );
        storageWritesRef.current = resetWrite.catch(() => {});
        await resetWrite;
        setProgress(createProgress());
    }, [createProgress, storageKey]);

    return useMemo(
        () => ({ progress, dispatch, reset }),
        [progress, dispatch, reset],
    );
}
