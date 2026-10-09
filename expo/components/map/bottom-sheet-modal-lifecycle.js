/**
 * Serialize modal commands around Gorhom's asynchronous mount and unmount.
 * A ref exists before the native sheet does; only onChange confirms it opened.
 */
export function createBottomSheetModalLifecycle({
    requestFrame = requestAnimationFrame,
    cancelFrame = cancelAnimationFrame,
    getModal,
    onAnimate,
    onChange,
    onDismiss,
}) {
    let modal = null;
    let active = true;
    let phase = 'idle';
    let wantsOpen = false;
    let programmatic = false;
    let data;
    let dismissConfig;
    let frame = null;
    const currentModal = () => (getModal ? getModal() : modal);

    const cancelScheduledWork = () => {
        if (frame !== null) {
            cancelFrame(frame);
            frame = null;
        }
    };
    const schedulePresent = () => {
        if (!active || !currentModal() || !wantsOpen || frame !== null) {
            return;
        }
        frame = requestFrame(() => {
            frame = null;
            if (!active || !currentModal() || !wantsOpen) {
                return;
            }
            phase = 'mounting';
            currentModal().present(data);
        });
    };
    const dismissMountedSheet = () => {
        phase = 'closing';
        programmatic = true;
        currentModal()?.dismiss(dismissConfig);
    };
    const dismiss = (config) => {
        const cancelledPresentation = wantsOpen && phase === 'idle';
        wantsOpen = false;
        dismissConfig = config;
        cancelScheduledWork();
        if (!active) {
            return;
        }
        if (phase === 'idle') {
            if (cancelledPresentation) {
                onDismiss?.({ programmatic: true });
            }
            return;
        }
        const wasProgrammatic = programmatic;
        programmatic = true;
        if (
            phase === 'open' ||
            phase === 'hidden' ||
            (phase === 'closing' && !wasProgrammatic)
        ) {
            dismissMountedSheet();
        }
        // During mounting, wait for onChange before calling dismiss. Calling it
        // before the native ref exists wedges the library in DISMISSING.
    };
    const lifecycle = {
        setModal(value) {
            modal = value;
            if (phase === 'idle') {
                schedulePresent();
            }
        },
        activate() {
            active = true;
            if (phase === 'idle') {
                schedulePresent();
            }
        },
        dispose() {
            active = false;
            cancelScheduledWork();
        },
        present(nextData) {
            if (!active) {
                return;
            }
            wantsOpen = true;
            data = nextData;
            if (phase === 'idle' || phase === 'hidden') {
                schedulePresent();
            } else if (phase === 'open') {
                currentModal()?.present(data);
            } else if (phase === 'mounting') {
                programmatic = false;
            }
        },
        dismiss,
        close: dismiss,
        forceClose: dismiss,
        onAnimate(fromIndex, toIndex, ...args) {
            if (!active) {
                return;
            }
            if (toIndex < 0 && phase !== 'closing') {
                phase = 'closing';
                wantsOpen = false;
                programmatic = false;
            }
            onAnimate?.(fromIndex, toIndex, ...args);
        },
        onChange(index, ...args) {
            if (!active) {
                return;
            }
            onChange?.(index, ...args);
            if (index >= 0) {
                if (phase === 'closing' && programmatic) {
                    return;
                }
                cancelScheduledWork();
                phase = 'open';
                if (!wantsOpen && programmatic) {
                    dismissMountedSheet();
                } else {
                    wantsOpen = true;
                    programmatic = false;
                }
                return;
            }
            if (phase === 'open') {
                phase = 'closing';
                wantsOpen = false;
            }
            if (phase === 'closing' && !programmatic) {
                // A stack switch minimizes a sheet without dismissing it. Let
                // onDismiss run first, then allow an explicit open to restore it.
                cancelScheduledWork();
                frame = requestFrame(() => {
                    frame = null;
                    phase = 'hidden';
                    schedulePresent();
                });
            }
        },
        onDismiss() {
            if (!active) {
                return;
            }
            cancelScheduledWork();
            phase = 'idle';
            const wasProgrammatic = programmatic;
            programmatic = false;
            if (wantsOpen) {
                // The old dismissal must not clear a newer route/place selection.
                schedulePresent();
                return;
            }
            onDismiss?.({ programmatic: wasProgrammatic });
        },
    };
    for (const method of [
        'snapToIndex',
        'snapToPosition',
        'expand',
        'collapse',
    ]) {
        lifecycle[method] = (...args) => {
            if (active && phase === 'open') {
                currentModal()?.[method]?.(...args);
            }
        };
    }
    return lifecycle;
}
