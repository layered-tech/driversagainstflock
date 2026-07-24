import { Text, View } from 'react-native';

const LOCATION_DEBUG_OVERLAY_WIDTH = 248;
const METERS_PER_SECOND_TO_MILES_PER_HOUR = 2.2369362921;

function getFiniteNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;
}

function formatLocationDebugValue(value, precision, suffix = '') {
    const numericValue = getFiniteNumber(value);

    if (numericValue === null) {
        return 'n/a';
    }

    return `${numericValue.toFixed(precision)}${suffix}`;
}

function formatSpeedDebugValue(value) {
    const speedMps = getFiniteNumber(value);

    if (speedMps === null) {
        return 'n/a';
    }

    const speedMph = speedMps * METERS_PER_SECOND_TO_MILES_PER_HOUR;

    return `${speedMps.toFixed(2)} m/s / ${speedMph.toFixed(1)} mph`;
}

function formatRecordedAt(value) {
    const recordedAt = getFiniteNumber(value);

    if (recordedAt === null) {
        return 'n/a';
    }

    return new Date(recordedAt).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function formatMovingValue(value) {
    if (value === true) {
        return 'yes';
    }

    if (value === false) {
        return 'no';
    }

    return 'n/a';
}

function formatLocationProvider(value) {
    if (value === 'in-house-road-matcher') {
        return 'In-house road matcher';
    }

    if (value === 'expo-location' || value === 'expo-location-unmatched') {
        return 'Expo Location';
    }

    return 'n/a';
}

export function LocationDebugOverlay({ location }) {
    const rows = [
        {
            label: 'Fix',
            value: formatRecordedAt(location?.recordedAt),
        },
        {
            label: 'Provider',
            value: formatLocationProvider(location?.locationProvider),
        },
        {
            label: 'Lng',
            value: formatLocationDebugValue(location?.longitude, 6),
        },
        {
            label: 'Lat',
            value: formatLocationDebugValue(location?.latitude, 6),
        },
        {
            label: 'Accuracy',
            value: formatLocationDebugValue(location?.accuracy, 1, ' m'),
        },
        {
            label: 'Speed',
            value: formatSpeedDebugValue(location?.speed),
        },
        {
            label: 'Heading',
            value: formatLocationDebugValue(
                location?.heading ??
                    location?.courseHeading ??
                    location?.compassHeading,
                2,
                ' deg',
            ),
        },
        {
            label: 'Course',
            value: formatLocationDebugValue(location?.courseHeading, 2, ' deg'),
        },
        {
            label: 'Compass',
            value: formatLocationDebugValue(
                location?.compassHeading,
                2,
                ' deg',
            ),
        },
        {
            label: 'Moving',
            value: formatMovingValue(location?.isMoving),
        },
    ];

    return (
        <View
            className="self-start"
            style={{ width: LOCATION_DEBUG_OVERLAY_WIDTH }}
        >
            <View className="elevation-[3] gap-1 rounded-md border border-neutral-950/10 bg-neutral-950/90 p-2 shadow-[0px_2px_8px_rgba(0,0,0,0.16)]">
                <Text className="text-[10px] font-bold uppercase text-neutral-300">
                    Location
                </Text>
                {rows.map((row) => (
                    <View
                        className="h-4 flex-row items-center gap-2"
                        key={row.label}
                    >
                        <Text className="w-[58px] text-[10px] font-semibold text-neutral-300">
                            {row.label}
                        </Text>
                        <Text
                            className="flex-1 text-[10px] font-bold text-white"
                            numberOfLines={1}
                            style={{ fontVariant: ['tabular-nums'] }}
                        >
                            {row.value}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}
