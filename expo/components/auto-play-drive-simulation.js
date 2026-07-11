import { useEffect, useState } from 'react';
import {
    getCoordinateBearingDegrees,
    getCoordinateDistanceMeters,
} from './map/geo';

// Google Play requires Android Auto navigation apps to simulate driving to the
// chosen destination once the car host enables auto-drive. Reviewers trigger it
// with `adb shell dumpsys activity service <CarAppService> AUTO_DRIVE`, which
// invokes NavigationManagerCallback.onAutoDriveEnabled.
// https://developer.android.com/training/cars/apps/navigation#simulating-navigation
//
// The playback mirrors real navigation fixes: a steady 45 mph with widely
// spaced updates, matching the cadence the app uses for live guidance.
const AUTO_DRIVE_TICK_MS = 4000;
const AUTO_DRIVE_SPEED_MPH = 45;
const AUTO_DRIVE_SPEED_MPS = AUTO_DRIVE_SPEED_MPH * 0.44704;
const AUTO_DRIVE_LOCATION_ACCURACY_METERS = 5;

let simulationTimer = null;
let simulationIsActive = false;

const simulationLocationListeners = new Set();
const simulationActivityListeners = new Set();

function setSimulationIsActive(nextSimulationIsActive) {
    if (simulationIsActive === nextSimulationIsActive) {
        return;
    }

    simulationIsActive = nextSimulationIsActive;
    simulationActivityListeners.forEach((listener) =>
        listener(simulationIsActive),
    );
}

function makeSimulationSegments(coordinates) {
    if (!Array.isArray(coordinates)) {
        return [];
    }

    const segments = [];
    let routeDistance = 0;

    for (let index = 0; index < coordinates.length - 1; index += 1) {
        const start = coordinates[index];
        const end = coordinates[index + 1];
        const length = getCoordinateDistanceMeters(start, end);

        if (length === null || length <= 0) {
            continue;
        }

        segments.push({
            end,
            endDistance: routeDistance + length,
            heading: getCoordinateBearingDegrees(start, end),
            length,
            start,
            startDistance: routeDistance,
        });
        routeDistance += length;
    }

    return segments;
}

function getSimulatedPositionAtDistance(
    segments,
    distanceAlongRoute,
    speedMetersPerSecond,
) {
    let segment = segments[segments.length - 1];

    for (const candidateSegment of segments) {
        if (distanceAlongRoute <= candidateSegment.endDistance) {
            segment = candidateSegment;
            break;
        }
    }

    const segmentProgress =
        segment.length > 0
            ? Math.min(
                  1,
                  Math.max(
                      0,
                      (distanceAlongRoute - segment.startDistance) /
                          segment.length,
                  ),
              )
            : 1;
    const longitude =
        segment.start[0] +
        (segment.end[0] - segment.start[0]) * segmentProgress;
    const latitude =
        segment.start[1] +
        (segment.end[1] - segment.start[1]) * segmentProgress;

    return {
        coords: {
            accuracy: AUTO_DRIVE_LOCATION_ACCURACY_METERS,
            course: segment.heading ?? undefined,
            heading: segment.heading ?? undefined,
            latitude,
            longitude,
            speed: speedMetersPerSecond,
        },
        locationProvider: 'auto-drive-simulation',
        timestamp: Date.now(),
    };
}

export function startAutoDriveSimulation({
    coordinates,
    onArrive,
    onLocation,
}) {
    stopAutoDriveSimulation();

    const segments = makeSimulationSegments(coordinates);

    if (!segments.length) {
        return false;
    }

    const routeDistance = segments[segments.length - 1].endDistance;
    const speedMetersPerSecond = AUTO_DRIVE_SPEED_MPS;
    let traveledMeters = 0;

    const emitPositionAtDistance = (distanceAlongRoute) => {
        const position = getSimulatedPositionAtDistance(
            segments,
            distanceAlongRoute,
            speedMetersPerSecond,
        );

        onLocation?.(position);
        simulationLocationListeners.forEach((listener) => listener(position));
    };

    simulationTimer = setInterval(() => {
        traveledMeters += speedMetersPerSecond * (AUTO_DRIVE_TICK_MS / 1000);

        if (traveledMeters >= routeDistance) {
            emitPositionAtDistance(routeDistance);
            stopAutoDriveSimulation();
            onArrive?.();
            return;
        }

        emitPositionAtDistance(traveledMeters);
    }, AUTO_DRIVE_TICK_MS);
    setSimulationIsActive(true);
    emitPositionAtDistance(0);

    return true;
}

export function stopAutoDriveSimulation() {
    if (simulationTimer !== null) {
        clearInterval(simulationTimer);
        simulationTimer = null;
    }

    setSimulationIsActive(false);
}

export function getAutoDriveSimulationIsActive() {
    return simulationIsActive;
}

export function addAutoDriveSimulationLocationListener(listener) {
    simulationLocationListeners.add(listener);

    return () => {
        simulationLocationListeners.delete(listener);
    };
}

export function useAutoDriveSimulationIsActive() {
    const [isActive, setIsActive] = useState(simulationIsActive);

    useEffect(() => {
        simulationActivityListeners.add(setIsActive);
        setIsActive(simulationIsActive);

        return () => {
            simulationActivityListeners.delete(setIsActive);
        };
    }, []);

    return isActive;
}
