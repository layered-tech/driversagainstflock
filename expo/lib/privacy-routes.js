const SCORECARD_PATH_PREFIX = '/scorecard';

export function isPrivateScorecardPath(pathname) {
    return (
        pathname === SCORECARD_PATH_PREFIX ||
        pathname?.startsWith(`${SCORECARD_PATH_PREFIX}/`) === true
    );
}

export function getPrivacySafeMonitoringPathname(pathname) {
    return typeof pathname === 'string'
        ? redactPrivateScorecardPath(pathname)
        : pathname;
}

export function redactPrivateScorecardPath(value) {
    if (typeof value !== 'string') {
        return value;
    }

    return value.replace(
        /\/scorecard\/event\/[A-Za-z0-9._~!$&'()*+,;=:@%\-\[\]]+/g,
        `${SCORECARD_PATH_PREFIX}/event/[id]`,
    );
}
