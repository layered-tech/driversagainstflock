import { useIsFocused } from '@react-navigation/native';
import Mapbox from '@rnmapbox/maps';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, useColorScheme, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import {
    getNodeLocationFromMapFeature,
    normalizeNodeLocation,
} from '../../lib/osm/node-location';
import { Icon } from '../design-system/icon';
import { dafColors, dafTypography, getDafTheme } from '../design-system/tokens';
import { ConeOfViewImage } from '../map/cone-of-view-image';
import {
    MAPBOX_ACCESS_TOKEN,
    MAPBOX_STANDARD_SATELLITE_STYLE_URL,
} from '../map/config';
import {
    MAP_CONTROL_BUTTON_CLASS_NAME,
    MARKER_CONE_ZOOM_STYLES,
    ZOOM_STEP,
} from '../map/constants';
import { clampZoomLevel } from '../map/geo';
import { MapControlButton } from '../map/map-control-button';
import { NativeWindMapView } from '../map/native-components';

const COMPASS_PREVIEW_ZOOM_LEVEL = 18;
const COMPASS_PREVIEW_FRAMES_PER_SECOND = 30;
const COMPASS_CAMERA_ANIMATION_DURATION_MS = 220;
const COMPASS_CONE_PADDING = 4;
const COMPASS_RING_INNER_RADIUS_RATIO = 0.72;
const COMPASS_RING_ACTIVATION_DISTANCE = 4;
const COMPASS_CONTROL_CLASS_NAME = `${MAP_CONTROL_BUTTON_CLASS_NAME} border-white bg-white/90 dark:border-daf-border-dark dark:bg-daf-surface-dark/90`;
const COMPASS_CONTROL_GLASS_TINT_COLOR = 'rgba(255,255,255,0.78)';
const COMPASS_LABELS = [
    { bearing: 0, label: 'N', x: 50, y: 12 },
    { bearing: 90, label: 'E', x: 88, y: 53 },
    { bearing: 180, label: 'S', x: 50, y: 94 },
    { bearing: 270, label: 'W', x: 12, y: 53 },
];
const COMPASS_ACCESSIBILITY_STEP_DEGREES = 5;

if (MAPBOX_ACCESS_TOKEN) {
    Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
}

function normalizeDialDegrees(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return 0;
    }

    return ((Math.round(numericValue) % 360) + 360) % 360;
}

function getCompassConeStyle(zoomLevel) {
    return MARKER_CONE_ZOOM_STYLES.reduce(
        (selectedConeStyle, coneStyle) =>
            coneStyle.minZoom <= zoomLevel ? coneStyle : selectedConeStyle,
        MARKER_CONE_ZOOM_STYLES[0],
    );
}

function formatNodeLocation(location) {
    return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
}

function DirectionConeOverlay({
    activeDirectionIndex,
    activeDirectionValue,
    coneStyle,
    directions,
    testID,
}) {
    const inactiveConeStyle = {
        ...coneStyle,
        borderColor: dafColors.azure[600],
        color: dafColors.azure[500],
        opacity: 0.22,
    };

    return directions.map((direction, directionIndex) => {
        const isActive = directionIndex === activeDirectionIndex;
        const rotation = isActive
            ? 0
            : normalizeDialDegrees(direction - activeDirectionValue);

        return (
            <View
                className="absolute inset-0 items-center justify-center"
                key={`direction-cone-${directionIndex}`}
                pointerEvents="none"
                style={{
                    transform: [{ rotate: `${rotation}deg` }],
                    zIndex: isActive ? 1 : 0,
                }}
                testID={`${testID}-direction-cone-${directionIndex}`}
            >
                <View testID={isActive ? `${testID}-cone` : undefined}>
                    <ConeOfViewImage
                        coneStyle={isActive ? coneStyle : inactiveConeStyle}
                    />
                </View>
            </View>
        );
    });
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
    const currentZoomRef = useRef(COMPASS_PREVIEW_ZOOM_LEVEL);
    const defaultCameraSettingsRef = useRef(null);
    const mapViewRef = useRef(null);
    const markerTranslationX = useSharedValue(0);
    const markerTranslationY = useSharedValue(0);
    const [previewConeStyle, setPreviewConeStyle] = useState(() =>
        getCompassConeStyle(COMPASS_PREVIEW_ZOOM_LEVEL),
    );
    const normalizedLocation = normalizeNodeLocation(location);
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
    const latitude = normalizedLocation?.latitude ?? null;
    const longitude = normalizedLocation?.longitude ?? null;
    const coordinate = useMemo(
        () =>
            latitude === null || longitude === null
                ? null
                : [longitude, latitude],
        [latitude, longitude],
    );
    const [dialSize, setDialSize] = useState(0);
    const [displayDegrees, setDisplayDegrees] = useState(() =>
        normalizeDialDegrees(value),
    );
    const angle = useSharedValue(normalizeDialDegrees(value));
    const dialCenter = useSharedValue(0);
    const headingRingTouchIsEligible = useSharedValue(false);
    const headingRingTouchStartX = useSharedValue(0);
    const headingRingTouchStartY = useSharedValue(0);
    const lastReportedDegrees = useSharedValue(normalizeDialDegrees(value));
    const lastTouchAngle = useSharedValue(0);
    const previewCameraFrameRef = useRef(null);
    const pendingPreviewHeadingRef = useRef(normalizeDialDegrees(value));
    const dialTestID = testID ?? 'camera-direction-dial';
    const theme = getDafTheme(colorScheme);
    const satellitePreviewIsAvailable =
        isFocused && Boolean(MAPBOX_ACCESS_TOKEN) && coordinate !== null;
    const ornamentBottom = Math.max(108, Math.round(dialSize * 0.3));
    const ornamentSide = Math.max(28, Math.round(dialSize * 0.15));
    const logoPosition = useMemo(
        () => ({ bottom: ornamentBottom, left: ornamentSide }),
        [ornamentBottom, ornamentSide],
    );
    const attributionPosition = useMemo(
        () => ({ bottom: ornamentBottom, right: ornamentSide }),
        [ornamentBottom, ornamentSide],
    );
    const markerContentStyle = useMemo(() => {
        const size = Math.ceil(
            previewConeStyle.length * 2 + COMPASS_CONE_PADDING * 2,
        );

        return { height: size, width: size };
    }, [previewConeStyle]);

    if (coordinate && !defaultCameraSettingsRef.current) {
        defaultCameraSettingsRef.current = {
            centerCoordinate: coordinate,
            heading: normalizeDialDegrees(value),
            pitch: 0,
            zoomLevel: COMPASS_PREVIEW_ZOOM_LEVEL,
        };
    }

    const schedulePreviewCameraHeading = useCallback((degrees) => {
        pendingPreviewHeadingRef.current = degrees;

        if (previewCameraFrameRef.current !== null) {
            return;
        }

        previewCameraFrameRef.current = requestAnimationFrame(() => {
            previewCameraFrameRef.current = null;
            cameraRef.current?.setCamera({
                animationDuration: 0,
                animationMode: 'none',
                heading: pendingPreviewHeadingRef.current,
                zoomLevel: currentZoomRef.current,
            });
        });
    }, []);

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

        angle.value = normalizedValue;
        lastReportedDegrees.value = normalizedValue;
        handlePreviewBearingChange(normalizedValue);
    }, [angle, handlePreviewBearingChange, lastReportedDegrees, value]);

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

            handlePreviewBearingChange(normalizedDegrees);
            onChange?.(normalizedDegrees);
        },
        [handlePreviewBearingChange, onChange],
    );

    const handleMapLocationChange = useCallback(
        (feature) => {
            const nextLocation = getNodeLocationFromMapFeature(feature);

            if (nextLocation) {
                onLocationChange?.(nextLocation);
            }
        },
        [onLocationChange],
    );

    const resetMarkerTranslation = useCallback(() => {
        markerTranslationX.value = 0;
        markerTranslationY.value = 0;
    }, [markerTranslationX, markerTranslationY]);

    const handleMarkerDragEnd = useCallback(
        async (translationX, translationY) => {
            try {
                const mapView = mapViewRef.current;

                if (!mapView || !coordinate) {
                    return;
                }

                const markerScreenPoint =
                    await mapView.getPointInView(coordinate);

                if (
                    !Array.isArray(markerScreenPoint) ||
                    !Number.isFinite(markerScreenPoint[0]) ||
                    !Number.isFinite(markerScreenPoint[1])
                ) {
                    return;
                }

                const droppedCoordinate = await mapView.getCoordinateFromView([
                    markerScreenPoint[0] + translationX,
                    markerScreenPoint[1] + translationY,
                ]);
                const nextLocation = normalizeNodeLocation({
                    latitude: droppedCoordinate?.[1],
                    longitude: droppedCoordinate?.[0],
                });

                if (nextLocation) {
                    onLocationChange?.(nextLocation);
                }
            } catch {
                return;
            } finally {
                requestAnimationFrame(resetMarkerTranslation);
            }
        },
        [coordinate, onLocationChange, resetMarkerTranslation],
    );

    const markerDragGesture = useMemo(
        () =>
            Gesture.Pan()
                .minDistance(1)
                .maxPointers(1)
                .onUpdate((event) => {
                    markerTranslationX.value = event.translationX;
                    markerTranslationY.value = event.translationY;
                })
                .onEnd((event) => {
                    runOnJS(handleMarkerDragEnd)(
                        event.translationX,
                        event.translationY,
                    );
                })
                .onFinalize((_event, succeeded) => {
                    if (!succeeded) {
                        markerTranslationX.value = 0;
                        markerTranslationY.value = 0;
                    }
                }),
        [handleMarkerDragEnd, markerTranslationX, markerTranslationY],
    );
    const markerAnimatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: markerTranslationX.value },
            { translateY: markerTranslationY.value },
        ],
    }));

    const handleCameraChanged = useCallback((cameraState) => {
        const zoomLevel = Number(cameraState?.properties?.zoom);

        if (!Number.isFinite(zoomLevel)) {
            return;
        }

        const nextZoomLevel = clampZoomLevel(zoomLevel);
        const nextConeStyle = getCompassConeStyle(nextZoomLevel);

        currentZoomRef.current = nextZoomLevel;
        setPreviewConeStyle((currentConeStyle) =>
            currentConeStyle.minZoom === nextConeStyle.minZoom
                ? currentConeStyle
                : nextConeStyle,
        );
    }, []);

    const handleZoomPress = useCallback((zoomDelta) => {
        const previousZoomLevel = currentZoomRef.current;
        const nextZoomLevel = clampZoomLevel(previousZoomLevel + zoomDelta);

        if (Math.abs(nextZoomLevel - previousZoomLevel) < 0.01) {
            return;
        }

        currentZoomRef.current = nextZoomLevel;
        setPreviewConeStyle(getCompassConeStyle(nextZoomLevel));
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

    const handleRecenterPress = useCallback(() => {
        if (!coordinate) {
            return;
        }

        cameraRef.current?.setCamera({
            animationDuration: COMPASS_CAMERA_ANIMATION_DURATION_MS,
            animationMode: 'easeTo',
            centerCoordinate: coordinate,
            heading: pendingPreviewHeadingRef.current,
            pitch: 0,
            zoomLevel: currentZoomRef.current,
        });
    }, [coordinate]);

    const handleMapReady = useCallback(() => {
        if (!coordinate) {
            return;
        }

        currentZoomRef.current = COMPASS_PREVIEW_ZOOM_LEVEL;
        setPreviewConeStyle(getCompassConeStyle(COMPASS_PREVIEW_ZOOM_LEVEL));
        cameraRef.current?.setCamera({
            animationDuration: 0,
            animationMode: 'none',
            centerCoordinate: coordinate,
            heading: pendingPreviewHeadingRef.current,
            pitch: 0,
            zoomLevel: COMPASS_PREVIEW_ZOOM_LEVEL,
        });
    }, [coordinate]);

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

                const roundedDegrees = Math.round(nextAngle) % 360;

                if (roundedDegrees !== lastReportedDegrees.value) {
                    lastReportedDegrees.value = roundedDegrees;
                    runOnJS(handlePreviewBearingChange)(roundedDegrees);
                }
            })
            .onEnd(() => {
                runOnJS(handleInteractionEnd)(Math.round(angle.value) % 360);
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

    return (
        <View className="w-full gap-2">
            <GestureDetector gesture={headingRingGesture}>
                <View
                    className="dark:border-daf-border-dark dark:bg-daf-surface-dark bg-daf-surface-secondary aspect-square w-full overflow-hidden rounded-full border border-daf-border"
                    collapsable={false}
                    onLayout={handleDialLayout}
                    testID={dialTestID}
                >
                    {satellitePreviewIsAvailable ? (
                        <NativeWindMapView
                            accessibilityLabel="Satellite compass for camera location and direction"
                            attributionEnabled
                            attributionPosition={attributionPosition}
                            className="absolute inset-0"
                            compassEnabled={false}
                            doubleTapToZoomInEnabled={false}
                            logoEnabled
                            logoPosition={logoPosition}
                            onCameraChanged={handleCameraChanged}
                            onDidFinishLoadingMap={handleMapReady}
                            onPress={handleMapLocationChange}
                            pitchEnabled={false}
                            preferredFramesPerSecond={
                                COMPASS_PREVIEW_FRAMES_PER_SECOND
                            }
                            ref={mapViewRef}
                            requestDisallowInterceptTouchEvent
                            rotateEnabled={false}
                            scaleBarEnabled={false}
                            scrollEnabled
                            styleURL={MAPBOX_STANDARD_SATELLITE_STYLE_URL}
                            surfaceView={false}
                            testID={`${dialTestID}-satellite-preview`}
                            zoomEnabled={false}
                        >
                            <Mapbox.Camera
                                defaultSettings={
                                    defaultCameraSettingsRef.current
                                }
                                ref={cameraRef}
                            />
                            <Mapbox.MarkerView
                                allowOverlap
                                allowOverlapWithPuck
                                anchor={{ x: 0.5, y: 0.5 }}
                                coordinate={coordinate}
                            >
                                <Animated.View
                                    collapsable={false}
                                    pointerEvents="box-none"
                                    style={[
                                        markerContentStyle,
                                        markerAnimatedStyle,
                                    ]}
                                >
                                    <DirectionConeOverlay
                                        activeDirectionIndex={
                                            activeDirectionIndex
                                        }
                                        activeDirectionValue={displayDegrees}
                                        coneStyle={previewConeStyle}
                                        directions={normalizedDirections}
                                        testID={dialTestID}
                                    />
                                    <View
                                        className="absolute inset-0 items-center justify-center"
                                        pointerEvents="box-none"
                                    >
                                        <GestureDetector
                                            gesture={markerDragGesture}
                                        >
                                            <View
                                                accessibilityHint="Drag to move this camera."
                                                accessibilityLabel="Camera location marker"
                                                accessibilityRole="adjustable"
                                                className="h-[72px] w-[72px] items-center justify-center"
                                                collapsable={false}
                                                testID={`${dialTestID}-marker`}
                                            >
                                                <View className="h-4 w-4 rounded-full border-[2.5px] border-white bg-daf-danger shadow-[0px_2px_6px_rgba(11,14,18,0.35)]" />
                                            </View>
                                        </GestureDetector>
                                    </View>
                                </Animated.View>
                            </Mapbox.MarkerView>
                        </NativeWindMapView>
                    ) : (
                        <View className="bg-daf-surface-secondary dark:bg-daf-surface-dark absolute inset-0 items-center justify-center">
                            <DirectionConeOverlay
                                activeDirectionIndex={activeDirectionIndex}
                                activeDirectionValue={displayDegrees}
                                coneStyle={previewConeStyle}
                                directions={normalizedDirections}
                                testID={dialTestID}
                            />
                            <View className="absolute inset-0 items-center justify-center">
                                <View className="h-4 w-4 rounded-full border-[2.5px] border-white bg-daf-danger" />
                            </View>
                        </View>
                    )}

                    <View className="absolute inset-0" pointerEvents="none">
                        <Animated.View
                            className="h-full w-full"
                            style={compassRoseAnimatedStyle}
                        >
                            <Svg
                                height="100%"
                                viewBox="0 0 100 100"
                                width="100%"
                            >
                                <Circle
                                    cx="50"
                                    cy="50"
                                    fill="none"
                                    r="43"
                                    stroke="rgba(11,14,18,0.42)"
                                    strokeWidth="14"
                                />
                                <Circle
                                    cx="50"
                                    cy="50"
                                    fill="rgba(11,14,18,0.08)"
                                    r="47"
                                    stroke="rgba(255,255,255,0.82)"
                                    strokeWidth="1.2"
                                />
                                {COMPASS_LABELS.map((compassLabel) => (
                                    <SvgText
                                        fill="#ffffff"
                                        fontFamily={
                                            dafTypography.mono.fontFamily
                                        }
                                        fontSize="6"
                                        fontWeight="700"
                                        key={compassLabel.bearing}
                                        stroke="rgba(11,14,18,0.72)"
                                        strokeWidth="0.7"
                                        textAnchor="middle"
                                        x={compassLabel.x}
                                        y={compassLabel.y}
                                    >
                                        {compassLabel.label}
                                    </SvgText>
                                ))}
                            </Svg>
                        </Animated.View>
                    </View>

                    <View
                        className="absolute inset-0"
                        pointerEvents="none"
                        testID={`${dialTestID}-heading-ring`}
                    >
                        <View
                            className="absolute left-0 top-1/2 h-[56px] w-[56px] -translate-y-1/2"
                            collapsable={false}
                            pointerEvents="none"
                            testID={`${dialTestID}-heading-handle`}
                        />
                    </View>

                    <View
                        className="absolute right-1/4 top-1/3 h-12 w-12"
                        collapsable={false}
                        pointerEvents="none"
                        testID={`${dialTestID}-pan-target`}
                    />

                    {satellitePreviewIsAvailable ? (
                        <View
                            className="absolute bottom-4 left-0 right-0 items-center"
                            pointerEvents="box-none"
                            testID={`${dialTestID}-controls`}
                        >
                            <View className="flex-row gap-2">
                                <MapControlButton
                                    accessibilityLabel="Zoom in"
                                    accessibilityRole="button"
                                    className={COMPASS_CONTROL_CLASS_NAME}
                                    glassTintColor={
                                        COMPASS_CONTROL_GLASS_TINT_COLOR
                                    }
                                    onPress={handleZoomInPress}
                                    testID={`${dialTestID}-zoom-in-button`}
                                >
                                    <Icon
                                        color={theme.text.primary}
                                        name="plus"
                                        size={22}
                                    />
                                </MapControlButton>
                                <MapControlButton
                                    accessibilityLabel="Zoom out"
                                    accessibilityRole="button"
                                    className={COMPASS_CONTROL_CLASS_NAME}
                                    glassTintColor={
                                        COMPASS_CONTROL_GLASS_TINT_COLOR
                                    }
                                    onPress={handleZoomOutPress}
                                    testID={`${dialTestID}-zoom-out-button`}
                                >
                                    <Icon
                                        color={theme.text.primary}
                                        name="minus"
                                        size={22}
                                    />
                                </MapControlButton>
                                <MapControlButton
                                    accessibilityHint="Moves the map back to the camera marker without changing its location."
                                    accessibilityLabel="Re-center on marker"
                                    accessibilityRole="button"
                                    className={COMPASS_CONTROL_CLASS_NAME}
                                    glassTintColor={
                                        COMPASS_CONTROL_GLASS_TINT_COLOR
                                    }
                                    onPress={handleRecenterPress}
                                    testID={`${dialTestID}-recenter-button`}
                                >
                                    <Icon
                                        color={theme.text.primary}
                                        name="locate-fixed"
                                        size={20}
                                    />
                                </MapControlButton>
                            </View>
                        </View>
                    ) : null}

                    <View
                        className="absolute bottom-[72px] left-0 right-0 items-center px-8"
                        pointerEvents="none"
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
                                text: `${displayDegrees} degrees`,
                            }}
                            className="bg-daf-surface-dark/75 max-w-full flex-row items-center gap-2 rounded-dafPill border border-white/45 px-2.5 py-1"
                            onAccessibilityAction={handleAccessibilityAction}
                        >
                            <Text
                                className="font-dafMono text-xs font-bold text-white"
                                testID={`${dialTestID}-readout`}
                            >
                                {displayDegrees}°
                            </Text>
                            {normalizedLocation ? (
                                <>
                                    <View className="h-3 w-px bg-white/40" />
                                    <Text
                                        className="font-dafMono shrink text-[10px] font-semibold text-white/90"
                                        numberOfLines={1}
                                        testID={`${dialTestID}-coordinates`}
                                    >
                                        {formatNodeLocation(normalizedLocation)}
                                    </Text>
                                </>
                            ) : null}
                        </View>
                    </View>
                </View>
            </GestureDetector>
            <Text className="text-center text-xs leading-[17px] text-daf-text-tertiary dark:text-neutral-400">
                Drag the center marker to move the camera, drag the map to pan,
                or drag the outer ring to aim.
            </Text>
        </View>
    );
}
