import { canStartPresencePrompt, createPresenceState, parsePresenceState, PRESENCE_POLICY, recordPresencePrompt, updatePresenceDrive } from './alpr-presence-policy.js';

/** One durable budget/outbox independent of Scorecard, component, route and car connection. */
export function createPresenceCoordinator({
    load,
    save,
    randomId,
    now = Date.now,
    send,
    notify = () => {},
}) {
    let state = null,
        failed = false,
        hydration = null,
        writes = Promise.resolve(),
        flushing = false,
        limitsGeneration = 0;
    function mutate(change) {
        const operation = writes.then(async () => {
            if (!state || failed)
                throw new Error('Private presence state unavailable');
            const next = change(state);
            if (next === state) return state;
            await save(JSON.stringify(next));
            state = next;
            return next;
        });
        writes = operation.catch(() => {
            failed = true;
            notify('Presence storage unavailable');
        });
        return operation;
    }
    return {
        get state() {
            return failed ? null : state;
        },
        async hydrate() {
            if (!hydration)
                hydration = (async () => {
                    try {
                        const value = await load();
                        state =
                            value === null
                                ? createPresenceState(randomId(), now())
                                : parsePresenceState(value);
                        // A killed process cannot establish when the cable was disconnected.
                        // Retain its budget until an observed disconnection establishes an end.
                        await save(JSON.stringify(state));
                    } catch {
                        failed = true;
                        state = null;
                        notify('Presence storage unavailable');
                    }
                })();
            await hydration;
            return this.state;
        },
        async activity(connected, driving) {
            await this.hydrate();
            if (!this.state) return;
            const time = now();
            if (
                state.drive.connected === connected &&
                (!driving || time - state.drive.lastActivityAt < 15000)
            )
                return;
            await mutate((current) =>
                updatePresenceDrive(current, { connected, driving, now: time }),
            );
        },
        async resetLimits() {
            await this.hydrate();
            await mutate((current) => {
                limitsGeneration += 1;
                return {
                    ...current,
                    drive: { ...current.drive, count: 0 },
                    lastPromptAt: null,
                    nodeTimes: {},
                };
            });
            notify('Cooldowns and drive budget reset');
        },
        async reserve(encounter) {
            await this.hydrate();
            if (
                !canStartPresencePrompt(this.state, encounter, now()) ||
                state.outbox.length >= PRESENCE_POLICY.maximumOutbox
            )
                return null;
            let reservation = null;
            await mutate((current) => {
                const startedAt = now();
                if (
                    !canStartPresencePrompt(current, encounter, startedAt) ||
                    current.outbox.length >= PRESENCE_POLICY.maximumOutbox
                )
                    return current;
                reservation = {
                    eventKey: randomId(),
                    limitsGeneration,
                    encounter,
                    startedAt,
                    before: {
                        drive: { ...current.drive },
                        lastPromptAt: current.lastPromptAt,
                        nodeTimes: { ...current.nodeTimes },
                    },
                    consumed: false,
                    answered: false,
                };
                return recordPresencePrompt(current, encounter, startedAt);
            });
            return reservation;
        },

        async presented(reservation) {
            if (reservation.consumed) return;
            reservation.consumed = true;
            notify('Confirmation shown');
            const start = now();
            reservation.startedAt = start;
            await mutate((current) =>
                reservation.limitsGeneration !== limitsGeneration
                    ? current
                    : {
                          ...current,
                          lastPromptAt: start,
                          nodeTimes: {
                              ...current.nodeTimes,
                              [reservation.encounter.osmNodeId]: start,
                          },
                      },
            );
        },
        async refused(reservation, nativeRefusal = false) {
            if (reservation.consumed && !nativeRefusal) return;
            await mutate((current) =>
                reservation.limitsGeneration !== limitsGeneration
                    ? current
                    : {
                          ...current,
                          drive: {
                              ...current.drive,
                              count: reservation.before.drive.count,
                          },
                          lastPromptAt: reservation.before.lastPromptAt,
                          nodeTimes: reservation.before.nodeTimes,
                      },
            );
        },
        async reportMissing(reservation, platform) {
            if (!reservation.consumed || reservation.answered) return false;
            reservation.answered = true;
            const occurredAt = new Date(now()).toISOString();
            const { encounter } = reservation;
            const payload = {
                osm_node_id: encounter.osmNodeId,
                response: 'not_there',
                platform,
                reporter_id: state.reporterId,
                event_key: reservation.eventKey,
                passed_at: new Date(encounter.passedAt).toISOString(),
                occurred_at: occurredAt,
                submitted_at: occurredAt,
                observed: {
                    version: encounter.node.osm_version ?? null,
                    latitude: encounter.node.latitude,
                    longitude: encounter.node.longitude,
                    street: encounter.street ?? null,
                },
            };
            await mutate((current) => {
                if (current.outbox.length >= PRESENCE_POLICY.maximumOutbox)
                    throw new Error('Presence outbox is full');
                return {
                    ...current,
                    outbox: [
                        ...current.outbox,
                        { payload, attempts: 0, retryAt: 0 },
                    ],
                };
            });
            notify('Report queued');
            void this.flush();
            return true;
        },
        async flush() {
            await this.hydrate();
            if (!this.state || flushing) return;
            flushing = true;
            try {
                for (const item of [...state.outbox]) {
                    if (item.retryAt === null || item.retryAt > now()) continue;
                    try {
                        await send(item.payload);
                        await mutate((current) => ({
                            ...current,
                            outbox: current.outbox.filter(
                                (next) =>
                                    next.payload.event_key !==
                                    item.payload.event_key,
                            ),
                        }));
                        notify('Report received');
                    } catch (error) {
                        if (failed) break;
                        await mutate((current) => ({
                            ...current,
                            outbox: current.outbox.map((next) =>
                                next.payload.event_key ===
                                item.payload.event_key
                                    ? {
                                          ...next,
                                          attempts: next.attempts + 1,
                                          retryAt:
                                              error?.permanent ||
                                              next.attempts >= 19
                                                  ? null
                                                  : now() +
                                                    Math.min(
                                                        3600000,
                                                        30000 *
                                                            2 **
                                                                Math.min(
                                                                    7,
                                                                    next.attempts,
                                                                ),
                                                    ),
                                          error: error?.permanent
                                              ? 'Report rejected'
                                              : next.attempts >= 19
                                                ? 'Retries paused'
                                                : 'Waiting to retry',
                                      }
                                    : next,
                            ),
                        }));
                        notify(
                            error?.permanent
                                ? 'Report rejected'
                                : item.attempts >= 19
                                  ? 'Report queued; retries paused'
                                  : 'Report queued; waiting to retry',
                        );
                        break;
                    }
                }
            } finally {
                flushing = false;
            }
        },
    };
}
