const VISIBLE_RENDER_STATES = new Set([
    'willAppear',
    'didAppear',
    'willDisappear',
]);

let autoPlaySessionIsConnected = false;
let autoPlaySessionRenderState = 'didDisappear';
const autoPlaySessionStateListeners = new Set();

function emitAutoPlaySessionState() {
    const state = getAutoPlaySessionState();

    autoPlaySessionStateListeners.forEach((listener) => listener(state));
}

export function getAutoPlaySessionState() {
    return {
        isConnected: autoPlaySessionIsConnected,
        isVisible:
            autoPlaySessionIsConnected &&
            VISIBLE_RENDER_STATES.has(autoPlaySessionRenderState),
        renderState: autoPlaySessionRenderState,
    };
}

export function autoPlaySessionOwnsForegroundLocation(platform) {
    const state = getAutoPlaySessionState();

    if (platform === 'android') {
        return state.isConnected;
    }

    if (platform === 'ios') {
        return state.isVisible;
    }

    return false;
}

export function setAutoPlaySessionConnected(isConnected) {
    const nextIsConnected = isConnected === true;

    if (autoPlaySessionIsConnected === nextIsConnected) {
        return;
    }

    autoPlaySessionIsConnected = nextIsConnected;

    if (!nextIsConnected) {
        autoPlaySessionRenderState = 'didDisappear';
    }

    emitAutoPlaySessionState();
}

export function setAutoPlaySessionRenderState(renderState) {
    if (
        typeof renderState !== 'string' ||
        autoPlaySessionRenderState === renderState
    ) {
        return;
    }

    autoPlaySessionRenderState = renderState;
    emitAutoPlaySessionState();
}

export function addAutoPlaySessionStateListener(listener) {
    autoPlaySessionStateListeners.add(listener);
    listener(getAutoPlaySessionState());

    return () => {
        autoPlaySessionStateListeners.delete(listener);
    };
}
