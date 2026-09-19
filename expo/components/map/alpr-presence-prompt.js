import {
    canStartPresencePrompt,
    createPresencePassDetector,
    getPresenceFocus,
    PRESENCE_POLICY,
    presenceGuardsHold,
} from './alpr-presence-policy.js';

let nextAlertId = 1000000;

/** Owns one encounter through native presentation, interruption and asynchronous camera release. */
export function createPresencePrompt({
    coordinator,
    getContext,
    host,
    camera,
    highlight,
    platform,
    suppressAlerts = () => ({ release: () => false }),
    now = Date.now,
    trace = () => {},
}) {
    const detector = createPresencePassDetector();
    void coordinator.hydrate();
    let candidate = null,
        active = null,
        stopped = false;
    const clear = (manual = false) => {
        candidate = null;
        const previous = active;
        active = null;
        highlight(null);
        if (previous) {
            camera.restore(manual);
            try {
                host.dismissAlert(previous.id);
            } catch {
                /* A disconnected host has nothing to dismiss. */
            }
            if (previous.reservation && !previous.reservation.consumed)
                void coordinator.refused(previous.reservation).catch(() => {});
            previous.suppression?.release();
        }
    };
    const stillValid = (prompt) => {
        const context = getContext();
        return (
            !stopped &&
            active === prompt &&
            presenceGuardsHold(
                { ...context, warningBusy: false },
                prompt.encounter,
                now(),
            )
        );
    };
    const show = async (encounter) => {
        let prompt;
        try {
            prompt = {
                encounter,
                id: nextAlertId++,
                requestedAt: now(),
                shownAt: null,
                reservation: null,
                focus: null,
                suppression: suppressAlerts(),
            };
        } catch (error) {
            trace(`suppress-alerts-failed:${error.message}`);
            return;
        }
        active = prompt;
        trace('reserve');
        try {
            prompt.reservation = await coordinator.reserve(encounter);
            if (
                !prompt.reservation ||
                !stillValid(prompt) ||
                now() - encounter.passedAt > PRESENCE_POLICY.latestMs
            ) {
                if (active === prompt) clear();
                else if (prompt.reservation)
                    await coordinator.refused(prompt.reservation);
                return;
            }
            trace('request-native-alert');
            host.showAlert({
                id: prompt.id,
                durationMs: PRESENCE_POLICY.durationMs,
                priority: 'low',
                title: { text: 'Camera you just passed' },
                ...(encounter.street
                    ? { subtitle: { text: encounter.street } }
                    : {}),
                primaryAction: {
                    title: 'Still there? / Dismiss',
                    onPress: () => {
                        if (active === prompt) clear();
                    },
                },
                secondaryAction: {
                    title: 'Not there',
                    onPress: () => {
                        if (
                            active !== prompt ||
                            prompt.shownAt === null ||
                            !stillValid(prompt)
                        )
                            return;
                        clear();
                        // Persist/upload independently of banner and camera teardown.
                        void coordinator
                            .reportMissing(prompt.reservation, platform)
                            .catch(() => {});
                    },
                },
                onWillShow: async () => {
                    if (
                        !stillValid(prompt) ||
                        now() - encounter.passedAt > PRESENCE_POLICY.latestMs
                    ) {
                        if (active === prompt) clear();
                        else {
                            try {
                                host.dismissAlert(prompt.id);
                            } catch {}
                        }
                        return;
                    }
                    trace('native-presented');
                    prompt.shownAt = now();
                    try {
                        await coordinator.presented(prompt.reservation);
                        if (!stillValid(prompt)) return;
                        const focus = getPresenceFocus(encounter, getContext());
                        prompt.focus = focus;
                        if (
                            !focus ||
                            !(await camera.focus(focus, () =>
                                stillValid(prompt),
                            ))
                        ) {
                            if (active === prompt) clear();
                            return;
                        }
                        if (stillValid(prompt)) highlight(encounter.node);
                    } catch {
                        if (active === prompt) clear();
                    }
                },
                onDidDismiss: (reason) => {
                    trace(`native-dismissed:${reason}`);
                    if (active !== prompt) return;
                    // The Android bridge reserves SYSTEM for a refused/failed presentation.
                    if (
                        platform === 'android_auto' &&
                        reason === 'system' &&
                        prompt.reservation?.consumed
                    ) {
                        void coordinator
                            .refused(prompt.reservation, true)
                            .catch(() => {});
                    }
                    clear();
                },
            });
        } catch (error) {
            trace(`show-failed:${error.message}`);
            if (active === prompt) clear();
        }
    };
    return {
        inspect() {
            return {
                context: { ...getContext(), presenceFocus: active?.focus },
                encounter: active?.encounter ?? candidate,
                phase: stopped
                    ? 'stopped'
                    : active
                      ? active.shownAt === null
                          ? 'presenting'
                          : 'showing'
                      : candidate
                        ? 'pending'
                        : 'observing',
                pass: detector.inspect(),
                remainingMs:
                    active?.shownAt != null
                        ? Math.max(
                              0,
                              PRESENCE_POLICY.durationMs -
                                  (now() - active.shownAt),
                          )
                        : PRESENCE_POLICY.durationMs,
            };
        },
        get ownsCamera() {
            return active?.shownAt !== null && active?.shownAt !== undefined;
        },
        tick() {
            if (stopped) return;
            const context = getContext();
            const time = now();
            if (
                !context.enabled ||
                !context.connected ||
                !context.visible ||
                context.blocked ||
                context.manual
            ) {
                clear(context.manual);
                detector.reset();
                return;
            }
            const encounter = detector.update({ ...context, now: time });
            if (encounter && !active) {
                candidate = encounter;
                trace('pass-detected');
            }
            if (active) {
                const remaining =
                    active.shownAt === null
                        ? PRESENCE_POLICY.durationMs
                        : PRESENCE_POLICY.durationMs - (time - active.shownAt);
                if (
                    !stillValid(active) ||
                    remaining <= 0 ||
                    !getPresenceFocus(
                        active.encounter,
                        { ...context, presenceFocus: active.focus },
                        remaining,
                    ) ||
                    (active.shownAt === null &&
                        time - active.requestedAt >= 1000)
                )
                    clear();
                return;
            }
            if (!candidate) return;
            if (
                time - candidate.passedAt > PRESENCE_POLICY.latestMs ||
                context.routeKey !== candidate.routeKey
            ) {
                candidate = null;
                return;
            }
            if (
                !presenceGuardsHold(context, candidate, time) ||
                !canStartPresencePrompt(coordinator.state, candidate, time) ||
                !getPresenceFocus(candidate, context)
            )
                return;
            const ready = candidate;
            candidate = null;
            void show(ready);
        },
        interrupt(manual = false) {
            clear(manual);
            detector.reset();
        },
        stop() {
            stopped = true;
            clear();
            detector.reset();
        },
    };
}
