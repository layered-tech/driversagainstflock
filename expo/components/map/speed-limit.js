import { useRef } from 'react';
import { Text, View } from 'react-native';

const METERS_PER_SECOND_TO_MILES_PER_HOUR = 2.2369362920544;
const SPEED_LIMIT_RETENTION_MS = 3000;
const SPEED_LIMIT_SIGN_WIDTH = 58;
const SPEED_LIMIT_SIGN_HEIGHT = SPEED_LIMIT_SIGN_WIDTH * 1.2;
const SPEED_LIMIT_SIGN_BORDER_WIDTH = Math.max(
    2,
    SPEED_LIMIT_SIGN_WIDTH * 0.045,
);
const SPEED_LIMIT_SIGN_BORDER_RADIUS = SPEED_LIMIT_SIGN_WIDTH * 0.14;
const SPEED_LIMIT_CONTENT_GAP = SPEED_LIMIT_SIGN_WIDTH * 0.04;
const SPEED_LIMIT_LABEL_FONT_SIZE = SPEED_LIMIT_SIGN_WIDTH * 0.15;
const SPEED_LIMIT_LABEL_LINE_HEIGHT = SPEED_LIMIT_LABEL_FONT_SIZE * 1.02;
const SPEED_LIMIT_LABEL_LETTER_SPACING = SPEED_LIMIT_LABEL_FONT_SIZE * 0.04;
const SPEED_LIMIT_VALUE_FONT_SIZE = SPEED_LIMIT_SIGN_WIDTH * 0.46;
const SPEED_LIMIT_VALUE_LINE_HEIGHT = SPEED_LIMIT_VALUE_FONT_SIZE * 0.92;
const CURRENT_SPEED_DIAMETER = SPEED_LIMIT_SIGN_WIDTH * 0.46;
const CURRENT_SPEED_CORNER_OVERHANG = CURRENT_SPEED_DIAMETER / 2;
const CURRENT_SPEED_BORDER_WIDTH = Math.max(3, SPEED_LIMIT_SIGN_WIDTH * 0.07);
const CURRENT_SPEED_FONT_SIZE = CURRENT_SPEED_DIAMETER * 0.46;
const SPEED_LIMIT_INK_COLOR = '#11151B';
const CURRENT_SPEED_OK_COLOR = '#5A6573';
const CURRENT_SPEED_RING_COLOR = '#828D9B';

function getWholeMphFromMetersPerSecond(speedMps) {
    const numericSpeed = Number(speedMps);

    if (!Number.isFinite(numericSpeed)) {
        return null;
    }

    return Math.max(
        0,
        Math.round(numericSpeed * METERS_PER_SECOND_TO_MILES_PER_HOUR),
    );
}

export function useRouteSpeedLimit({ routeIsActive, userLocation }) {
    const cachedSpeedLimitRef = useRef(null);
    const speedLimit = userLocation?.mapboxNavigation?.speedLimit;
    const retainedSpeedLimit = getRetainedRouteSpeedLimit({
        cachedSpeedLimit: cachedSpeedLimitRef.current,
        routeIsActive,
        speedLimit,
    });

    cachedSpeedLimitRef.current = retainedSpeedLimit.cachedSpeedLimit;

    return retainedSpeedLimit.speedLimit;
}

function speedLimitIsValid(speedLimit) {
    return Number.isFinite(Number(speedLimit?.speedLimitMph));
}

export function getRetainedRouteSpeedLimit({
    cachedSpeedLimit,
    now = Date.now(),
    routeIsActive,
    speedLimit,
}) {
    if (!routeIsActive) {
        return {
            cachedSpeedLimit: null,
            speedLimit: null,
        };
    }

    if (speedLimitIsValid(speedLimit)) {
        return {
            cachedSpeedLimit: {
                retainedAt: now,
                speedLimit,
            },
            speedLimit,
        };
    }

    if (
        cachedSpeedLimit &&
        now - cachedSpeedLimit.retainedAt <= SPEED_LIMIT_RETENTION_MS &&
        speedLimitIsValid(cachedSpeedLimit.speedLimit)
    ) {
        return {
            cachedSpeedLimit,
            speedLimit: cachedSpeedLimit.speedLimit,
        };
    }

    return {
        cachedSpeedLimit: null,
        speedLimit: null,
    };
}

export function SpeedLimitSign({
    currentSpeedMps,
    currentSpeedPlacement = 'bottom-right',
    currentSpeedVisible = false,
    speedLimit,
    testID = 'driving-speed-limit-sign',
    valueTestID = 'driving-speed-limit-value',
}) {
    const speedLimitMph = Number(speedLimit?.speedLimitMph);
    const currentSpeedMph = getWholeMphFromMetersPerSecond(currentSpeedMps);
    const currentSpeedIsVisible =
        currentSpeedVisible && currentSpeedMph !== null;
    const currentSpeedOverLimit =
        currentSpeedIsVisible && currentSpeedMph > Math.round(speedLimitMph);
    const currentSpeedIsOnRight = currentSpeedPlacement === 'bottom-right';

    if (!Number.isFinite(speedLimitMph)) {
        return null;
    }

    return (
        <View
            style={{
                height: SPEED_LIMIT_SIGN_HEIGHT + CURRENT_SPEED_CORNER_OVERHANG,
                width: SPEED_LIMIT_SIGN_WIDTH + CURRENT_SPEED_CORNER_OVERHANG,
            }}
        >
            <View
                accessibilityLabel={`Speed limit ${Math.round(speedLimitMph)} miles per hour`}
                className={`${currentSpeedIsOnRight ? 'self-start' : 'self-end'} items-center justify-center overflow-hidden bg-white shadow-[0px_3px_10px_rgba(11,14,18,0.30)]`}
                style={{
                    borderColor: SPEED_LIMIT_INK_COLOR,
                    borderRadius: SPEED_LIMIT_SIGN_BORDER_RADIUS,
                    borderWidth: SPEED_LIMIT_SIGN_BORDER_WIDTH,
                    gap: SPEED_LIMIT_CONTENT_GAP,
                    height: SPEED_LIMIT_SIGN_HEIGHT,
                    width: SPEED_LIMIT_SIGN_WIDTH,
                }}
                testID={testID}
            >
                <Text
                    className="font-dafUi text-center font-extrabold uppercase"
                    numberOfLines={2}
                    style={{
                        color: SPEED_LIMIT_INK_COLOR,
                        fontSize: SPEED_LIMIT_LABEL_FONT_SIZE,
                        letterSpacing: SPEED_LIMIT_LABEL_LETTER_SPACING,
                        lineHeight: SPEED_LIMIT_LABEL_LINE_HEIGHT,
                    }}
                >
                    Speed{'\n'}Limit
                </Text>
                <Text
                    className="font-dafMono text-center font-extrabold"
                    numberOfLines={1}
                    style={{
                        color: SPEED_LIMIT_INK_COLOR,
                        fontSize: SPEED_LIMIT_VALUE_FONT_SIZE,
                        fontVariant: ['tabular-nums'],
                        lineHeight: SPEED_LIMIT_VALUE_LINE_HEIGHT,
                    }}
                    testID={valueTestID}
                >
                    {Math.round(speedLimitMph)}
                </Text>
            </View>

            {currentSpeedIsVisible ? (
                <View
                    accessibilityLabel={`Current speed ${currentSpeedMph} miles per hour`}
                    className={`${currentSpeedIsOnRight ? 'self-end' : 'self-start'} items-center justify-center bg-white shadow-[0px_3px_10px_rgba(11,14,18,0.30)]`}
                    style={{
                        borderRadius: CURRENT_SPEED_DIAMETER / 2,
                        borderColor: currentSpeedOverLimit
                            ? SPEED_LIMIT_INK_COLOR
                            : CURRENT_SPEED_RING_COLOR,
                        borderWidth: CURRENT_SPEED_BORDER_WIDTH,
                        height: CURRENT_SPEED_DIAMETER,
                        marginTop: -CURRENT_SPEED_CORNER_OVERHANG,
                        width: CURRENT_SPEED_DIAMETER,
                    }}
                    testID={`${testID}-current-speed`}
                >
                    <Text
                        className="font-dafMono text-center font-extrabold"
                        numberOfLines={1}
                        style={{
                            color: currentSpeedOverLimit
                                ? SPEED_LIMIT_INK_COLOR
                                : CURRENT_SPEED_OK_COLOR,
                            fontSize: CURRENT_SPEED_FONT_SIZE,
                            fontVariant: ['tabular-nums'],
                            lineHeight: CURRENT_SPEED_FONT_SIZE,
                        }}
                    >
                        {currentSpeedMph}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}
