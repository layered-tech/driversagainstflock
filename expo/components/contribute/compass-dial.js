import { useIsFocused } from '@react-navigation/native';
import Mapbox from '@rnmapbox/maps';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, useColorScheme, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    Easing,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import Svg, {
    Circle,
    Defs,
    LinearGradient,
    Path,
    Polygon,
    RadialGradient,
    Stop,
} from 'react-native-svg';
import { normalizeNodeLocation } from '../../lib/osm/node-location';
import { Icon } from '../design-system/icon';
import { dafColors, dafTypography, getDafTheme } from '../design-system/tokens';
import {
    MAPBOX_ACCESS_TOKEN,
    MAPBOX_STANDARD_SATELLITE_STYLE_URL,
    MAPBOX_STANDARD_STYLE_IMPORT_ID,
} from '../map/config';
import { ZOOM_STEP } from '../map/constants';
import { NativeWindMapView } from '../map/native-components';
import { formatBearingChip } from './osm-tags';

const COMPASS_DESIGN_SIZE = 330;
const COMPASS_PREVIEW_SIZE = 256;
const COMPASS_PREVIEW_INSET = 37;
const COMPASS_PREVIEW_ZOOM_LEVEL = 18;
const COMPASS_MIN_ZOOM_LEVEL = 16;
const COMPASS_MAX_ZOOM_LEVEL = 20;
const COMPASS_PREVIEW_FRAMES_PER_SECOND = 30;
const COMPASS_CAMERA_ANIMATION_DURATION_MS = 220;
const COMPASS_DIRECTION_ANIMATION_DURATION_MS = 380;
const COMPASS_RING_INNER_RADIUS_RATIO = 128 / 165;
const COMPASS_RING_ACTIVATION_DISTANCE = 4;
const COMPASS_ACCESSIBILITY_STEP_DEGREES = 5;
const COMPASS_ROTATION_THRESHOLD_DEGREES = 0.5;
const COMPASS_LOCATION_EPSILON = 0.00000001;
const COMPASS_LABEL_RADIUS = 139;
const COMPASS_LABELS = Array.from({ length: 12 }, (_, index) => {
    const bearing = index * 30;

    return {
        bearing,
        label:
            {
                0: 'N',
                90: 'E',
                180: 'S',
                270: 'W',
            }[bearing] ?? String(bearing),
    };
});
const COMPASS_MINOR_TICK_PATH = createCompassTickPath(6, 152, 158.5);
const COMPASS_MAJOR_TICK_PATH = createCompassTickPath(30, 146, 158.5);
const COMPASS_MAP_GESTURE_SETTINGS = {
    doubleTapToZoomInEnabled: false,
    doubleTouchToZoomOutEnabled: false,
    panEnabled: true,
    pinchPanEnabled: false,
    pinchZoomEnabled: false,
    pitchEnabled: false,
    quickZoomEnabled: false,
    rotateEnabled: true,
    simultaneousRotateAndPinchZoomEnabled: true,
};
const COMPASS_SATELLITE_BASEMAP_CONFIG = {
    showPlaceLabels: false,
    showPointOfInterestLabels: false,
    showRoadLabels: false,
    showTransitLabels: false,
};
const COMPASS_LOGO_POSITION = { bottom: 8, left: 8 };
const COMPASS_ATTRIBUTION_POSITION = { bottom: 8, right: 8 };
const COMPASS_ZOOM_BUTTON_CLASS_NAME =
    'h-[46px] w-[46px] items-center justify-center rounded-dafSm border border-daf-border bg-daf-surface-card p-0 shadow-[0px_2px_8px_rgba(11,14,18,0.12)] active:opacity-[0.82] disabled:opacity-[0.35] dark:border-daf-border-dark dark:bg-daf-surface-dark';

if (MAPBOX_ACCESS_TOKEN) {
    Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
}

function createCompassTickPath(step, innerRadius, outerRadius) {
    let path = '';

    for (let bearing = 0; bearing < 360; bearing += step) {
        const radians = (bearing * Math.PI) / 180;
        const sine = Math.sin(radians);
        const cosine = Math.cos(radians);
        const startX = 165 + innerRadius * sine;
        const startY = 165 - innerRadius * cosine;
        const endX = 165 + outerRadius * sine;
        const endY = 165 - outerRadius * cosine;

        path += `M${startX.toFixed(1)} ${startY.toFixed(1)}L${endX.toFixed(1)} ${endY.toFixed(1)}`;
    }

    return path;
}

function normalizeDialDegrees(value) {
    'worklet';

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return 0;
    }

    return ((Math.round(numericValue) % 360) + 360) % 360;
}

function clampCompassZoomLevel(value) {
    return Math.min(
        COMPASS_MAX_ZOOM_LEVEL,
        Math.max(COMPASS_MIN_ZOOM_LEVEL, value),
    );
}

function getClosestEquivalentAngle(currentAngle, targetAngle) {
    const normalizedCurrentAngle = Number.isFinite(currentAngle)
        ? currentAngle
        : 0;
    const normalizedTargetAngle = normalizeDialDegrees(targetAngle);
    const currentModulo = ((normalizedCurrentAngle % 360) + 360) % 360;
    const shortestDelta =
        ((normalizedTargetAngle - currentModulo + 540) % 360) - 180;

    return normalizedCurrentAngle + shortestDelta;
}

function getAngularDistance(fromDegrees, toDegrees) {
    return Math.abs(
        ((normalizeDialDegrees(toDegrees) -
            normalizeDialDegrees(fromDegrees) +
            540) %
            360) -
            180,
    );
}

function locationsDiffer(firstLocation, secondLocation) {
    if (!firstLocation || !secondLocation) {
        return firstLocation !== secondLocation;
    }

    return (
        Math.abs(firstLocation.latitude - secondLocation.latitude) >
            COMPASS_LOCATION_EPSILON ||
        Math.abs(firstLocation.longitude - secondLocation.longitude) >
            COMPASS_LOCATION_EPSILON
    );
}

function getMapStateLocation(cameraState) {
    const center = cameraState?.properties?.center;

    return normalizeNodeLocation({
        latitude: center?.[1],
        longitude: center?.[0],
    });
}

function formatNodeLocation(location) {
    return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
}

function CompassRingLabel({
    bearing,
    dialSize,
    heading,
    label,
    testID,
    theme,
}) {
    const radians = (bearing * Math.PI) / 180;
    const scale = dialSize / COMPASS_DESIGN_SIZE;
    const labelWidth = 34 * scale;
    const labelHeight = 22 * scale;
    const centerX = (165 + COMPASS_LABEL_RADIUS * Math.sin(radians)) * scale;
    const centerY = (165 - COMPASS_LABEL_RADIUS * Math.cos(radians)) * scale;
    const isCardinal = bearing % 90 === 0;
    const counterRotationStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${heading.value}deg` }],
    }));

    return (
        <Animated.Text
            className="font-dafMono absolute text-center"
            pointerEvents="none"
            style={[
                {
                    color:
                        bearing === 0
                            ? dafColors.alert[500]
                            : isCardinal
                              ? theme.text.primary
                              : theme.text.tertiary,
                    fontFamily: dafTypography.mono.fontFamily,
                    fontSize: (isCardinal ? 14 : 10) * scale,
                    fontWeight: isCardinal ? '700' : '500',
                    height: labelHeight,
                    left: centerX - labelWidth / 2,
                    lineHeight: labelHeight,
                    top: centerY - labelHeight / 2,
                    width: labelWidth,
                },
                counterRotationStyle,
            ]}
            testID={testID}
        >
            {label}
        </Animated.Text>
    );
}

function DirectionConeOverlay({
    activeDirectionIndex,
    activeDirectionValue,
    directions,
    testID,
}) {
    return directions.map((direction, directionIndex) => {
        const isActive = directionIndex === activeDirectionIndex;
        const rotation = isActive
            ? 0
            : normalizeDialDegrees(direction - activeDirectionValue);
        const gradientId = `${testID}-cone-gradient-${directionIndex}`;

        return (
            <View
                className="absolute inset-0"
                key={`direction-cone-${directionIndex}`}
                pointerEvents="none"
                style={{
                    opacity: isActive ? 1 : 0.42,
                    transform: [{ rotate: `${rotation}deg` }],
                    zIndex: isActive ? 2 : 1,
                }}
                testID={`${testID}-direction-cone-${directionIndex}`}
            >
                <View
                    className="absolute inset-0"
                    testID={isActive ? `${testID}-cone` : undefined}
                >
                    <Svg height="100%" viewBox="0 0 256 256" width="100%">
                        <Defs>
                            <LinearGradient
                                gradientUnits="userSpaceOnUse"
                                id={gradientId}
                                x1="128"
                                x2="128"
                                y1="128"
                                y2="10"
                            >
                                <Stop
                                    offset="0"
                                    stopColor={dafColors.alert[500]}
                                    stopOpacity={isActive ? 0.62 : 0.55}
                                />
                                <Stop
                                    offset="1"
                                    stopColor={dafColors.alert[500]}
                                    stopOpacity={isActive ? 0.05 : 0.04}
                                />
                            </LinearGradient>
                        </Defs>
                        <Path
                            d="M128 128 L87.6 17.1 A118 118 0 0 1 168.4 17.1 Z"
                            fill={`url(#${gradientId})`}
                        />
                        {isActive ? (
                            <>
                                <Path
                                    d="M128 128 L87.6 17.1 M168.4 17.1 L128 128"
                                    fill="none"
                                    stroke="rgba(255,77,79,0.85)"
                                    strokeLinecap="round"
                                    strokeWidth="1.5"
                                />
                                <Path
                                    d="M128 128 L128 12"
                                    fill="none"
                                    stroke="rgba(255,255,255,0.60)"
                                    strokeDasharray="2 6"
                                    strokeLinecap="round"
                                    strokeWidth="1.2"
                                />
                            </>
                        ) : null}
                    </Svg>
                </View>
            </View>
        );
    });
}

function FixedCameraMarker({ testID }) {
    const gradientId = `${testID}-glow`;

    return (
        <View
            accessible
            accessibilityLabel="Fixed camera location marker"
            accessibilityRole="image"
            className="absolute inset-0 items-center justify-center"
            pointerEvents="none"
            style={{ zIndex: 3 }}
            testID={testID}
        >
            <Svg height="40" viewBox="0 0 40 40" width="40">
                <Defs>
                    <RadialGradient id={gradientId}>
                        <Stop
                            offset="0"
                            stopColor={dafColors.alert[500]}
                            stopOpacity="0.34"
                        />
                        <Stop
                            offset="0.7"
                            stopColor={dafColors.alert[500]}
                            stopOpacity="0"
                        />
                    </RadialGradient>
                </Defs>
                <Circle cx="20" cy="20" fill={`url(#${gradientId})`} r="19" />
                <Circle
                    cx="20"
                    cy="20"
                    fill={dafColors.alert[500]}
                    r="7.5"
                    stroke="#ffffff"
                    strokeWidth="2"
                />
                <Circle cx="20" cy="20" fill="rgba(255,255,255,0.55)" r="1.9" />
            </Svg>
        </View>
    );
}

export function CompassDial({
    directions,
    location,
    onChange,
    onLocationChange,
    selectedDirectionIndex,
    testID,
    value,
}) {
    const colorScheme = useColorScheme();
    const isFocused = useIsFocused();
    const cameraRef = useRef(null);
    const mapViewRef = useRef(null);
    const currentZoomRef = useRef(COMPASS_PREVIEW_ZOOM_LEVEL);
    const defaultCameraSettingsRef = useRef(null);
    const localHeadingCommitRef = useRef(null);
    const mapGestureRef = useRef({ active: false });
    const previewCameraFrameRef = useRef(null);
    const pendingPreviewHeadingRef = useRef(normalizeDialDegrees(value));
    const receivedInitialValueRef = useRef(false);
    const normalizedLocation = normalizeNodeLocation(location);
    const latitude = normalizedLocation?.latitude ?? null;
    const longitude = normalizedLocation?.longitude ?? null;
    const coordinate = useMemo(
        () =>
            latitude === null || longitude === null
                ? null
                : [longitude, latitude],
        [latitude, longitude],
    );
    const lastSettledCameraRef = useRef({
        center: normalizedLocation,
        heading: normalizeDialDegrees(value),
    });
    const [currentZoomLevel, setCurrentZoomLevel] = useState(
        COMPASS_PREVIEW_ZOOM_LEVEL,
    );
    const [dialSize, setDialSize] = useState(0);
    const [displayDegrees, setDisplayDegrees] = useState(() =>
        normalizeDialDegrees(value),
    );
    const [displayLocation, setDisplayLocation] = useState(normalizedLocation);
    const [mapGestureSettings, setMapGestureSettings] = useState(
        COMPASS_MAP_GESTURE_SETTINGS,
    );
    const angle = useSharedValue(normalizeDialDegrees(value));
    const dialCenter = useSharedValue(0);
    const headingRingTouchIsEligible = useSharedValue(false);
    const headingRingTouchStartX = useSharedValue(0);
    const headingRingTouchStartY = useSharedValue(0);
    const lastReportedDegrees = useSharedValue(normalizeDialDegrees(value));
    const lastTouchAngle = useSharedValue(0);
    const normalizedDirections = useMemo(() => {
        const sourceDirections =
            Array.isArray(directions) && directions.length > 0
                ? directions
                : [value];

        return sourceDirections.map(normalizeDialDegrees);
    }, [directions, value]);
    const activeDirectionIndex = Math.min(
        Math.max(Math.trunc(Number(selectedDirectionIndex) || 0), 0),
        normalizedDirections.length - 1,
    );
    const dialTestID = testID ?? 'camera-direction-dial';
    const theme = getDafTheme(colorScheme);
    const satellitePreviewIsAvailable =
        isFocused && Boolean(MAPBOX_ACCESS_TOKEN) && coordinate !== null;
    const previewWindowStyle = useMemo(() => {
        const scale = dialSize / COMPASS_DESIGN_SIZE;
        const inset = COMPASS_PREVIEW_INSET * scale;
        const size = COMPASS_PREVIEW_SIZE * scale;

        return {
            borderRadius: size / 2,
            height: size,
            left: inset,
            top: inset,
            width: size,
        };
    }, [dialSize]);

    if (coordinate && !defaultCameraSettingsRef.current) {
        defaultCameraSettingsRef.current = {
            centerCoordinate: coordinate,
            heading: normalizeDialDegrees(value),
            pitch: 0,
            zoomLevel: COMPASS_PREVIEW_ZOOM_LEVEL,
        };
    }

    const schedulePreviewCameraHeading = useCallback(
        (degrees, animated = false) => {
            pendingPreviewHeadingRef.current = degrees;

            if (previewCameraFrameRef.current !== null) {
                cancelAnimationFrame(previewCameraFrameRef.current);
            }

            previewCameraFrameRef.current = requestAnimationFrame(() => {
                previewCameraFrameRef.current = null;
                cameraRef.current?.setCamera({
                    animationDuration: animated
                        ? COMPASS_DIRECTION_ANIMATION_DURATION_MS
                        : 0,
                    animationMode: animated ? 'easeTo' : 'none',
                    heading: pendingPreviewHeadingRef.current,
                    zoomLevel: currentZoomRef.current,
                });
            });
        },
        [],
    );

    const handlePreviewBearingChange = useCallback(
        (degrees) => {
            const normalizedDegrees = normalizeDialDegrees(degrees);

            setDisplayDegrees(normalizedDegrees);
            schedulePreviewCameraHeading(normalizedDegrees);
        },
        [schedulePreviewCameraHeading],
    );

    useEffect(() => {
        const normalizedValue = normalizeDialDegrees(value);
        const isInitialValue = !receivedInitialValueRef.current;
        const isLocalCommit = localHeadingCommitRef.current === normalizedValue;

        receivedInitialValueRef.current = true;
        localHeadingCommitRef.current = null;
        lastReportedDegrees.value = normalizedValue;
        setDisplayDegrees(normalizedValue);

        if (isInitialValue || isLocalCommit) {
            angle.value = normalizedValue;
            schedulePreviewCameraHeading(normalizedValue);
            return;
        }

        angle.value = withTiming(
            getClosestEquivalentAngle(angle.value, normalizedValue),
            {
                duration: COMPASS_DIRECTION_ANIMATION_DURATION_MS,
                easing: Easing.bezier(0.22, 0.8, 0.3, 1),
            },
        );
        schedulePreviewCameraHeading(normalizedValue, true);
    }, [angle, lastReportedDegrees, schedulePreviewCameraHeading, value]);

    useEffect(() => {
        if (!normalizedLocation || mapGestureRef.current.active) {
            return;
        }

        setDisplayLocation(normalizedLocation);
    }, [latitude, longitude]);

    useEffect(
        () => () => {
            if (previewCameraFrameRef.current !== null) {
                cancelAnimationFrame(previewCameraFrameRef.current);
            }
        },
        [],
    );

    const handleInteractionEnd = useCallback(
        (degrees) => {
            const normalizedDegrees = normalizeDialDegrees(degrees);

            localHeadingCommitRef.current = normalizedDegrees;
            handlePreviewBearingChange(normalizedDegrees);
            onChange?.(normalizedDegrees);
        },
        [handlePreviewBearingChange, onChange],
    );

    const handleCameraChanged = useCallback(
        (cameraState) => {
            const zoomLevel = Number(cameraState?.properties?.zoom);

            if (Number.isFinite(zoomLevel)) {
                const nextZoomLevel = clampCompassZoomLevel(zoomLevel);

                currentZoomRef.current = nextZoomLevel;
                setCurrentZoomLevel(nextZoomLevel);
            }

            if (!cameraState?.gestures?.isGestureActive) {
                return;
            }

            const nextLocation = getMapStateLocation(cameraState);
            const nextHeading = normalizeDialDegrees(
                cameraState?.properties?.heading,
            );

            if (!mapGestureRef.current.active) {
                mapGestureRef.current = {
                    active: true,
                    startCenter:
                        lastSettledCameraRef.current.center ?? nextLocation,
                    startHeading:
                        lastSettledCameraRef.current.heading ?? nextHeading,
                };
            }

            mapGestureRef.current.latestCenter = nextLocation;
            mapGestureRef.current.latestHeading = nextHeading;

            if (nextLocation) {
                setDisplayLocation(nextLocation);
            }

            pendingPreviewHeadingRef.current = nextHeading;
            angle.value = nextHeading;
            lastReportedDegrees.value = nextHeading;
            setDisplayDegrees(nextHeading);
        },
        [angle, lastReportedDegrees],
    );

    const handleMapIdle = useCallback(
        (cameraState) => {
            const nextLocation = getMapStateLocation(cameraState);
            const nextHeading = normalizeDialDegrees(
                cameraState?.properties?.heading,
            );
            const zoomLevel = Number(cameraState?.properties?.zoom);
            const nextZoomLevel = Number.isFinite(zoomLevel)
                ? clampCompassZoomLevel(zoomLevel)
                : currentZoomRef.current;
            const gesture = mapGestureRef.current;

            currentZoomRef.current = nextZoomLevel;
            setCurrentZoomLevel(nextZoomLevel);

            if (!gesture.active) {
                lastSettledCameraRef.current = {
                    center: nextLocation ?? lastSettledCameraRef.current.center,
                    heading: nextHeading,
                };

                return;
            }

            mapGestureRef.current = { active: false };

            const rotationChanged =
                getAngularDistance(gesture.startHeading, nextHeading) >=
                COMPASS_ROTATION_THRESHOLD_DEGREES;

            if (rotationChanged) {
                const fixedCenter = gesture.startCenter ?? nextLocation;

                localHeadingCommitRef.current = nextHeading;
                pendingPreviewHeadingRef.current = nextHeading;
                angle.value = nextHeading;
                lastReportedDegrees.value = nextHeading;
                setDisplayDegrees(nextHeading);
                onChange?.(nextHeading);

                if (fixedCenter) {
                    setDisplayLocation(fixedCenter);
                }

                lastSettledCameraRef.current = {
                    center: fixedCenter,
                    heading: nextHeading,
                };

                if (fixedCenter && locationsDiffer(fixedCenter, nextLocation)) {
                    cameraRef.current?.setCamera({
                        animationDuration: 0,
                        animationMode: 'none',
                        centerCoordinate: [
                            fixedCenter.longitude,
                            fixedCenter.latitude,
                        ],
                        heading: nextHeading,
                        zoomLevel: nextZoomLevel,
                    });
                }

                return;
            }

            if (nextLocation) {
                setDisplayLocation(nextLocation);
                onLocationChange?.(nextLocation);
            }

            lastSettledCameraRef.current = {
                center: nextLocation ?? gesture.startCenter,
                heading: nextHeading,
            };
        },
        [angle, lastReportedDegrees, onChange, onLocationChange],
    );

    const handleZoomPress = useCallback((zoomDelta) => {
        const previousZoomLevel = currentZoomRef.current;
        const nextZoomLevel = clampCompassZoomLevel(
            previousZoomLevel + zoomDelta,
        );

        if (Math.abs(nextZoomLevel - previousZoomLevel) < 0.01) {
            return;
        }

        currentZoomRef.current = nextZoomLevel;
        setCurrentZoomLevel(nextZoomLevel);
        cameraRef.current?.setCamera({
            animationDuration: COMPASS_CAMERA_ANIMATION_DURATION_MS,
            animationMode: 'easeTo',
            heading: pendingPreviewHeadingRef.current,
            zoomLevel: nextZoomLevel,
        });
    }, []);

    const handleZoomInPress = useCallback(() => {
        handleZoomPress(ZOOM_STEP);
    }, [handleZoomPress]);

    const handleZoomOutPress = useCallback(() => {
        handleZoomPress(-ZOOM_STEP);
    }, [handleZoomPress]);

    const handleMapReady = useCallback(() => {
        if (!coordinate) {
            return;
        }

        const loadedMapGestureSettings = {
            ...COMPASS_MAP_GESTURE_SETTINGS,
        };

        mapViewRef.current?.setNativeProps({
            gestureSettings: loadedMapGestureSettings,
        });
        setMapGestureSettings(loadedMapGestureSettings);
        currentZoomRef.current = COMPASS_PREVIEW_ZOOM_LEVEL;
        setCurrentZoomLevel(COMPASS_PREVIEW_ZOOM_LEVEL);
        setDisplayLocation(normalizedLocation);
        lastSettledCameraRef.current = {
            center: normalizedLocation,
            heading: pendingPreviewHeadingRef.current,
        };
        cameraRef.current?.setCamera({
            animationDuration: 0,
            animationMode: 'none',
            centerCoordinate: coordinate,
            heading: pendingPreviewHeadingRef.current,
            pitch: 0,
            zoomLevel: COMPASS_PREVIEW_ZOOM_LEVEL,
        });
    }, [coordinate, normalizedLocation]);

    const handleDialLayout = useCallback(
        (event) => {
            const { height, width } = event.nativeEvent.layout;
            const nextDialSize = Math.min(height, width);

            setDialSize(nextDialSize);
            dialCenter.value = nextDialSize / 2;
        },
        [dialCenter],
    );

    const handleAccessibilityAction = useCallback(
        (event) => {
            const actionName = event.nativeEvent.actionName;
            const direction =
                actionName === 'increment'
                    ? 1
                    : actionName === 'decrement'
                      ? -1
                      : 0;

            if (direction === 0) {
                return;
            }

            const nextDegrees = normalizeDialDegrees(
                displayDegrees + direction * COMPASS_ACCESSIBILITY_STEP_DEGREES,
            );

            angle.value = nextDegrees;
            lastReportedDegrees.value = nextDegrees;
            handleInteractionEnd(nextDegrees);
        },
        [angle, displayDegrees, handleInteractionEnd, lastReportedDegrees],
    );

    const headingRingGesture = useMemo(() => {
        const getTouchAngle = (touchX, touchY) => {
            'worklet';

            const center = dialCenter.value;

            return (
                (Math.atan2(touchX - center, -(touchY - center)) * 180) /
                Math.PI
            );
        };

        return Gesture.Pan()
            .manualActivation(true)
            .maxPointers(1)
            .onTouchesDown((event, stateManager) => {
                const touch = event.changedTouches[0];
                const center = dialCenter.value;

                if (!touch || center <= 0) {
                    stateManager.fail();

                    return;
                }

                const deltaX = touch.x - center;
                const deltaY = touch.y - center;
                const distanceSquared = deltaX * deltaX + deltaY * deltaY;
                const innerRadius = center * COMPASS_RING_INNER_RADIUS_RATIO;
                const touchIsOnRing =
                    distanceSquared >= innerRadius * innerRadius &&
                    distanceSquared <= center * center;

                headingRingTouchIsEligible.value = touchIsOnRing;

                if (!touchIsOnRing) {
                    stateManager.fail();

                    return;
                }

                headingRingTouchStartX.value = touch.x;
                headingRingTouchStartY.value = touch.y;
                lastTouchAngle.value = getTouchAngle(touch.x, touch.y);
            })
            .onTouchesMove((event, stateManager) => {
                if (!headingRingTouchIsEligible.value) {
                    return;
                }

                const touch = event.allTouches[0];

                if (!touch) {
                    return;
                }

                const translationX = touch.x - headingRingTouchStartX.value;
                const translationY = touch.y - headingRingTouchStartY.value;
                const activationDistanceSquared =
                    COMPASS_RING_ACTIVATION_DISTANCE *
                    COMPASS_RING_ACTIVATION_DISTANCE;

                if (
                    translationX * translationX + translationY * translationY >=
                    activationDistanceSquared
                ) {
                    stateManager.activate();
                }
            })
            .onUpdate((event) => {
                const touchAngle = getTouchAngle(event.x, event.y);
                const touchDelta =
                    ((touchAngle - lastTouchAngle.value + 540) % 360) - 180;
                const nextAngle = (angle.value - touchDelta + 360) % 360;

                angle.value = nextAngle;
                lastTouchAngle.value = touchAngle;

                const roundedDegrees = normalizeDialDegrees(nextAngle);

                if (roundedDegrees !== lastReportedDegrees.value) {
                    lastReportedDegrees.value = roundedDegrees;
                    runOnJS(handlePreviewBearingChange)(roundedDegrees);
                }
            })
            .onEnd(() => {
                runOnJS(handleInteractionEnd)(
                    normalizeDialDegrees(angle.value),
                );
            })
            .onFinalize(() => {
                headingRingTouchIsEligible.value = false;
            });
    }, [
        angle,
        dialCenter,
        headingRingTouchIsEligible,
        headingRingTouchStartX,
        headingRingTouchStartY,
        handleInteractionEnd,
        handlePreviewBearingChange,
        lastReportedDegrees,
        lastTouchAngle,
    ]);

    const compassRoseAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${-angle.value}deg` }],
    }));
    const zoomInIsDisabled =
        !satellitePreviewIsAvailable ||
        currentZoomLevel >= COMPASS_MAX_ZOOM_LEVEL - 0.01;
    const zoomOutIsDisabled =
        !satellitePreviewIsAvailable ||
        currentZoomLevel <= COMPASS_MIN_ZOOM_LEVEL + 0.01;

    return (
        <View className="w-full">
            <View className="w-full max-w-[330px] self-center">
                <GestureDetector gesture={headingRingGesture}>
                    <View
                        accessibilityLabel="Camera direction compass"
                        className="dark:border-daf-border-dark dark:bg-daf-surface-dark aspect-square w-full rounded-full border border-daf-border bg-daf-surface-card shadow-[0px_8px_24px_rgba(11,14,18,0.16)]"
                        collapsable={false}
                        onLayout={handleDialLayout}
                        testID={dialTestID}
                    >
                        <View
                            className="absolute overflow-hidden bg-[#54524D]"
                            style={previewWindowStyle}
                            testID={`${dialTestID}-satellite-cutout`}
                        >
                            {satellitePreviewIsAvailable ? (
                                <NativeWindMapView
                                    accessibilityLabel="Satellite map for camera location and direction"
                                    attributionEnabled
                                    attributionPosition={
                                        COMPASS_ATTRIBUTION_POSITION
                                    }
                                    className="absolute inset-0"
                                    compassEnabled={false}
                                    doubleTapToZoomInEnabled={false}
                                    gestureSettings={mapGestureSettings}
                                    logoEnabled
                                    logoPosition={COMPASS_LOGO_POSITION}
                                    onCameraChanged={handleCameraChanged}
                                    onDidFinishLoadingMap={handleMapReady}
                                    onMapIdle={handleMapIdle}
                                    pitchEnabled={false}
                                    preferredFramesPerSecond={
                                        COMPASS_PREVIEW_FRAMES_PER_SECOND
                                    }
                                    requestDisallowInterceptTouchEvent
                                    ref={mapViewRef}
                                    rotateEnabled
                                    scaleBarEnabled={false}
                                    scrollEnabled
                                    styleURL={
                                        MAPBOX_STANDARD_SATELLITE_STYLE_URL
                                    }
                                    surfaceView={false}
                                    testID={`${dialTestID}-satellite-preview`}
                                    zoomEnabled={false}
                                >
                                    <Mapbox.StyleImport
                                        config={
                                            COMPASS_SATELLITE_BASEMAP_CONFIG
                                        }
                                        existing
                                        id={MAPBOX_STANDARD_STYLE_IMPORT_ID}
                                    />
                                    <Mapbox.Camera
                                        defaultSettings={
                                            defaultCameraSettingsRef.current
                                        }
                                        ref={cameraRef}
                                    />
                                </NativeWindMapView>
                            ) : (
                                <View className="absolute inset-0 bg-[#54524D]" />
                            )}

                            <DirectionConeOverlay
                                activeDirectionIndex={activeDirectionIndex}
                                activeDirectionValue={displayDegrees}
                                directions={normalizedDirections}
                                testID={dialTestID}
                            />
                            <FixedCameraMarker
                                testID={`${dialTestID}-marker`}
                            />

                            <View
                                className="absolute bottom-[11px] left-0 right-0 items-center px-8"
                                pointerEvents="box-none"
                                style={{ zIndex: 5 }}
                            >
                                <View
                                    accessible
                                    accessibilityActions={[
                                        {
                                            label: 'Increase heading',
                                            name: 'increment',
                                        },
                                        {
                                            label: 'Decrease heading',
                                            name: 'decrement',
                                        },
                                    ]}
                                    accessibilityHint="Swipe up or down to adjust the camera heading."
                                    accessibilityLabel="Camera direction"
                                    accessibilityRole="adjustable"
                                    accessibilityValue={{
                                        max: 359,
                                        min: 0,
                                        now: displayDegrees,
                                        text: formatBearingChip(displayDegrees),
                                    }}
                                    className="bg-daf-surface-inverse/80 max-w-full rounded-dafPill border border-white/20 px-3 py-[5px]"
                                    onAccessibilityAction={
                                        handleAccessibilityAction
                                    }
                                >
                                    <Text
                                        className="font-dafMono text-[13px] font-semibold tracking-[0.02em] text-white"
                                        numberOfLines={1}
                                        testID={`${dialTestID}-readout`}
                                    >
                                        {formatBearingChip(displayDegrees)}
                                    </Text>
                                </View>
                            </View>

                            <View
                                className="absolute right-[18%] top-[38%] h-12 w-12"
                                collapsable={false}
                                pointerEvents="none"
                                testID={`${dialTestID}-pan-target`}
                            />
                            <View
                                className="absolute inset-0 rounded-full border border-white/10"
                                pointerEvents="none"
                                style={{ zIndex: 4 }}
                            />
                            <View
                                className="absolute inset-0 rounded-full border-[3px] border-black/15"
                                pointerEvents="none"
                                style={{ zIndex: 4 }}
                            />
                        </View>

                        <View
                            className="absolute inset-0"
                            pointerEvents="none"
                            testID={`${dialTestID}-heading-ring`}
                        >
                            <Animated.View
                                className="absolute inset-0"
                                style={compassRoseAnimatedStyle}
                            >
                                <Svg
                                    height="100%"
                                    viewBox="0 0 330 330"
                                    width="100%"
                                >
                                    <Circle
                                        cx="165"
                                        cy="165"
                                        fill="none"
                                        r="163.5"
                                        stroke={theme.border.default}
                                        strokeWidth="1"
                                    />
                                    <Circle
                                        cx="165"
                                        cy="165"
                                        fill="none"
                                        r="129"
                                        stroke={theme.border.default}
                                        strokeWidth="1"
                                    />
                                    <Path
                                        d={COMPASS_MINOR_TICK_PATH}
                                        fill="none"
                                        opacity="0.55"
                                        stroke={theme.text.tertiary}
                                        strokeWidth="1"
                                    />
                                    <Path
                                        d={COMPASS_MAJOR_TICK_PATH}
                                        fill="none"
                                        opacity="0.85"
                                        stroke={theme.text.primary}
                                        strokeLinecap="round"
                                        strokeWidth="2"
                                    />
                                </Svg>
                                {dialSize > 0
                                    ? COMPASS_LABELS.map((compassLabel) => (
                                          <CompassRingLabel
                                              bearing={compassLabel.bearing}
                                              dialSize={dialSize}
                                              heading={angle}
                                              key={compassLabel.bearing}
                                              label={compassLabel.label}
                                              testID={`${dialTestID}-heading-label-${compassLabel.bearing}`}
                                              theme={theme}
                                          />
                                      ))
                                    : null}
                            </Animated.View>

                            <View
                                className="absolute left-0 top-1/2 h-[56px] w-[56px] -translate-y-1/2"
                                collapsable={false}
                                pointerEvents="none"
                                testID={`${dialTestID}-heading-handle`}
                            />
                        </View>

                        <View
                            className="absolute inset-0"
                            pointerEvents="none"
                            testID={`${dialTestID}-active-direction-indicator`}
                        >
                            <Svg
                                height="100%"
                                viewBox="0 0 330 330"
                                width="100%"
                            >
                                <Polygon
                                    fill={dafColors.alert[500]}
                                    points="165,27 156.5,7 173.5,7"
                                    stroke="rgba(255,255,255,0.85)"
                                    strokeLinejoin="round"
                                    strokeWidth="1.5"
                                />
                            </Svg>
                        </View>
                    </View>
                </GestureDetector>
            </View>

            <View
                className="mt-3.5 flex-row items-center justify-center gap-2.5"
                testID={`${dialTestID}-controls`}
            >
                <Pressable
                    accessibilityLabel={`Zoom in. Current zoom ${currentZoomLevel.toFixed(1)}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: zoomInIsDisabled }}
                    accessibilityValue={{
                        max: COMPASS_MAX_ZOOM_LEVEL,
                        min: COMPASS_MIN_ZOOM_LEVEL,
                        now: currentZoomLevel,
                        text: `Zoom ${currentZoomLevel.toFixed(1)}`,
                    }}
                    className={COMPASS_ZOOM_BUTTON_CLASS_NAME}
                    disabled={zoomInIsDisabled}
                    onPress={handleZoomInPress}
                    testID={`${dialTestID}-zoom-in-button`}
                >
                    <Icon color={theme.text.primary} name="plus" size={20} />
                </Pressable>
                <Pressable
                    accessibilityLabel={`Zoom out. Current zoom ${currentZoomLevel.toFixed(1)}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: zoomOutIsDisabled }}
                    accessibilityValue={{
                        max: COMPASS_MAX_ZOOM_LEVEL,
                        min: COMPASS_MIN_ZOOM_LEVEL,
                        now: currentZoomLevel,
                        text: `Zoom ${currentZoomLevel.toFixed(1)}`,
                    }}
                    className={COMPASS_ZOOM_BUTTON_CLASS_NAME}
                    disabled={zoomOutIsDisabled}
                    onPress={handleZoomOutPress}
                    testID={`${dialTestID}-zoom-out-button`}
                >
                    <Icon color={theme.text.primary} name="minus" size={20} />
                </Pressable>
            </View>

            {displayLocation ? (
                <Text
                    className="font-dafMono mt-[9px] text-center text-[11px] tracking-[0.02em] text-daf-text-tertiary dark:text-neutral-400"
                    numberOfLines={1}
                    testID={`${dialTestID}-coordinates`}
                >
                    {formatNodeLocation(displayLocation)}
                </Text>
            ) : null}
        </View>
    );
}
