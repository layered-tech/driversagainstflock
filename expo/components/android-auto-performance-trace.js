import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
    addAutoPlaySessionStateListener,
    getAutoPlaySessionState,
} from './auto-play-session-state';

export const ANDROID_AUTO_PERFORMANCE_TRACE_STORAGE_KEY =
    'driversagainstflock.androidAutoPerformanceTrace.v1';

const TRACE_SCHEMA_VERSION = 1;
const MAX_TRACE_ENTRIES = 1000;
const PERSIST_DELAY_MS = 15000;
const EVENT_LOOP_WATCHDOG_INTERVAL_MS = 1000;
const EVENT_LOOP_DELAY_THRESHOLD_MS = 200;
const PERMITTED_TRACE_DATA_KEYS = new Set([
    'delayMs',
    'durationMs',
    'edgeCount',
    'errorName',
    'graphBuildDurationMs',
    'hadExistingGraph',
    'hasPrimaryPath',
    'listenerDurationMs',
    'matched',
    'matcherDurationMs',
    'requestDurationMs',
    'source',
    'timedOut',
    'wayCount',
]);

let activeTrace = null;
let eventLoopWatchdogId = null;
let persistenceTimerId = null;
let persistenceQueue = Promise.resolve();

function normalizeTraceData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return undefined;
    }

    const normalizedData = Object.entries(data).reduce(
        (result, [key, value]) => {
            if (!PERMITTED_TRACE_DATA_KEYS.has(key)) {
                return result;
            }

            if (
                typeof value === 'string' ||
                typeof value === 'boolean' ||
                typeof value === 'number'
            ) {
                result[key] = value;
            }

            return result;
        },
        {},
    );

    return Object.keys(normalizedData).length > 0 ? normalizedData : undefined;
}

function snapshotActiveTrace() {
    if (!activeTrace) {
        return null;
    }

    const { persistedRevision, revision, ...trace } = activeTrace;

    return {
        ...trace,
        entries: [...activeTrace.entries],
    };
}

function queueTracePersistence() {
    const trace = activeTrace;

    if (!trace || trace.revision === trace.persistedRevision) {
        return persistenceQueue;
    }

    const traceSnapshot = snapshotActiveTrace();

    if (!traceSnapshot) {
        return persistenceQueue;
    }

    const serializedTrace = JSON.stringify(traceSnapshot);
    const persistedRevision = trace.revision;

    persistenceQueue = persistenceQueue
        .catch(() => {})
        .then(() =>
            AsyncStorage.setItem(
                ANDROID_AUTO_PERFORMANCE_TRACE_STORAGE_KEY,
                serializedTrace,
            ),
        )
        .then(() => {
            if (activeTrace === trace) {
                trace.persistedRevision = persistedRevision;
            }
        })
        .catch(() => {});

    return persistenceQueue;
}

function scheduleTracePersistence() {
    if (persistenceTimerId !== null) {
        return;
    }

    persistenceTimerId = setTimeout(() => {
        persistenceTimerId = null;
        void queueTracePersistence();
    }, PERSIST_DELAY_MS);
}

function flushTracePersistence() {
    if (persistenceTimerId !== null) {
        clearTimeout(persistenceTimerId);
        persistenceTimerId = null;
    }

    return queueTracePersistence();
}

function addTraceEntry(event, data) {
    if (!activeTrace || typeof event !== 'string' || event.length === 0) {
        return false;
    }

    const normalizedData = normalizeTraceData(data);
    const elapsedMs = Math.max(0, Date.now() - activeTrace.startedAt);
    const entry = {
        event,
        elapsedMs,
        ...(normalizedData ? { data: normalizedData } : {}),
    };

    activeTrace.entries.push(entry);
    activeTrace.revision += 1;

    if (activeTrace.entries.length > MAX_TRACE_ENTRIES) {
        activeTrace.entries.splice(
            0,
            activeTrace.entries.length - MAX_TRACE_ENTRIES,
        );
    }

    scheduleTracePersistence();

    return true;
}

function stopEventLoopWatchdog() {
    if (eventLoopWatchdogId === null) {
        return;
    }

    clearInterval(eventLoopWatchdogId);
    eventLoopWatchdogId = null;
}

function startEventLoopWatchdog() {
    if (eventLoopWatchdogId !== null || !activeTrace) {
        return;
    }

    let expectedAt = Date.now() + EVENT_LOOP_WATCHDOG_INTERVAL_MS;

    eventLoopWatchdogId = setInterval(() => {
        const now = Date.now();
        const delayMs = Math.max(0, now - expectedAt);

        expectedAt = now + EVENT_LOOP_WATCHDOG_INTERVAL_MS;

        if (delayMs >= EVENT_LOOP_DELAY_THRESHOLD_MS) {
            addTraceEntry('js.event_loop_delay', { delayMs });
        }
    }, EVENT_LOOP_WATCHDOG_INTERVAL_MS);
}

function startTrace() {
    const startedAt = Date.now();

    activeTrace = {
        entries: [],
        persistedRevision: 0,
        revision: 0,
        schemaVersion: TRACE_SCHEMA_VERSION,
        startedAt,
    };
    addTraceEntry('android_auto.connected');
    startEventLoopWatchdog();
}

function finishTrace() {
    if (!activeTrace) {
        return;
    }

    addTraceEntry('android_auto.disconnected');
    activeTrace.endedAt = Date.now();
    stopEventLoopWatchdog();
    const persistence = flushTracePersistence();

    activeTrace = null;
    void persistence;
}

function androidAutoSessionIsActive(sessionState) {
    return Platform.OS === 'android' && sessionState?.isConnected === true;
}

export function recordAndroidAutoPerformanceTrace(event, data) {
    return addTraceEntry(event, data);
}

export async function getAndroidAutoPerformanceTraceAsync() {
    await flushTracePersistence();

    const inMemoryTrace = snapshotActiveTrace();

    if (inMemoryTrace) {
        return inMemoryTrace;
    }

    const serializedTrace = await AsyncStorage.getItem(
        ANDROID_AUTO_PERFORMANCE_TRACE_STORAGE_KEY,
    ).catch(() => null);

    if (!serializedTrace) {
        return null;
    }

    try {
        const storedTrace = JSON.parse(serializedTrace);

        return Array.isArray(storedTrace?.entries) ? storedTrace : null;
    } catch {
        return null;
    }
}

export function formatAndroidAutoPerformanceTrace(trace) {
    if (!trace || !Array.isArray(trace.entries)) {
        return 'No Android Auto performance trace is available yet.';
    }

    return JSON.stringify(trace, null, 2);
}

function synchronizeTraceForAutoPlaySession(sessionState) {
    if (androidAutoSessionIsActive(sessionState)) {
        if (!activeTrace) {
            startTrace();
        }

        return;
    }

    finishTrace();
}

addAutoPlaySessionStateListener(synchronizeTraceForAutoPlaySession);
synchronizeTraceForAutoPlaySession(getAutoPlaySessionState());
