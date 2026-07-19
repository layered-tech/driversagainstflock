export const AUTO_PLAY_SINGLE_RESULT_COUNTDOWN_SECONDS = 3;

export function createAutoPlaySingleResultCountdown({
    clearTimeoutFn = clearTimeout,
    onCancel = () => {},
    onComplete = () => {},
    onTick = () => {},
    requestIsCurrent = () => true,
    setTimeoutFn = setTimeout,
} = {}) {
    let isActive = true;
    let remainingSeconds = AUTO_PLAY_SINGLE_RESULT_COUNTDOWN_SECONDS;
    let timeoutId = null;

    const cancel = () => {
        if (!isActive) {
            return;
        }

        isActive = false;

        if (timeoutId !== null) {
            clearTimeoutFn(timeoutId);
            timeoutId = null;
        }

        onCancel();
    };

    const scheduleNextTick = () => {
        timeoutId = setTimeoutFn(() => {
            timeoutId = null;

            if (!isActive) {
                return;
            }

            if (!requestIsCurrent()) {
                cancel();
                return;
            }

            remainingSeconds -= 1;

            if (remainingSeconds <= 0) {
                isActive = false;
                onComplete();
                return;
            }

            onTick(remainingSeconds);
            scheduleNextTick();
        }, 1000);
    };

    if (!requestIsCurrent()) {
        cancel();
        return { cancel };
    }

    onTick(remainingSeconds);
    scheduleNextTick();

    return { cancel };
}
