const METERS_PER_MILE = 1609.344;
const UPCOMING_ALERT_WARNING_DISTANCE_METERS = METERS_PER_MILE * 2;
const FEET_PER_METER = 3.28084;

function getAlertId(alert, index) {
    const id = alert?.id;

    return id === null || id === undefined || id === ''
        ? `upcoming-alert-${index}`
        : String(id);
}

function getTrimmedString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getPoliceDescription(alert) {
    return String(alert?.subtype ?? '').toUpperCase() === 'POLICE_HIDING'
        ? 'Hidden police'
        : 'Police reported';
}

export function formatUpcomingAlertDistance(distanceMeters) {
    const distance = Number(distanceMeters);

    if (!Number.isFinite(distance) || distance < 0) {
        return null;
    }

    const feet = Math.round(distance * FEET_PER_METER);

    if (feet < 1000) {
        return `${feet} ft`;
    }

    const miles = Math.round((distance / METERS_PER_MILE) * 10) / 10;

    return `${miles} mi`;
}

export function formatUpcomingAlertAge(publishedAt, now = Date.now()) {
    const publishedAtMs = Date.parse(publishedAt);

    if (!Number.isFinite(publishedAtMs) || !Number.isFinite(now)) {
        return null;
    }

    const elapsedMinutes = Math.max(
        0,
        Math.floor((now - publishedAtMs) / 60_000),
    );

    if (elapsedMinutes < 1) {
        return 'just now';
    }

    if (elapsedMinutes < 60) {
        return `${elapsedMinutes} min ago`;
    }

    const elapsedHours = Math.floor(elapsedMinutes / 60);

    return `${elapsedHours} hr${elapsedHours === 1 ? '' : 's'} ago`;
}

export function getUpcomingAlertPassProgress(distanceMeters) {
    const distance = Number(distanceMeters);

    if (!Number.isFinite(distance)) {
        return 0;
    }

    return Math.min(
        1,
        Math.max(0, distance / UPCOMING_ALERT_WARNING_DISTANCE_METERS),
    );
}

export function getVisibleUpcomingAlerts(alerts, dismissedAlertIds) {
    if (!Array.isArray(alerts)) {
        return [];
    }

    return alerts.filter((alert, index) => {
        const type = alert?.type;

        return (
            (type === 'alpr' || type === 'police') &&
            !dismissedAlertIds?.has(getAlertId(alert, index))
        );
    });
}

export function getUpcomingAlertPresentation(alert, nextAlert) {
    if (alert?.type !== 'alpr' && alert?.type !== 'police') {
        return null;
    }

    const isPoliceAlert = alert.type === 'police';
    const distance = formatUpcomingAlertDistance(alert.distanceMeters);
    const nextDistance = formatUpcomingAlertDistance(nextAlert?.distanceMeters);
    const customSubtitle = getTrimmedString(alert.subtitle);
    const reportedAge = isPoliceAlert
        ? formatUpcomingAlertAge(alert.publishedAt)
        : null;
    const street = getTrimmedString(alert.street);
    const primarySubtitle = customSubtitle
        ? customSubtitle
        : isPoliceAlert
          ? [
                reportedAge ? `Reported on Waze ${reportedAge}` : null,
                street ? `near ${street}` : null,
            ]
                .filter(Boolean)
                .join(' ')
          : street
            ? `ALPR camera near ${street}`
            : 'ALPR camera on your current path';
    const nextAlertDescription = nextAlert
        ? `${
              nextAlert.type === 'police'
                  ? getPoliceDescription(nextAlert)
                  : 'ALPR camera'
          }${nextDistance ? ` ${nextDistance} ahead` : ' ahead'}`
        : null;

    return {
        accentColor: isPoliceAlert ? '#2E8BFF' : '#FF4D4F',
        distance: distance ?? 'Ahead',
        icon: isPoliceAlert ? 'shield' : 'camera',
        iconBackgroundClassName: isPoliceAlert
            ? 'bg-daf-azure/15 dark:bg-daf-azure/20'
            : 'bg-daf-alert/15 dark:bg-daf-alert/20',
        subtitle: [primarySubtitle, nextAlertDescription]
            .filter(Boolean)
            .join('. '),
        title: isPoliceAlert ? 'Police reported ahead' : 'ALPR camera ahead',
    };
}

export function getUpcomingAlertId(alert, index) {
    return getAlertId(alert, index);
}

export function getNextUpcomingAlert(primaryAlert, alerts) {
    if (!primaryAlert || !Array.isArray(alerts)) {
        return null;
    }

    return (
        alerts.find((alert) => alert.type !== primaryAlert.type) ??
        alerts.find((alert) => alert !== primaryAlert) ??
        null
    );
}
