import { createContext, useCallback, useContext, useMemo } from 'react';
import { MAP_OPTIONS_TOUR } from './map/map-options-tour';
import { SCORECARD_TOUR } from './scorecard/scorecard-tour';
import {
    createTourProgress,
    readTourProgress,
    updateTourProgress,
    writeTourProgress,
} from './tour-progress';
import { usePersistentTour } from './use-persistent-tour';

const UserToursContext = createContext(null);

function useFeatureTour(definition) {
    const configuration = useMemo(
        () => ({
            storageKey: definition.storageKey,
            createProgress: createTourProgress,
            readProgress: (storage) => readTourProgress(storage, definition),
            writeProgress: (storage, progress) =>
                writeTourProgress(storage, definition, progress),
            updateProgress: (progress, action) =>
                updateTourProgress(progress, action, definition.steps),
        }),
        [definition],
    );
    const { progress, dispatch, reset } = usePersistentTour(configuration);
    const start = useCallback(() => dispatch({ type: 'start' }), [dispatch]);
    const dismissStep = useCallback(
        (step) => dispatch({ type: 'dismiss', step }),
        [dispatch],
    );
    const reopenStep = useCallback(
        (step) => dispatch({ type: 'reopen', step }),
        [dispatch],
    );
    const skip = useCallback(() => dispatch({ type: 'skip' }), [dispatch]);
    return useMemo(
        () => ({ progress, start, dismissStep, reopenStep, skip, reset }),
        [progress, start, dismissStep, reopenStep, skip, reset],
    );
}

export function UserToursProvider({ children }) {
    const mapOptions = useFeatureTour(MAP_OPTIONS_TOUR);
    const scorecard = useFeatureTour(SCORECARD_TOUR);
    const tours = useMemo(
        () => ({ 'map-options': mapOptions, scorecard }),
        [mapOptions, scorecard],
    );
    return (
        <UserToursContext.Provider value={tours}>
            {children}
        </UserToursContext.Provider>
    );
}

export function useUserTour(id) {
    const tours = useContext(UserToursContext);
    if (!tours?.[id]) {
        throw new Error(
            'useUserTour must be used inside UserToursProvider with a registered tour.',
        );
    }
    return tours[id];
}
