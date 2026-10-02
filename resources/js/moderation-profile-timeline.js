import { moderationDate } from './moderation.js';

function timestamp(value) {
    if (!value) return null;
    const time = moderationDate(value).getTime();
    return Number.isFinite(time) ? time : null;
}

function count(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : null;
}

export function timelineVolume(rows, field) {
    let total = 0;
    let unavailable = 0;
    for (const row of rows) {
        const value = count(row[field]);
        if (value == null) unavailable++;
        else total += value;
    }
    return { total, unavailable, known: rows.length - unavailable };
}

function durationLabel(milliseconds) {
    if (milliseconds < 60_000) return 'less than a minute';
    const units = [
        [86_400_000, 'day'],
        [3_600_000, 'hour'],
        [60_000, 'minute'],
    ];
    const [size, unit] = units.find(([size]) => milliseconds >= size);
    const value = Math.floor(milliseconds / size);
    return `${value.toLocaleString()} ${unit}${value === 1 ? '' : 's'}`;
}

export function timelineSpacing(milliseconds) {
    if (milliseconds === 0) return 'Same timestamp';
    const duration = durationLabel(milliseconds);
    return `${duration[0].toUpperCase()}${duration.slice(1)} between listed changesets`;
}

export function profileTimeline(rows, chronological = true) {
    const times = rows.map((row) => timestamp(row.changed_at));
    const knownTimes = times.filter((time) => time != null);
    const ordered =
        knownTimes.every(
            (time, index) => index === 0 || time >= knownTimes[index - 1],
        ) ||
        knownTimes.every(
            (time, index) => index === 0 || time <= knownTimes[index - 1],
        );
    const groups = [];
    rows.forEach((row, index) => {
        const time = times[index];
        const day =
            time == null ? null : new Date(time).toISOString().slice(0, 10);
        let group = groups.at(-1);
        if (!group || group.day !== day) {
            group = { key: row.id, day, entries: [], first: time, last: time };
            groups.push(group);
        }
        if (time != null) {
            group.first = Math.min(group.first, time);
            group.last = Math.max(group.last, time);
        }
        const previous = times[index - 1];
        const spacing =
            !chronological || !ordered
                ? 'Spacing unavailable in this sort order'
                : time == null || (index > 0 && previous == null)
                  ? 'Spacing unavailable: missing timestamp'
                  : index === 0
                    ? null
                    : timelineSpacing(Math.abs(time - previous));
        group.entries.push({
            row,
            time,
            spacing,
            volume: timelineVolume([row], 'total'),
            osmVolume: timelineVolume([row], 'osm_num_changes'),
        });
    });
    return groups.map((group) => ({
        ...group,
        span:
            group.entries.length < 2 || group.first == null
                ? null
                : group.first === group.last
                  ? 'at the same timestamp'
                  : `over ${durationLabel(group.last - group.first)}`,
        volume: timelineVolume(
            group.entries.map(({ row }) => row),
            'total',
        ),
    }));
}
