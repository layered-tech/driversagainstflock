export function createTourProgress() {
    return { status: 'pending', dismissedSteps: [] };
}

export function updateTourProgress(progress, action, steps) {
    if (!progress) {
        return progress;
    }
    if (action.type === 'start' && progress.status === 'pending') {
        return { ...progress, status: 'active' };
    }
    if (progress.status !== 'active') {
        return progress;
    }
    if (action.type === 'skip') {
        return { ...progress, status: 'skipped' };
    }
    if (!steps.some(({ id }) => id === action.step)) {
        return progress;
    }
    if (
        action.type === 'reopen' &&
        progress.dismissedSteps.includes(action.step)
    ) {
        return {
            ...progress,
            dismissedSteps: progress.dismissedSteps.filter(
                (id) => id !== action.step,
            ),
        };
    }
    if (
        action.type === 'dismiss' &&
        !progress.dismissedSteps.includes(action.step)
    ) {
        const dismissedSteps = [...progress.dismissedSteps, action.step];
        return {
            ...progress,
            dismissedSteps,
            status: steps.every(({ id }) => dismissedSteps.includes(id))
                ? 'completed'
                : 'active',
        };
    }
    return progress;
}

export function getVisibleTourStep(progress, step) {
    return progress?.status === 'active' &&
        !progress.dismissedSteps.includes(step.id)
        ? step
        : null;
}

export async function readTourProgress(storage, definition) {
    try {
        const saved = JSON.parse(await storage.getItem(definition.storageKey));
        if (
            saved?.version === 1 &&
            ['active', 'skipped', 'completed'].includes(saved.status) &&
            Array.isArray(saved.dismissedSteps)
        ) {
            return {
                status: saved.status,
                dismissedSteps: [
                    ...new Set(
                        saved.dismissedSteps.filter((id) =>
                            definition.steps.some((step) => step.id === id),
                        ),
                    ),
                ],
            };
        }
    } catch {
        // A storage failure must not prevent using the feature.
    }
    return createTourProgress();
}

export async function writeTourProgress(storage, definition, progress) {
    try {
        await storage.setItem(
            definition.storageKey,
            JSON.stringify({ version: 1, ...progress }),
        );
        return true;
    } catch {
        return false;
    }
}
