import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

const mapLocationPuckModule =
    Platform.OS === 'ios'
        ? requireOptionalNativeModule('MapLocationPuck')
        : null;

let nextMapPerformanceSignpostIdentifier = 0;

function formatSignpostMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') {
        return '';
    }

    return Object.entries(metadata)
        .filter(
            ([, value]) =>
                typeof value === 'string' ||
                typeof value === 'boolean' ||
                Number.isFinite(value),
        )
        .map(([key, value]) => `${key}=${value}`)
        .sort()
        .join(' ')
        .slice(0, 160);
}

function isMapPerformanceSignpostingSupported() {
    return Boolean(
        mapLocationPuckModule?.beginMapPerformanceSignpost &&
        mapLocationPuckModule?.endMapPerformanceSignpost &&
        mapLocationPuckModule?.recordMapPerformanceSignpost,
    );
}

export function beginMapPerformanceSignpost(operation, metadata) {
    if (!isMapPerformanceSignpostingSupported()) {
        return null;
    }

    nextMapPerformanceSignpostIdentifier += 1;
    const identifier = `map-${nextMapPerformanceSignpostIdentifier}`;

    try {
        mapLocationPuckModule.beginMapPerformanceSignpost(
            operation,
            identifier,
            formatSignpostMetadata(metadata),
        );

        return identifier;
    } catch {
        return null;
    }
}

export function endMapPerformanceSignpost(operation, identifier, metadata) {
    if (!identifier || !isMapPerformanceSignpostingSupported()) {
        return;
    }

    try {
        mapLocationPuckModule.endMapPerformanceSignpost(
            operation,
            identifier,
            formatSignpostMetadata(metadata),
        );
    } catch {
        // Performance instrumentation must never affect driving guidance.
    }
}

export function recordMapPerformanceSignpost(operation, metadata) {
    if (!isMapPerformanceSignpostingSupported()) {
        return;
    }

    try {
        mapLocationPuckModule.recordMapPerformanceSignpost(
            operation,
            formatSignpostMetadata(metadata),
        );
    } catch {
        // Performance instrumentation must never affect driving guidance.
    }
}
