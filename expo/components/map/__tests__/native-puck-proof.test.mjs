import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    NATIVE_LOCATION_PUCK_LAYER_IDS,
    queryRenderedNativePuckState,
} from '../native-puck-render-query.js';
import {
    nativePuckCoordinatesMatch,
    nativePuckStateProves3DSnapping,
    nativePuckStateProvesRendered3D,
    nativePuckStateProvesSnapping,
} from '../native-puck-state.js';

function makeRendered3DPuckState(overrides = {}) {
    return {
        indicatorAtRawCoordinate: false,
        indicatorAtSnappedCoordinate: true,
        indicatorLayerExists: false,
        locationEnabled: true,
        modelAssetByteLength: 21_636,
        modelAssetSha256:
            'ab6a662ad8d0696f4a763ce364a1f73c0d4c5a56361baa4ab57644e85381fccc',
        modelCastShadows: false,
        modelEmissiveStrength: 1,
        modelLayerExists: true,
        modelReceiveShadows: false,
        modelRotation: [0, 0, 0],
        modelScale: [75, 75, 75],
        modelScaleMode: 'viewport',
        modelSourceExists: true,
        modelUri: 'asset://navigation_puck.glb',
        proofSource: 'native-3d-puck',
        providerAtRawCoordinate: false,
        providerAtSnappedCoordinate: true,
        puckBearing: 'heading',
        puckBearingEnabled: true,
        puckKind: '3d',
        renderedAtSnappedCoordinate: true,
        ...overrides,
    };
}

describe('native puck snapping proof', () => {
    test('queries the native puck layers at snapped and raw coordinates', async () => {
        const queryCalls = [];
        const mapView = {
            async getPointInView(coordinate) {
                return coordinate;
            },
            async queryRenderedFeaturesAtPoint(point, filter, layerIds) {
                queryCalls.push({ filter, layerIds, point });

                return {
                    features: point[1] === 30.2672 ? [{ id: 'puck' }] : [],
                };
            },
        };

        const puckState = await queryRenderedNativePuckState({
            mapView,
            rawCoordinate: [-97.7441401, 30.266984],
            snappedCoordinate: [-97.7441401, 30.2672],
        });

        assert.deepEqual(puckState, {
            proofSource: 'rendered-query',
            providerAtRawCoordinate: null,
            providerAtSnappedCoordinate: null,
            providerCoordinate: null,
            renderedAtRawCoordinate: false,
            renderedAtSnappedCoordinate: true,
        });
        assert.equal(queryCalls.length, 2);
        assert.deepEqual(queryCalls[0].filter, []);
        assert.deepEqual(
            queryCalls[0].layerIds,
            NATIVE_LOCATION_PUCK_LAYER_IDS,
        );
    });

    test('requires the installed provider and native indicator at the snapped coordinate', () => {
        assert.equal(
            nativePuckStateProvesSnapping({
                proofSource: 'native-3d-puck',
                indicatorAtRawCoordinate: false,
                indicatorAtSnappedCoordinate: true,
                providerAtRawCoordinate: false,
                providerAtSnappedCoordinate: true,
            }),
            true,
        );
        assert.equal(
            nativePuckStateProvesSnapping({
                proofSource: 'native-3d-puck',
                indicatorAtRawCoordinate: false,
                indicatorAtSnappedCoordinate: false,
                providerAtRawCoordinate: false,
                providerAtSnappedCoordinate: true,
            }),
            false,
        );
        assert.equal(
            nativePuckStateProvesSnapping({
                proofSource: 'native-3d-puck',
                indicatorAtRawCoordinate: false,
                indicatorAtSnappedCoordinate: true,
                providerAtRawCoordinate: true,
                providerAtSnappedCoordinate: true,
            }),
            false,
        );
        assert.equal(
            nativePuckStateProvesSnapping({
                proofSource: 'native-3d-puck',
                indicatorAtRawCoordinate: true,
                indicatorAtSnappedCoordinate: true,
                providerAtRawCoordinate: false,
                providerAtSnappedCoordinate: true,
            }),
            false,
        );
    });

    test('requires a rendered 3D model and the exact packaged asset', () => {
        const validState = makeRendered3DPuckState();

        assert.equal(nativePuckStateProvesRendered3D(validState), true);
        assert.equal(nativePuckStateProves3DSnapping(validState), true);

        for (const invalidState of [
            { puckKind: '2d' },
            { modelUri: 'asset://wrong.glb' },
            { modelScale: [1, 1, 1] },
            { modelRotation: [0, 0, 180] },
            { modelScaleMode: 'map' },
            { modelCastShadows: true },
            { modelReceiveShadows: true },
            { modelLayerExists: false },
            { modelSourceExists: false },
            { indicatorLayerExists: true },
            { renderedAtSnappedCoordinate: false },
            { modelAssetByteLength: 0 },
            { modelAssetSha256: 'wrong' },
            { puckBearing: 'course' },
            { providerAtRawCoordinate: true },
        ]) {
            assert.equal(
                nativePuckStateProves3DSnapping(
                    makeRendered3DPuckState(invalidState),
                ),
                false,
            );
        }
    });

    test('accepts a snapped rendered hit when the model footprint also overlaps raw GPS', () => {
        assert.equal(
            nativePuckStateProvesSnapping({
                proofSource: 'rendered-query',
                renderedAtRawCoordinate: false,
                renderedAtSnappedCoordinate: true,
            }),
            true,
        );
        assert.equal(
            nativePuckStateProvesSnapping({
                proofSource: 'rendered-query',
                renderedAtRawCoordinate: true,
                renderedAtSnappedCoordinate: true,
            }),
            true,
        );
    });

    test('matches only coordinates within the native proof tolerance', () => {
        assert.equal(
            nativePuckCoordinatesMatch(
                [-97.7441401, 30.2672],
                [-97.7441407, 30.2672006],
            ),
            true,
        );
        assert.equal(
            nativePuckCoordinatesMatch(
                [-97.7441401, 30.2672],
                [-97.744142, 30.2672],
            ),
            false,
        );
    });

    test('does not query without both coordinates and a map', async () => {
        assert.equal(
            await queryRenderedNativePuckState({
                mapView: null,
                rawCoordinate: null,
                snappedCoordinate: null,
            }),
            null,
        );
    });
});
