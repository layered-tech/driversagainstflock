import { fetch as expoFetch } from 'expo/fetch';
import { addSentryBreadcrumb } from '../../lib/sentry';
import { runAbortableOperation } from './abortable-operation';
import { mapApiMocksAreEnabled } from './api-mocks';
import { buildApiURL } from './config';
import { normalizeElectronicHorizonCoordinates } from './electronic-horizon';
import { getStoredNumber } from './geo';
import {
    beginMapPerformanceSignpost,
    endMapPerformanceSignpost,
    recordMapPerformanceSignpost,
} from './map-performance-signposts';
import { getScorecardDriveE2EElectronicHorizonFixture } from './scorecard-drive-e2e-fixture';

function normalizeElectronicHorizonAlprNode(node, index) {
    const coordinate = normalizeElectronicHorizonCoordinates([
        node?.coordinate,
    ])[0];
    const osmId = getStoredNumber(node?.osm_id ?? node?.osmId);

    if (!coordinate || osmId === null) {
        return null;
    }

    return {
        cameraDirection:
            typeof node?.camera_direction === 'string'
                ? node.camera_direction
                : typeof node?.cameraDirection === 'string'
                  ? node.cameraDirection
                  : null,
        coordinate,
        direction: typeof node?.direction === 'string' ? node.direction : null,
        id: String(node?.id ?? `osm-node-${osmId}-${index}`),
        osmId,
        tags: node?.tags && typeof node.tags === 'object' ? node.tags : {},
    };
}

function normalizeElectronicHorizonAlprNodes(nodes) {
    if (!Array.isArray(nodes)) {
        return [];
    }

    return nodes.map(normalizeElectronicHorizonAlprNode).filter(Boolean);
}

async function readElectronicHorizonAlprResponse(response) {
    const responseDecodingSignpost = beginMapPerformanceSignpost(
        'alpr.response.decode',
        { status: response.status },
    );

    try {
        const data = await response.json().catch(() => ({}));

        if (!response.ok || data?.ok === false) {
            recordMapPerformanceSignpost('alpr.response.rejected', {
                status: response.status,
            });
            throw new Error(
                data?.error ||
                    data?.message ||
                    'Electronic Horizon ALPR nodes could not be loaded.',
            );
        }

        const nodes = normalizeElectronicHorizonAlprNodes(data?.result?.nodes);
        const coverageComplete = data?.result?.coverage_complete === true;

        recordMapPerformanceSignpost('alpr.response.normalized', {
            nodeCount: nodes.length,
        });

        return { coverageComplete, nodes };
    } finally {
        endMapPerformanceSignpost(
            'alpr.response.decode',
            responseDecodingSignpost,
            { status: response.status },
        );
    }
}

export async function getElectronicHorizonAlprNodes({
    coordinates,
    signal,
} = {}) {
    const normalizedCoordinates =
        normalizeElectronicHorizonCoordinates(coordinates);

    if (normalizedCoordinates.length < 2) {
        return { coverageComplete: false, nodes: [] };
    }

    if (mapApiMocksAreEnabled()) {
        return (
            getScorecardDriveE2EElectronicHorizonFixture() ?? {
                coverageComplete: false,
                nodes: [],
            }
        );
    }

    const requestSignpost = beginMapPerformanceSignpost('alpr.request', {
        coordinateCount: normalizedCoordinates.length,
    });

    addSentryBreadcrumb({
        category: 'map.electronic_horizon',
        data: { coordinateCount: normalizedCoordinates.length },
        message: 'Electronic Horizon ALPR nodes requested',
    });

    try {
        const result = await runAbortableOperation(async () => {
            const response = await expoFetch(
                buildApiURL('v1/electronic-horizon/alpr'),
                {
                    body: JSON.stringify({
                        coordinates: normalizedCoordinates,
                    }),
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                    method: 'POST',
                    signal,
                },
            );

            recordMapPerformanceSignpost('alpr.response.received', {
                status: response.status,
            });

            return readElectronicHorizonAlprResponse(response);
        }, signal);

        addSentryBreadcrumb({
            category: 'map.electronic_horizon',
            data: {
                coverageComplete: result.coverageComplete,
                resultCount: result.nodes.length,
            },
            message: 'Electronic Horizon ALPR nodes loaded',
        });

        return result;
    } catch (error) {
        const requestWasAborted =
            signal?.aborted === true || error?.name === 'AbortError';

        recordMapPerformanceSignpost('alpr.request.failed', {
            aborted: requestWasAborted,
        });

        if (!requestWasAborted) {
            addSentryBreadcrumb({
                category: 'api',
                data: {
                    errorMessage: error?.message,
                    operation: 'Electronic Horizon ALPR nodes',
                },
                level: 'error',
                message: 'Electronic Horizon ALPR nodes failed',
            });
        }

        throw error;
    } finally {
        endMapPerformanceSignpost('alpr.request', requestSignpost, {
            coordinateCount: normalizedCoordinates.length,
        });
    }
}
