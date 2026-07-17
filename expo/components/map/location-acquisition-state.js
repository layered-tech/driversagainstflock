const LOCATION_UNAVAILABLE_MESSAGE =
    'Your device has not returned a precise position yet.';

export function getLocationAcquisitionPresentation({
    hasUserLocation,
    isLocating,
    locationError,
}) {
    if (hasUserLocation) {
        return {
            description:
                "Your position is ready. We're moving the map into place now.",
            eyebrow: 'GPS FIX FOUND',
            graphicIcon: 'circle-check',
            graphicTone: 'complete',
            phase: 'centering',
            showRetry: false,
            steps: [
                {
                    icon: 'check',
                    label: 'Location access',
                    status: 'Allowed',
                    tone: 'complete',
                },
                {
                    icon: 'check',
                    label: 'GPS position',
                    status: 'Found',
                    tone: 'complete',
                },
                {
                    icon: 'navigation',
                    label: 'Center map',
                    status: 'In progress',
                    tone: 'active',
                },
            ],
            title: 'Centering the map',
        };
    }

    if (!isLocating) {
        return {
            description: locationError || LOCATION_UNAVAILABLE_MESSAGE,
            eyebrow: 'GPS SIGNAL NEEDED',
            graphicIcon: 'triangle-alert',
            graphicTone: 'error',
            phase: 'error',
            showRetry: true,
            steps: [
                {
                    icon: 'check',
                    label: 'Location access',
                    status: 'Allowed',
                    tone: 'complete',
                },
                {
                    icon: 'triangle-alert',
                    label: 'GPS position',
                    status: 'Not found',
                    tone: 'error',
                },
                {
                    icon: 'navigation',
                    label: 'Center map',
                    status: 'Waiting',
                    tone: 'pending',
                },
            ],
            title: 'Still looking for GPS',
        };
    }

    return {
        description:
            "We're getting a precise GPS fix. This usually takes just a moment.",
        eyebrow: 'LOCATION ACCESS ON',
        graphicIcon: 'locate-fixed',
        graphicTone: 'active',
        phase: 'locating',
        showRetry: false,
        steps: [
            {
                icon: 'check',
                label: 'Location access',
                status: 'Allowed',
                tone: 'complete',
            },
            {
                icon: 'locate-fixed',
                label: 'GPS position',
                status: 'Acquiring',
                tone: 'active',
            },
            {
                icon: 'navigation',
                label: 'Center map',
                status: 'Waiting',
                tone: 'pending',
            },
        ],
        title: 'Finding your spot',
    };
}
