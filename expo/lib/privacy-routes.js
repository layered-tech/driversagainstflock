const SCORECARD_PATH_PREFIX = '/scorecard';

export function isPrivateScorecardPath(pathname) {
    return (
        pathname === SCORECARD_PATH_PREFIX ||
        pathname?.startsWith(`${SCORECARD_PATH_PREFIX}/`) === true
    );
}

export function getPrivacySafeMonitoringPathname(pathname) {
    return isPrivateScorecardPath(pathname)
        ? `${SCORECARD_PATH_PREFIX}/private`
        : pathname;
}

export function redactPrivateScorecardPath(value) {
    if (typeof value !== 'string') {
        return value;
    }

    return value.replace(
        /\/scorecard(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%\-\[\]]*)*/g,
        `${SCORECARD_PATH_PREFIX}/private`,
    );
}
