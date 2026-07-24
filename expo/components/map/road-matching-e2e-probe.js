import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from '../../lib/safe-area-insets';
import { queryNativePuckState } from './native-puck-proof';
import {
    nativePuckStateProves3DSnapping,
    nativePuckStateProvesRendered3D,
} from './native-puck-state';
import {
    addRoadMatchingSessionStateListener,
    getRoadMatchingSessionDiagnostics,
} from './road-matching-session';

const NATIVE_PUCK_PROOF_POLL_INTERVAL_MS = 100;

function formatCoordinate(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue.toFixed(7) : '';
}

function formatCoordinatePair(coordinate) {
    return `${formatCoordinate(coordinate?.[0])},${formatCoordinate(coordinate?.[1])}`;
}

function formatProofValue(value) {
    return typeof value === 'boolean' ? String(value) : 'pending';
}

export function RoadMatchingE2EProbe({
    mapViewRef,
    roadLookAhead,
    userLocation,
}) {
    const safeAreaInsets = useSafeAreaInsets();
    const [diagnostics, setDiagnostics] = useState(
        getRoadMatchingSessionDiagnostics,
    );
    const [nativePuckState, setNativePuckState] = useState(null);

    useEffect(() => {
        const subscription = addRoadMatchingSessionStateListener(
            (nextDiagnostics) => {
                setDiagnostics(nextDiagnostics);
            },
        );

        return () => {
            subscription.remove();
        };
    }, []);

    const roadMatch = userLocation?.roadMatch;
    const snappedCoordinate = [userLocation?.longitude, userLocation?.latitude];
    const rawCoordinate = diagnostics.lastRawCoordinate;
    const snappedCoordinateKey = formatCoordinatePair(snappedCoordinate);
    const rawCoordinateKey = formatCoordinatePair(rawCoordinate);
    const nativePuckProof = nativePuckStateProves3DSnapping(nativePuckState);
    const native3DPuckProof = nativePuckStateProvesRendered3D(nativePuckState);
    const lookAheadEdgeIds = Array.isArray(roadLookAhead?.primaryPath?.segments)
        ? roadLookAhead.primaryPath.segments
              .map((segment) => segment?.edgeId)
              .filter(Boolean)
              .join(',')
        : '';

    useEffect(() => {
        let cancelled = false;
        let retryTimeout = null;

        setNativePuckState(null);

        async function updateNativePuckProof() {
            let nextPuckState = null;

            try {
                nextPuckState = await queryNativePuckState({
                    mapView: mapViewRef?.current,
                    rawCoordinate,
                    snappedCoordinate,
                });
            } catch {
                nextPuckState = null;
            }

            if (cancelled) {
                return;
            }

            setNativePuckState(nextPuckState);

            if (nativePuckStateProves3DSnapping(nextPuckState)) {
                return;
            }

            retryTimeout = setTimeout(
                updateNativePuckProof,
                NATIVE_PUCK_PROOF_POLL_INTERVAL_MS,
            );
        }

        void updateNativePuckProof();

        return () => {
            cancelled = true;
            clearTimeout(retryTimeout);
        };
    }, [mapViewRef, rawCoordinateKey, snappedCoordinateKey]);

    return (
        <View
            className="absolute left-1 z-50 max-w-[280px] gap-px rounded bg-black/80 p-1"
            pointerEvents="none"
            style={{ bottom: safeAreaInsets.bottom + 4 }}
            testID="e2e-road-matching-probe"
        >
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-road-matching-state"
            >
                {diagnostics.state}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-road-matching-source"
            >
                {diagnostics.source}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-road-matching-background-delivery"
            >
                {diagnostics.lastBackgroundDeliveryAppState ?? ''}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-road-matching-background-raw-coordinate"
            >
                {formatCoordinatePair(
                    diagnostics.lastBackgroundDelivery?.rawCoordinate,
                )}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-road-matching-background-edge-id"
            >
                {diagnostics.lastBackgroundDelivery?.matchedEdgeId ?? ''}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-road-matching-background-coordinate"
            >
                {formatCoordinatePair(
                    diagnostics.lastBackgroundDelivery?.matchedCoordinate,
                )}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-road-matching-background-speed-limit"
            >
                {String(
                    diagnostics.lastBackgroundDelivery?.speedLimitMph ?? '',
                )}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-road-matching-provider"
            >
                {userLocation?.locationProvider ?? ''}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-road-matching-edge-id"
            >
                {roadMatch?.edgeId ?? ''}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-road-matching-raw-coordinate"
            >
                {rawCoordinateKey}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-road-matching-coordinate"
            >
                {snappedCoordinateKey}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-road-matching-speed-limit"
            >
                {String(roadMatch?.speedLimit?.speedLimitMph ?? '')}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-road-graph-load-count"
            >
                {String(diagnostics.roadGraphLoadCount)}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-road-look-ahead-edge-ids"
            >
                {lookAheadEdgeIds}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-proof"
            >
                {String(nativePuckProof)}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-proof-source"
            >
                {nativePuckState?.proofSource ?? ''}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-3d-puck-proof"
            >
                {String(native3DPuckProof)}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-kind"
            >
                {nativePuckState?.puckKind ?? ''}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-model-uri"
            >
                {nativePuckState?.modelUri ?? ''}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-model-scale"
            >
                {nativePuckState?.modelScale?.join(',') ?? ''}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-model-rotation"
            >
                {nativePuckState?.modelRotation?.join(',') ?? ''}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-scale-mode"
            >
                {nativePuckState?.modelScaleMode ?? ''}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-emissive-strength"
            >
                {String(nativePuckState?.modelEmissiveStrength ?? '')}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-cast-shadows"
            >
                {formatProofValue(nativePuckState?.modelCastShadows)}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-receive-shadows"
            >
                {formatProofValue(nativePuckState?.modelReceiveShadows)}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-location-enabled"
            >
                {formatProofValue(nativePuckState?.locationEnabled)}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-bearing"
            >
                {nativePuckState?.puckBearing ?? ''}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-bearing-enabled"
            >
                {formatProofValue(nativePuckState?.puckBearingEnabled)}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-model-layer"
            >
                {formatProofValue(nativePuckState?.modelLayerExists)}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-model-source"
            >
                {formatProofValue(nativePuckState?.modelSourceExists)}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-indicator-layer"
            >
                {formatProofValue(nativePuckState?.indicatorLayerExists)}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-rendered-at-snapped"
            >
                {formatProofValue(nativePuckState?.renderedAtSnappedCoordinate)}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-model-byte-length"
            >
                {String(nativePuckState?.modelAssetByteLength ?? '')}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-model-sha256"
            >
                {nativePuckState?.modelAssetSha256 ?? ''}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-provider-coordinate"
            >
                {formatCoordinatePair(nativePuckState?.providerCoordinate)}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-provider-at-snapped"
            >
                {formatProofValue(nativePuckState?.providerAtSnappedCoordinate)}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-provider-at-raw"
            >
                {formatProofValue(nativePuckState?.providerAtRawCoordinate)}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-indicator-coordinate"
            >
                {formatCoordinatePair(nativePuckState?.indicatorCoordinate)}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-indicator-at-snapped"
            >
                {formatProofValue(
                    nativePuckState?.indicatorAtSnappedCoordinate,
                )}
            </Text>
            <Text
                className="text-[8px] leading-[9px] text-white"
                testID="e2e-native-puck-indicator-at-raw"
            >
                {formatProofValue(nativePuckState?.indicatorAtRawCoordinate)}
            </Text>
        </View>
    );
}
