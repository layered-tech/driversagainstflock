import { useCallback, useEffect, useMemo } from 'react';
import { usePersistentTour } from '../use-persistent-tour';
import {
    CONTRIBUTE_TOUR_PHASE_STEPS,
    CONTRIBUTE_TOUR_STORAGE_KEY,
    createContributeTourProgress,
    readContributeTourProgress,
    updateContributeTourProgress,
    writeContributeTourProgress,
} from './contribute-tour-state';

const PERSISTENCE = {
    storageKey: CONTRIBUTE_TOUR_STORAGE_KEY,
    createProgress: createContributeTourProgress,
    readProgress: readContributeTourProgress,
    updateProgress: updateContributeTourProgress,
    writeProgress: writeContributeTourProgress,
};

export function useContributeTour(contributeStatus) {
    const { progress, dispatch, reset } = usePersistentTour(PERSISTENCE);

    useEffect(() => {
        if (contributeStatus === 'idle') {
            return;
        }

        dispatch({
            type: contributeStatus === 'published' ? 'published' : 'start',
        });
    }, [contributeStatus, dispatch, progress?.status]);

    const dismissStep = useCallback(
        (step) => dispatch({ type: 'dismiss', step }),
        [dispatch],
    );
    const skip = useCallback(() => dispatch({ type: 'skip' }), [dispatch]);
    const reopenStep = useCallback(
        (step) => dispatch({ type: 'reopen', step }),
        [dispatch],
    );
    const dismissPhase = useCallback(
        (phase) => {
            CONTRIBUTE_TOUR_PHASE_STEPS[phase].forEach((step) =>
                dispatch({ type: 'dismiss', step }),
            );
        },
        [dispatch],
    );

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
