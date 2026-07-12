import { addSentryBreadcrumb } from '../../lib/sentry';
import { mapApiMocksAreEnabled } from './api-mocks';
import { normalizeElectronicHorizonCoordinates } from './electronic-horizon';
import { buildApiURL } from './config';
import { getStoredNumber } from './geo';

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
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.ok === false) {
        throw new Error(
            data?.error ||
                data?.message ||
                'Electronic Horizon ALPR nodes could not be loaded.',
        );
    }

    return normalizeElectronicHorizonAlprNodes(data?.result?.nodes);
}

export async function getElectronicHorizonAlprNodes({
    coordinates,
    signal,
} = {}) {
    const normalizedCoordinates =
        normalizeElectronicHorizonCoordinates(coordinates);

    if (normalizedCoordinates.length < 2) {
        return [];
    }

    if (mapApiMocksAreEnabled()) {
        return [];
    }

    addSentryBreadcrumb({
        category: 'map.electronic_horizon',
        data: { coordinateCount: normalizedCoordinates.length },
        message: 'Electronic Horizon ALPR nodes requested',
    });

    try {
        const response = await fetch(
            buildApiURL('v1/electronic-horizon/alpr'),
            {
                body: JSON.stringify({ coordinates: normalizedCoordinates }),
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                method: 'POST',
                signal,
            },
        );
        const nodes = await readElectronicHorizonAlprResponse(response);

        addSentryBreadcrumb({
            category: 'map.electronic_horizon',
            data: { resultCount: nodes.length },
            message: 'Electronic Horizon ALPR nodes loaded',
        });

        return nodes;
    } catch (error) {
        if (error?.name !== 'AbortError') {
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
    }
}
