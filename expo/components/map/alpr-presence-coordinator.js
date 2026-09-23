import { canStartPresencePrompt, createPresenceState, parsePresenceState, PRESENCE_POLICY, recordPresencePrompt, updatePresenceDrive } from './alpr-presence-policy.js';
import { automotiveAlertHistoryAllowsEntry, createAutomotiveAlertHistory, recordAutomotiveAlertHistoryEntry } from './automotive-alert-policy.js';

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
        limitsGeneration = 0,
        pendingPresenceReservation = null,
        presentedReservations = [],
        volatileAutomotiveAlertHistory = null;
    let automotiveHistoryGeneration = 0;
    let automotiveHistoryResetting = false;
    const listeners = new Set();
    const pendingAutomotiveAlerts = new Map();
    function publish() {
        for (const listener of listeners) listener();
    }
    function getCommittedAutomotiveAlertHistory() {
        if (!state || failed) return null;

        return volatileAutomotiveAlertHistory?.driveId === state.drive.id
            ? volatileAutomotiveAlertHistory
            : state.automotiveAlertHistory;
    }
    function mutate(change) {
        const operation = writes.then(async () => {
            if (!state || failed)
                throw new Error('Private presence state unavailable');
            const next = change(state);
            if (next === state) return state;
            await save(JSON.stringify(next));
            state = next;
            publish();
            return next;
        });
        writes = operation.catch(() => {
            failed = true;
            notify('Presence storage unavailable');
            publish();
        });
        return operation;
    }
    return {
        get state() {
            return failed ? null : state;
        },
        get automotiveAlertHistory() {
            const current = this.state;

            if (!current) return null;

            let history = getCommittedAutomotiveAlertHistory();

            for (const pending of pendingAutomotiveAlerts.values()) {
                if (pending.driveId === current.drive.id) {
                    history = recordAutomotiveAlertHistoryEntry(
                        history,
                        pending.entry,
                        pending.claimedAt,
                    );
                }
            }

            return history;
        },
        subscribe(listener) {
            listeners.add(listener);

            return () => listeners.delete(listener);
        },
        async hydrate() {
            if (!hydration)
                hydration = (async () => {
                    try {
                        const value = await load();
                        state =
                            value === null
                                ? createPresenceState(randomId(), now())
                                : parsePresenceState(value, randomId, now());
                        // A killed process cannot establish when the cable was disconnected.
                        // Retain its budget until an observed disconnection establishes an end.
                        await save(JSON.stringify(state));
                    } catch {
                        failed = true;
                        state = null;
                        notify('Presence storage unavailable');
                    } finally {
                        publish();
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
                updatePresenceDrive(current, {
                    connected,
                    driving,
                    now: time,
                    createDriveId: randomId,
                }),
            );
        },
        async resetLimits() {
            await this.hydrate();
            await mutate((current) => {
                limitsGeneration += 1;
                pendingPresenceReservation = null;
                return {
                    ...current,
                    drive: { ...current.drive, count: 0 },
                    lastPromptAt: null,
                    nodeTimes: {},
                };
            });
            notify('Cooldowns and drive budget reset');
        },
        async resetAutomotiveAlertHistory() {
            await this.hydrate();
            if (automotiveHistoryResetting)
                throw new Error('Warning reset already in progress');
            automotiveHistoryResetting = true;
            automotiveHistoryGeneration += 1;
            pendingAutomotiveAlerts.clear();
            try {
                await mutate((current) => ({
                    ...current,
                    automotiveAlertHistory: createAutomotiveAlertHistory(
                        current.drive.id,
                    ),
                }));
                volatileAutomotiveAlertHistory = null;
            } finally {
                automotiveHistoryResetting = false;
                publish();
            }
        },
        claimAutomotiveAlert(entry) {
            const current = this.state;

            if (
                !current ||
                automotiveHistoryResetting ||
                !automotiveAlertHistoryAllowsEntry(
                    this.automotiveAlertHistory,
                    entry,
                    null,
                    now(),
                )
            ) {
                return null;
            }

            const generation = automotiveHistoryGeneration;
            const token = Symbol('automotive-alert-claim');
            const driveId = current.drive.id;
            let settled = false;
            pendingAutomotiveAlerts.set(token, {
                claimedAt: now(),
                driveId,
                entry,
            });
            publish();

            return {
                commit: () => {
                    if (settled) return false;
                    settled = true;
                    pendingAutomotiveAlerts.delete(token);

                    if (
                        this.state?.drive.id !== driveId ||
                        generation !== automotiveHistoryGeneration
                    ) {
                        publish();
                        return false;
                    }

                    const recorded = this.recordAutomotiveAlertShown(entry);
                    if (!recorded) publish();
                    return recorded;
                },
                release: () => {
                    if (settled) return false;
                    settled = true;
                    pendingAutomotiveAlerts.delete(token);
                    publish();
                    return true;
                },
            };
        },
        recordAutomotiveAlertShown(entry) {
            const current = this.state;

            if (!current || automotiveHistoryResetting) return false;

            const driveId = current.drive.id;
            const history = getCommittedAutomotiveAlertHistory();
            const shownAt = now();
            const nextHistory = recordAutomotiveAlertHistoryEntry(
                history,
                entry,
                shownAt,
            );

            if (nextHistory === history) return false;

            volatileAutomotiveAlertHistory = nextHistory;
            publish();
            void mutate((latest) =>
                latest.drive.id === driveId
                    ? {
                          ...latest,
                          automotiveAlertHistory:
                              recordAutomotiveAlertHistoryEntry(
                                  latest.automotiveAlertHistory,
                                  entry,
                                  shownAt,
                              ),
                      }
                    : latest,
            ).catch(() => {});

            return true;
        },
        async reserve(encounter) {
            await this.hydrate();
            if (
                !canStartPresencePrompt(this.state, encounter, now()) ||
                state.outbox.length >= PRESENCE_POLICY.maximumOutbox
            )
                return null;
            if (pendingPresenceReservation) return null;
            const reservation = {
                eventKey: randomId(),
                limitsGeneration,
                driveId: state.drive.id,
                encounter,
                startedAt: null,
                before: null,
                consumed: false,
                refused: false,
                answered: false,
            };
            pendingPresenceReservation = reservation;
            return reservation;
        },

        async presented(reservation) {
            if (
                reservation.consumed ||
                reservation.refused ||
                pendingPresenceReservation !== reservation
            )
                return;
            reservation.consumed = true;
            notify('Confirmation shown');
            const start = now();
            reservation.startedAt = start;
            try {
                await mutate((current) => {
                    if (
                        reservation.limitsGeneration !== limitsGeneration ||
                        reservation.driveId !== current.drive.id
                    )
                        return current;
                    reservation.before = {
                        drive: { ...current.drive },
                        lastPromptAt: current.lastPromptAt,
                        nodeTimes: { ...current.nodeTimes },
                    };
                    presentedReservations = presentedReservations.filter(
                        (entry) =>
                            entry.limitsGeneration === limitsGeneration &&
                            entry.driveId === current.drive.id,
                    );
                    presentedReservations.push(reservation);
                    return recordPresencePrompt(
                        current,
                        reservation.encounter,
                        start,
                    );
                });
            } finally {
                if (pendingPresenceReservation === reservation)
                    pendingPresenceReservation = null;
            }
        },
        async refused(reservation, nativeRefusal = false) {
            if (reservation.refused || (reservation.consumed && !nativeRefusal))
                return;
            reservation.refused = true;
            if (pendingPresenceReservation === reservation)
                pendingPresenceReservation = null;
            if (!reservation.consumed) return;
            await mutate((current) => {
                if (
                    reservation.limitsGeneration !== limitsGeneration ||
                    reservation.driveId !== current.drive.id ||
                    !reservation.before
                )
                    return current;
                const accepted = presentedReservations.filter(
                    (entry) => !entry.refused,
                );
                const nodeId = reservation.encounter.osmNodeId;
                const firstForNode = presentedReservations.find(
                    (entry) => entry.encounter.osmNodeId === nodeId,
                );
                const latestForNode = accepted.findLast(
                    (entry) => entry.encounter.osmNodeId === nodeId,
                );
                const nodeTime =
                    latestForNode?.startedAt ??
                    firstForNode.before.nodeTimes[nodeId];
                const nodeTimes = { ...current.nodeTimes };
                if (nodeTime === undefined) delete nodeTimes[nodeId];
                else nodeTimes[nodeId] = nodeTime;
                return {
                    ...current,
                    drive: {
                        ...current.drive,
                        count: Math.max(0, current.drive.count - 1),
                    },
                    lastPromptAt:
                        accepted.at(-1)?.startedAt ??
                        presentedReservations[0].before.lastPromptAt,
                    nodeTimes,
                };
            });
        },
        async reportMissing(reservation, platform) {
            if (
                !reservation.consumed ||
                reservation.refused ||
                reservation.answered
            )
                return false;
            reservation.answered = true;
            const occurredAt = new Date(now()).toISOString();
            const { encounter } = reservation;
            const payload = {
                osm_node_id: encounter.osmNodeId,
                response: 'not_there',
                platform,
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
