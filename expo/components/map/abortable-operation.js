function makeAbortError() {
    const error = new Error('Request aborted.');

    error.name = 'AbortError';

    return error;
}

export function runAbortableOperation(operation, signal) {
    if (signal?.aborted) {
        return Promise.reject(makeAbortError());
    }

    let operationPromise;

    try {
        // Start first so a native transport can register its cancellation
        // listener before this wrapper observes the same abort event.
        operationPromise = Promise.resolve(operation());
    } catch (error) {
        return Promise.reject(error);
    }

    if (!signal) {
        return operationPromise;
    }

    return new Promise((resolve, reject) => {
        let isSettled = false;
        const settle = (callback, value) => {
            if (isSettled) {
                return;
            }

            isSettled = true;
            signal.removeEventListener('abort', handleAbort);
            callback(value);
        };
        const handleAbort = () => settle(reject, makeAbortError());

        signal.addEventListener('abort', handleAbort, { once: true });
        operationPromise.then(
            (value) => settle(resolve, value),
            (error) => settle(reject, error),
        );

        if (signal.aborted) {
            handleAbort();
        }
    });
}
