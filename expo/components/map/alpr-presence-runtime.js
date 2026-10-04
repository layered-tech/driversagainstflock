import { createPlaceSearchSessionToken } from '../../lib/place-search-session';
import {
    getPrivateCacheItemStrict,
    privateCacheStorageIsEncrypted,
    setPrivateCacheItem,
} from '../../lib/private-cache-storage';
import {
    addAutoPlaySessionStateListener,
    getAutoPlaySessionState,
} from '../auto-play-session-state';
import { createPresenceCoordinator } from './alpr-presence-coordinator';
import { presenceDebugStore } from './alpr-presence-debug';
import { mapApiMocksAreEnabled } from './api-mocks';
import {
    APP_ENVIRONMENT,
    buildApiURL,
    SHOW_MAP_DEBUG_CONTROLS,
} from './config';
import { DEBUG_OVERLAY_ALPR_PRESENCE } from './debug-overlays';
import {
    addSharedMapPreferencesStateListener,
    getSharedMapPreferencesState,
} from './shared-map-preferences-sync';

const STORAGE_KEY = 'driversagainstflock.alprPresence.v1';
export const presenceCoordinator = createPresenceCoordinator({
    load: () => getPrivateCacheItemStrict(STORAGE_KEY),
    save: (value) => {
        if (!privateCacheStorageIsEncrypted())
            throw new Error('Encrypted storage unavailable');
        return setPrivateCacheItem(STORAGE_KEY, value);
    },
    randomId: () => createPlaceSearchSessionToken().replaceAll('-', ''),
    notify: (message) => {
        console.info(`[ALPR presence] ${message}`);
        if (APP_ENVIRONMENT === 'e2e' && message === 'Report queued') {
            const outbox = presenceCoordinator.state.outbox;
            const payload = outbox.at(-1).payload;
            console.info(
                '[E2E] presence-report-queued ' +
                    JSON.stringify({
                        count: outbox.length,
                        osmNodeId: payload.osm_node_id,
                        response: payload.response,
                        platform: payload.platform,
                    }),
            );
        }
        presenceDebugStore.event(message);
    },
    send: async (payload) => {
        if (APP_ENVIRONMENT === 'e2e' || mapApiMocksAreEnabled())
            throw new Error('E2E report remains queued');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(
                buildApiURL('/v1/alpr-presence-reports'),
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                },
            );
            const body = await response.json();
            if (
                !response.ok ||
                body.status !== 'received' ||
                !Number.isInteger(body.id)
            ) {
                const error = new Error('Report not received');
                error.permanent = [400, 409, 422].includes(response.status);
                throw error;
            }
        } finally {
            clearTimeout(timer);
        }
    },
});
let started = false;
export function startPresenceRuntime() {
    if (started) return;
    started = true;
    presenceDebugStore.setEnabled(
        SHOW_MAP_DEBUG_CONTROLS &&
            getSharedMapPreferencesState().debugOverlayVisibility?.[
                DEBUG_OVERLAY_ALPR_PRESENCE
            ] === true,
    );
    setInterval(() => {
        void presenceCoordinator.flush().catch(() => {});
    }, 30000);
    addAutoPlaySessionStateListener((session) => {
        void presenceCoordinator
            .activity(session.isConnected, false)
            .catch(() => {});
        if (session.isConnected) void presenceCoordinator.flush();
    });
    addSharedMapPreferencesStateListener((preferences) => {
        presenceDebugStore.setEnabled(
            SHOW_MAP_DEBUG_CONTROLS &&
                preferences.debugOverlayVisibility?.[
                    DEBUG_OVERLAY_ALPR_PRESENCE
                ] === true,
        );
        if (preferences.userLocation?.speed > 1.5) {
            void presenceCoordinator
                .activity(getAutoPlaySessionState().isConnected, true)
                .catch(() => {});
        }
    });
}

export async function resetPresenceDebugLimits() {
    if (!SHOW_MAP_DEBUG_CONTROLS) throw new Error('Debug controls unavailable');
    await presenceCoordinator.resetLimits();
}
