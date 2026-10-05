export const CONTRIBUTE_TOUR_STORAGE_KEY =
    'driversagainstflock.contributeTour.v2';

export const CONTRIBUTE_TOUR_PHASE_STEPS = {
    start: ['start'],
    placement: ['placement-map', 'placement'],
    placed: ['placed'],
    camera: [
        'camera-details',
        'manufacturer',
        'operator',
        'directions',
        'mount',
    ],
    changeset: ['changeset', 'source'],
    review: ['review', 'publish'],
    published: ['published'],
};

export const CONTRIBUTE_TOUR_STEPS = {
    start: {
        target: 'start',
        scroll: true,
        title: 'Your first contribution',
        description:
            'Your edits go to OpenStreetMap and are public under your OSM username. Use this button to sign in, allow map editing, or start your contribution.',
    },
    'placement-map': {
        target: 'placement-map',
        step: 1,
        title: 'Find the camera’s exact location',
        description:
            'Move and zoom the map until this crosshair sits on the camera. Check nearby mapped cameras to avoid a duplicate.',
    },
    placement: {
        target: 'placement',
        step: 1,
        title: 'Put the camera in the right place',
        description:
            'Tap + to add a camera at the crosshair. First move the map to the location you can verify.',
    },
    placed: {
        target: 'placed',
        scroll: true,
        step: 1,
        title: 'Your camera is in the draft',
        description:
            'Your pin is in the draft. Add more with +, or use this button to describe the cameras you’ve placed.',
    },
    'camera-details': {
        target: 'camera-details',
        scroll: true,
        step: 2,
        title: 'Describe what you can verify',
        description:
            'Check the selected type. ALPR cameras read license plates; CCTV cameras record video. Choose the type you can verify.',
    },
    manufacturer: {
        target: 'manufacturer',
        scroll: true,
        step: 2,
        title: 'Check the manufacturer',
        description:
            'Flock Safety is preselected. Change it if you can verify another manufacturer; don’t assume every camera is a Flock camera.',
    },
    operator: {
        target: 'operator',
        scroll: true,
        step: 2,
        title: 'Who runs this camera?',
        description:
            'The operator is the organization running the camera, such as a police department. Leave this blank if you don’t know.',
    },
    directions: {
        target: 'directions',
        scroll: true,
        step: 2,
        title: 'Show where the camera looks',
        description:
            'Drag the ring so the cone covers what the camera sees. Move the imagery to fine-tune its location. Use Add direction for additional views, or leave directions unset if unknown.',
    },
    mount: {
        target: 'mount',
        scroll: true,
        step: 2,
        title: 'What is it mounted on?',
        description:
            'Select the mount only if you can verify it. Now fill in the camera’s details, then use Next camera or Next: changeset details.',
    },
    changeset: {
        target: 'changeset',
        scroll: true,
        step: 3,
        title: 'Tell other mappers what changed',
        description:
            'A changeset groups your edits. Write what changed and why, for example: “Added two ALPR cameras near Oak Street.”',
    },
    source: {
        target: 'source',
        scroll: true,
        step: 3,
        title: 'Where did the information come from?',
        description:
            'Choose Survey for an in-person observation, Local knowledge if you know the area, or Aerial imagery if that’s your source. Hashtags are optional.',
    },
    review: {
        target: 'review',
        scroll: true,
        step: 4,
        title: 'Check your contribution before publishing',
        description:
            'Review your cameras, locations, comment, and source. Use Back to correct anything before submitting.',
    },
    publish: {
        target: 'publish',
        step: 4,
        title: 'Publish when you’re ready',
        description:
            'This button submits real, public edits credited to your OSM account. You choose when to publish. Save as draft keeps your work on this device for later.',
    },
    published: {
        target: 'published',
        title: 'You’ve made your first contribution',
        description:
            'Your cameras are published. This button returns to Explore. You can also choose Add more cameras to make another contribution.',
    },
};

export function createContributeTourProgress() {
    return {
        status: 'pending',
        dismissedSteps: [],
        completionIsVisible: false,
    };
}

export function updateContributeTourProgress(progress, action) {
    if (!progress) {
        return progress;
    }

    if (action.type === 'start' && progress.status === 'pending') {
        return { ...progress, status: 'active' };
    }

    if (action.type === 'skip' && progress.status === 'active') {
        return { ...progress, status: 'skipped' };
    }

    if (action.type === 'published' && progress.status === 'active') {
        return {
            ...progress,
            status: 'completed',
            completionIsVisible: true,
        };
    }

    if (
        action.type === 'reopen' &&
        progress.status === 'active' &&
        progress.dismissedSteps.includes(action.step)
    ) {
        return {
            ...progress,
            dismissedSteps: progress.dismissedSteps.filter(
                (step) => step !== action.step,
            ),
        };
    }

    if (action.type === 'dismiss') {
        if (action.step === 'published' && progress.completionIsVisible) {
            return { ...progress, completionIsVisible: false };
        }

        if (
            progress.status === 'active' &&
            Object.hasOwn(CONTRIBUTE_TOUR_STEPS, action.step) &&
            !progress.dismissedSteps.includes(action.step)
        ) {
            return {
                ...progress,
                dismissedSteps: [...progress.dismissedSteps, action.step],
            };
        }
    }

    return progress;
}

export function getVisibleContributeTourStep(progress, step) {
    if (!progress) {
        return null;
    }

    if (step === 'published') {
        return progress.completionIsVisible
            ? CONTRIBUTE_TOUR_STEPS.published
            : null;
    }

    return progress.status === 'active' &&
        !progress.dismissedSteps.includes(step)
        ? (CONTRIBUTE_TOUR_STEPS[step] ?? null)
        : null;
}

export async function readContributeTourProgress(storage) {
    try {
        const saved = JSON.parse(
            await storage.getItem(CONTRIBUTE_TOUR_STORAGE_KEY),
        );

        if (
            saved?.version === 2 &&
            ['active', 'skipped', 'completed'].includes(saved.status) &&
            Array.isArray(saved.dismissedSteps)
        ) {
            return {
                status: saved.status,
                dismissedSteps: saved.dismissedSteps.filter((step) =>
                    Object.hasOwn(CONTRIBUTE_TOUR_STEPS, step),
                ),
                completionIsVisible: false,
            };
        }
    } catch {
        // Guidance remains available if device storage cannot be read.
    }

    return createContributeTourProgress();
}

export async function writeContributeTourProgress(storage, progress) {
    try {
        await storage.setItem(
            CONTRIBUTE_TOUR_STORAGE_KEY,
            JSON.stringify({
                version: 2,
                status: progress.status,
                dismissedSteps: progress.dismissedSteps,
            }),
        );

        return true;
    } catch {
        return false;
    }
}
