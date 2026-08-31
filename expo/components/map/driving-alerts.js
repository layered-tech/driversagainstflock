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
    return String(
        alert?.subtype ?? alert?.source?.subtype ?? '',
    ).toUpperCase() === 'POLICE_HIDING'
        ? 'Hidden police'
        : 'Police reported';
}

function getAlertSource(alert) {
    return alert?.source &&
        typeof alert.source === 'object' &&
        !Array.isArray(alert.source)
        ? alert.source
        : null;
}

function getAlprSourceLabel(alert) {
    const tags = getAlertSource(alert)?.tags;
    const label = [
        tags?.brand,
        tags?.manufacturer,
        alert?.subtitle,
        tags?.operator,
        tags?.name,
    ]
        .map(getTrimmedString)
        .find(Boolean);

    return (
        label?.replace(/^flock safety$/i, 'Flock') ??
        'OpenStreetMap ALPR reader'
    );
}

function getVisibleUpcomingAlertEntries(alerts, dismissedAlertIds) {
    if (!Array.isArray(alerts)) {
        return [];
    }

    return alerts.flatMap((alert, index) => {
        const type = alert?.type;
        const alertId = getAlertId(alert, index);

        if (
            (type !== 'alpr' && type !== 'police') ||
            dismissedAlertIds?.has?.(alertId)
        ) {
            return [];
        }

        return [{ alert, id: alertId, index }];
    });
}

function getUpcomingAlertDistanceForSort(alert) {
    const distance = Number(alert?.distanceMeters);

    return Number.isFinite(distance) && distance >= 0
        ? distance
        : Number.POSITIVE_INFINITY;
}

function getClosestUpcomingAlert(entries, type) {
    return entries.reduce((closestEntry, entry) => {
        if (entry.alert.type !== type) {
            return closestEntry;
        }

        if (!closestEntry) {
            return entry;
        }

        const candidateDistance = getUpcomingAlertDistanceForSort(entry.alert);
        const closestDistance = getUpcomingAlertDistanceForSort(
            closestEntry.alert,
        );

        return candidateDistance < closestDistance ||
            (candidateDistance === closestDistance &&
                entry.index < closestEntry.index)
            ? entry
            : closestEntry;
    }, null);
}

function getWazeReportedAge(alert, now) {
    return (
        formatUpcomingAlertAge(getAlertSource(alert)?.publishedAt, now) ??
        formatUpcomingAlertAge(alert?.publishedAt, now)
    );
}

function getCompactUpcomingAlertPresentation(entry, now) {
    const { alert, id } = entry;
    const isPoliceAlert = alert.type === 'police';
    const reportedAge = isPoliceAlert ? getWazeReportedAge(alert, now) : null;

    return {
        accentColor: isPoliceAlert ? '#2E8BFF' : '#FF4D4F',
        alert,
        approachProgress: getUpcomingAlertApproachProgress(
            alert.distanceMeters,
        ),
        distance: formatUpcomingAlertDistance(alert.distanceMeters) ?? 'Ahead',
        id,
        icon: isPoliceAlert ? 'shield' : 'camera',
        iconBackgroundClassName: isPoliceAlert
            ? 'bg-daf-azure/15 dark:bg-daf-azure/20'
            : 'bg-daf-alert/15 dark:bg-daf-alert/20',
        subtitle: isPoliceAlert
            ? ['Waze', reportedAge].filter(Boolean).join(' · ')
            : [getAlprSourceLabel(alert), 'on your route'].join(' · '),
        title: isPoliceAlert ? 'Police reported' : 'ALPR camera',
        type: alert.type,
    };
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

export function getUpcomingAlertApproachProgress(distanceMeters) {
    const distance = Number(distanceMeters);

    if (!Number.isFinite(distance)) {
        return 0;
    }

    return Math.min(
        1,
        Math.max(0, 1 - distance / UPCOMING_ALERT_WARNING_DISTANCE_METERS),
    );
}

export function getVisibleUpcomingAlerts(alerts, dismissedAlertIds) {
    return getVisibleUpcomingAlertEntries(alerts, dismissedAlertIds).map(
        ({ alert }) => alert,
    );
}

export function getDrivingAlertsPresentation(
    alerts,
    dismissedAlertIds,
    now = Date.now(),
) {
    const visibleAlertEntries = getVisibleUpcomingAlertEntries(
        alerts,
        dismissedAlertIds,
    );
    const displayedAlertEntries = [
        getClosestUpcomingAlert(visibleAlertEntries, 'police'),
        getClosestUpcomingAlert(visibleAlertEntries, 'alpr'),
    ].filter(Boolean);

    if (!displayedAlertEntries.length) {
        return null;
    }

    return {
        alerts: displayedAlertEntries.map((entry) =>
            getCompactUpcomingAlertPresentation(entry, now),
        ),
        dismissalAlertIds: displayedAlertEntries.map(({ id }) => id),
        variant: displayedAlertEntries.length === 2 ? 'combined' : 'single',
    };
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
