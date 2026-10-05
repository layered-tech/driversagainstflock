import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    CONTRIBUTE_TOUR_PHASE_STEPS,
    CONTRIBUTE_TOUR_STORAGE_KEY,
    createContributeTourProgress,
    readContributeTourProgress,
    updateContributeTourProgress,
    writeContributeTourProgress,
} from './contribute-tour-state';

export function useContributeTour(contributeStatus) {
    const [progress, setProgress] = useState(null);
    const storageWritesRef = useRef(Promise.resolve());

    useEffect(() => {
        let isActive = true;

        readContributeTourProgress(AsyncStorage).then((savedProgress) => {
            if (isActive) {
                setProgress(savedProgress);
            }
        });

        return () => {
            isActive = false;
        };
    }, []);

    useEffect(() => {
        if (contributeStatus === 'idle') {
            return;
        }

        setProgress((currentProgress) => {
            return contributeStatus === 'published'
                ? updateContributeTourProgress(currentProgress, {
                      type: 'published',
                  })
                : updateContributeTourProgress(currentProgress, {
                      type: 'start',
                  });
        });
    }, [contributeStatus, progress?.status]);

    useEffect(() => {
        if (!progress || progress.status === 'pending') {
            return;
        }

        // Preserve write order when several tips are dismissed together.
        storageWritesRef.current = storageWritesRef.current.then(() =>
            writeContributeTourProgress(AsyncStorage, progress),
        );
    }, [progress]);

    const dismissStep = useCallback((step) => {
        setProgress((currentProgress) =>
            updateContributeTourProgress(currentProgress, {
                type: 'dismiss',
                step,
            }),
        );
    }, []);

    const skip = useCallback(() => {
        setProgress((currentProgress) =>
            updateContributeTourProgress(currentProgress, { type: 'skip' }),
        );
    }, []);

    const reopenStep = useCallback((step) => {
        setProgress((currentProgress) =>
            updateContributeTourProgress(currentProgress, {
                type: 'reopen',
                step,
            }),
        );
    }, []);

    const dismissPhase = useCallback((phase) => {
        setProgress((currentProgress) =>
            CONTRIBUTE_TOUR_PHASE_STEPS[phase].reduce(
                (nextProgress, step) =>
                    updateContributeTourProgress(nextProgress, {
                        type: 'dismiss',
                        step,
                    }),
                currentProgress,
            ),
        );
    }, []);

    const reset = useCallback(async () => {
        const resetWrite = storageWritesRef.current.then(() =>
            AsyncStorage.removeItem(CONTRIBUTE_TOUR_STORAGE_KEY),
        );

        storageWritesRef.current = resetWrite.catch(() => {});
        await resetWrite;
        setProgress(createContributeTourProgress());
    }, []);

    return useMemo(
        () => ({
            dismissPhase,
            dismissStep,
            progress,
            reopenStep,
            reset,
            skip,
        }),
        [dismissPhase, dismissStep, progress, reopenStep, reset, skip],
    );
}
