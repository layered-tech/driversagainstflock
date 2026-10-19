import {
    addCrashlyticsLog,
    recordCrashlyticsError,
} from '../../lib/crashlytics';

// Deliberately omit coordinates, tile grid IDs, file paths, and signed URLs.
export function reportCorridorFailure(stage, error, context = {}) {
    try {
        const message = String(error?.message ?? '');
        const code = /checksum|validation|invalid|unsupported|changed/i.test(
            message,
        )
            ? 'validation'
            : /timed out|timeout/i.test(message)
              ? 'timeout'
              : /disk|save|storage|persist/i.test(message)
                ? 'storage'
                : 'unavailable';
        const data = {
            stage,
            code,
            release: context.release,
            tileSha256: context.tileSha256,
            compressedBytes: context.compressedBytes,
            elapsedMs: context.elapsedMs,
            httpStatus: context.httpStatus,
            fallback: context.fallback,
        };
        addCrashlyticsLog({
            category: 'map.road_corridor',
            level: 'error',
            message: 'Road corridor operation failed',
            data,
        });
        const failure = new Error(`Road corridor ${stage}: ${code}`);
        failure.name = 'RoadCorridorError';
        recordCrashlyticsError(failure);
    } catch {
        // Diagnostics must never interrupt matching or fallback.
    }
}
