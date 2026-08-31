export function acquireOperationLock(lockRef) {
    if (lockRef.current) {
        return false;
    }

    lockRef.current = true;

    return true;
}

export function releaseOperationLock(lockRef) {
    lockRef.current = false;
}
