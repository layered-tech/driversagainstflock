import { useRef } from 'react';
import { Text, View } from 'react-native';
import { mapApiMocksAreEnabled } from './api-mocks';
import { getSpeedLimitBadgeLayout } from './speed-limit-layout';
import {
    getMockCurrentSpeedMps,
    getMockSpeedLimitSnapshot,
} from './speed-limit-mock';

const METERS_PER_SECOND_TO_MILES_PER_HOUR = 2.2369362920544;
const SPEED_LIMIT_RETENTION_MS = 3000;
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
    const speedLimit = mapApiMocksAreEnabled()
        ? getMockSpeedLimitSnapshot()
        : userLocation?.mapboxNavigation?.speedLimit;
    const retainedSpeedLimit = getRetainedRouteSpeedLimit({
        cachedSpeedLimit: cachedSpeedLimitRef.current,
        routeIsActive,
        speedLimit,
    });

    cachedSpeedLimitRef.current = retainedSpeedLimit.cachedSpeedLimit;

    return retainedSpeedLimit.speedLimit;
}

export function getRouteCurrentSpeedMps(userLocation) {
    return mapApiMocksAreEnabled()
        ? getMockCurrentSpeedMps()
        : userLocation?.speed;
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
    isDarkMode = false,
    size = 'md',
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
    const layout = getSpeedLimitBadgeLayout(size);
    const markerShadowClassName = isDarkMode
        ? 'shadow-[0px_4px_14px_rgba(0,0,0,0.60)]'
        : 'shadow-[0px_3px_10px_rgba(11,14,18,0.30)]';

    if (!Number.isFinite(speedLimitMph)) {
        return null;
    }

    return (
        <View
            className="relative"
            style={{
                height: layout.containerHeight,
                width: layout.containerWidth,
            }}
        >
            <View
                accessibilityLabel={`Speed limit ${Math.round(speedLimitMph)} miles per hour`}
                className={`absolute left-0 top-0 items-center justify-center overflow-hidden bg-white ${markerShadowClassName}`}
                style={{
                    borderColor: SPEED_LIMIT_INK_COLOR,
                    borderRadius: layout.signBorderRadius,
                    borderWidth: layout.signBorderWidth,
                    gap: layout.signContentGap,
                    height: layout.signOuterHeight,
                    width: layout.signOuterWidth,
                }}
                testID={testID}
            >
                <Text
                    allowFontScaling={false}
                    className="font-dafUi text-center font-extrabold uppercase"
                    numberOfLines={2}
                    style={{
                        color: SPEED_LIMIT_INK_COLOR,
                        fontSize: layout.labelFontSize,
                        includeFontPadding: false,
                        letterSpacing: layout.labelLetterSpacing,
                        lineHeight: layout.labelLineHeight,
                    }}
                >
                    Speed{'\n'}Limit
                </Text>
                <Text
                    allowFontScaling={false}
                    className="font-dafMono text-center font-extrabold"
                    numberOfLines={1}
                    style={{
                        color: SPEED_LIMIT_INK_COLOR,
                        fontSize: layout.valueFontSize,
                        fontVariant: ['tabular-nums'],
                        includeFontPadding: false,
                        lineHeight: layout.valueLineHeight,
                    }}
                    testID={valueTestID}
                >
                    {Math.round(speedLimitMph)}
                </Text>
            </View>

            {currentSpeedIsVisible ? (
                <View
                    accessibilityLabel={`Current speed ${currentSpeedMph} miles per hour`}
                    className={`absolute bottom-0 items-center justify-center bg-white ${markerShadowClassName}`}
                    style={{
                        borderRadius: layout.currentSpeedDiameter / 2,
                        borderColor: currentSpeedOverLimit
                            ? SPEED_LIMIT_INK_COLOR
                            : CURRENT_SPEED_RING_COLOR,
                        borderWidth: layout.currentSpeedBorderWidth,
                        height: layout.currentSpeedDiameter,
                        ...(currentSpeedIsOnRight
                            ? { right: -layout.currentSpeedCornerOverhang }
                            : { left: -layout.currentSpeedCornerOverhang }),
                        width: layout.currentSpeedDiameter,
                    }}
                    testID={`${testID}-current-speed`}
                >
                    <Text
                        allowFontScaling={false}
                        className="font-dafMono text-center font-extrabold"
                        numberOfLines={1}
                        style={{
                            color: currentSpeedOverLimit
                                ? SPEED_LIMIT_INK_COLOR
                                : CURRENT_SPEED_OK_COLOR,
                            fontSize: layout.currentSpeedFontSize,
                            fontVariant: ['tabular-nums'],
                            includeFontPadding: false,
                            lineHeight: layout.currentSpeedFontSize,
                        }}
                        testID={`${testID}-current-speed-value`}
                    >
                        {currentSpeedMph}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}
