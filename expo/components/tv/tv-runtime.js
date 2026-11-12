import { requireOptionalNativeModule } from 'expo';
import * as SecureStore from 'expo-secure-store';
import { areaRequest, hasAreaDevice } from '../areas/areas-api';
import { createTvClient } from './tv-client';
import { createTvAreaSnapshot } from './tv-contract';

const KEY = 'daf.tv-pair.v1';
const secureOptions = {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
const native = requireOptionalNativeModule('TvCompanion');
let state = { paired: false, status: 'loading', error: null, actions: [] };
const listeners = new Set();
let syncPromise = null;
let generation = 0;
const update = (value) => {
    state = { ...state, ...value };
    listeners.forEach((listener) => listener());
};
export const subscribeTv = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
export const getTvState = () => state;
export const tvTransportAvailable = () => Boolean(native);
const credentials = {
    async get() {
        const raw = await SecureStore.getItemAsync(KEY, secureOptions);
        return raw ? JSON.parse(raw) : null;
    },
    async set(value) {
        await SecureStore.setItemAsync(
            KEY,
            JSON.stringify(value),
            secureOptions,
        );
    },
    async clear() {
        await SecureStore.deleteItemAsync(KEY, secureOptions);
    },
};
export const tvClient = createTvClient({
    transport: {
        request: (...args) => {
            if (!native)
                throw new Error(
                    'Install a phone build with TV pairing support.',
                );
            return native.request(...args);
        },
    },
    credentials,
});
export async function loadTvPairing() {
    try {
        update({
            paired: Boolean(await credentials.get()),
            status: native ? 'ready' : 'unavailable',
        });
    } catch {
        update({
            paired: false,
            status: 'error',
            error: 'Could not read TV pairing. Try again.',
        });
    }
}
export async function pairTv(uri) {
    if (state.paired)
        throw new Error('Unpair the current TV before pairing another.');
    generation++;
    await tvClient.pair(uri);
    update({ paired: true, status: 'ready', error: null });
    await syncTvAreas();
}
export async function unpairTv() {
    await tvClient.unpair();
    generation++;
    update({ paired: false, status: 'ready', error: null, actions: [] });
}
export function syncTvAreas() {
    if (syncPromise) return syncPromise;
    const started = generation;
    syncPromise = (async () => {
        if (!native || !(await credentials.get())) return;
        update({ status: 'syncing', error: null });
        let areas = [];
        const feeds = {};
        const cameras = {};
        try {
            if (await hasAreaDevice()) {
                areas = (await areaRequest('?window=7')).areas ?? [];
                for (
                    let index = 0;
                    index < Math.min(areas.length, 25);
                    index += 3
                ) {
                    await Promise.all(
                        areas.slice(index, index + 3).map(async (area) => {
                            await Promise.all([
                                areaRequest(
                                    `/${area.id}/changes?window=7&page=1`,
                                )
                                    .then((result) => {
                                        feeds[area.id] = result;
                                    })
                                    .catch(() => {
                                        feeds[area.id] = null;
                                    }),
                                areaRequest(`/${area.id}/cameras?page=1`)
                                    .then((result) => {
                                        cameras[area.id] = result;
                                    })
                                    .catch(() => {
                                        cameras[area.id] = null;
                                    }),
                            ]);
                        }),
                    );
                }
            }
            if (started !== generation) return;
            await tvClient.sync(
                createTvAreaSnapshot(areas, feeds, Date.now(), cameras),
            );
            if (started === generation)
                update({ status: 'synced', error: null });
        } catch (error) {
            if (started === generation)
                update({ status: 'offline', error: error.message });
        }
    })().finally(() => {
        syncPromise = null;
    });
    return syncPromise;
}
export async function pollTvActions() {
    if (!state.paired || !native) return;
    const started = generation;
    try {
        const actions = await tvClient.poll();
        if (started !== generation) return;
        update({ actions });
    } catch (error) {
        if (started === generation)
            update({ status: 'offline', error: error.message });
    }
}
export async function dismissTvAction(id) {
    await tvClient.acknowledge(id);
    update({ actions: state.actions.filter((action) => action.id !== id) });
}
