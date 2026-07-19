function getAccountStep({ hasUser, isAuthenticated, mode }) {
    if (isAuthenticated && hasUser) {
        return {
            icon: 'check',
            label: 'OpenStreetMap account',
            status: 'Connected',
            tone: 'complete',
        };
    }

    return {
        icon: 'user',
        label: 'OpenStreetMap account',
        status: mode === 'restoring' ? 'Checking' : 'Connecting',
        tone: 'active',
    };
}

function getEditingAccessStep({ hasUser, hasWriteScope, isAuthenticated }) {
    if (hasWriteScope) {
        return {
            icon: 'check',
            label: 'Editing access',
            status: 'Allowed',
            tone: 'complete',
        };
    }

    if (isAuthenticated && hasUser) {
        return {
            icon: 'shield-check',
            label: 'Editing access',
            status: 'Requesting',
            tone: 'active',
        };
    }

    return {
        icon: 'shield',
        label: 'Editing access',
        status: 'Waiting',
        tone: 'pending',
    };
}

export function getContributeAuthProgressPresentation({
    hasUser,
    hasWriteScope,
    isAuthenticated,
    isLoading,
    isSigningIn,
}) {
    const mode = isSigningIn ? 'connecting' : isLoading ? 'restoring' : null;

    if (!mode) {
        return null;
    }

    const accountIsConnected = isAuthenticated && hasUser;
    const graphicAccessibilityLabel =
        mode === 'restoring'
            ? 'Checking this device for a saved OpenStreetMap account.'
            : accountIsConnected && hasWriteScope
              ? 'OpenStreetMap account connected with editing access.'
              : accountIsConnected
                ? 'OpenStreetMap account connected. Requesting editing access.'
                : 'Connecting the OpenStreetMap account.';

    return {
        description:
            mode === 'restoring'
                ? "We're checking this device for your saved OpenStreetMap account."
                : "We're securely connecting your OpenStreetMap account and loading your profile.",
        eyebrow:
            mode === 'restoring'
                ? 'SAVED OSM ACCOUNT'
                : 'OPENSTREETMAP SIGN-IN',
        graphicAccessibilityLabel,
        graphicIcon: accountIsConnected ? 'circle-check' : 'shield-check',
        graphicTone:
            accountIsConnected && hasWriteScope ? 'complete' : 'active',
        mode,
        steps: [
            getAccountStep({ hasUser, isAuthenticated, mode }),
            getEditingAccessStep({
                hasUser,
                hasWriteScope,
                isAuthenticated,
            }),
        ],
        title:
            mode === 'restoring'
                ? 'Checking your account'
                : accountIsConnected
                  ? 'Account connected'
                  : 'Connecting your account',
    };
}
