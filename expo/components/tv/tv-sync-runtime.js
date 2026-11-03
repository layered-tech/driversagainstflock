import { useEffect } from 'react';
import { AppState } from 'react-native';
import { loadTvPairing, syncTvAreas, pollTvActions } from './tv-runtime';

export function TvSyncRuntime() {
    useEffect(() => {
        let stopped = false;
        let running = false;
        let lastSync = 0;
        async function tick() {
            if (stopped || running || AppState.currentState !== 'active')
                return;
            running = true;
            try {
                if (Date.now() - lastSync >= 60_000) {
                    await syncTvAreas();
                    lastSync = Date.now();
                }
                if (!stopped) await pollTvActions();
            } catch {
                // The next foreground poll retries transient storage or network failures.
            } finally {
                running = false;
            }
        }
        loadTvPairing().then(() => {
            if (!stopped) tick();
        });
        const timer = globalThis.setInterval(tick, 5000);
        const subscription = AppState.addEventListener('change', (status) => {
            if (status === 'active') {
                lastSync = 0;
                tick();
            }
        });
        return () => {
            stopped = true;
            globalThis.clearInterval(timer);
            subscription.remove();
        };
    }, []);
    return null;
}
