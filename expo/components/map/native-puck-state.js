const NATIVE_PUCK_COORDINATE_TOLERANCE_DEGREES = 0.000001;
const LOCATION_PUCK_MODEL_ASSET_BYTE_LENGTH = 21_636;
const LOCATION_PUCK_MODEL_ASSET_SHA256 =
    'ab6a662ad8d0696f4a763ce364a1f73c0d4c5a56361baa4ab57644e85381fccc';
const LOCATION_PUCK_SCALES = new Set([62.5, 75]);

export function nativePuckCoordinatesMatch(firstCoordinate, secondCoordinate) {
    return (
        Array.isArray(firstCoordinate) &&
        Array.isArray(secondCoordinate) &&
        Math.abs(firstCoordinate[0] - secondCoordinate[0]) <=
            NATIVE_PUCK_COORDINATE_TOLERANCE_DEGREES &&
        Math.abs(firstCoordinate[1] - secondCoordinate[1]) <=
            NATIVE_PUCK_COORDINATE_TOLERANCE_DEGREES
    );
}

export function nativePuckStateProvesSnapping(puckState) {
    if (
        puckState?.proofSource === 'rendered-query' ||
        puckState?.proofSource === 'rendered-query-3d'
    ) {
        return puckState.renderedAtSnappedCoordinate === true;
    }

    return (
        puckState?.proofSource === 'native-3d-puck' &&
        puckState?.providerAtSnappedCoordinate === true &&
        puckState?.providerAtRawCoordinate === false &&
        puckState?.indicatorAtSnappedCoordinate === true &&
        puckState?.indicatorAtRawCoordinate === false
    );
}

export function nativePuckStateProvesRendered3D(puckState) {
    const modelScale = puckState?.modelScale;
    const modelRotation = puckState?.modelRotation;
    const resolvedScale = Number(modelScale?.[0]);
    const modelUri = String(puckState?.modelUri ?? '');

    return (
        puckState?.puckKind === '3d' &&
        modelUri.endsWith('navigation_puck.glb') &&
        Array.isArray(modelScale) &&
        modelScale.length === 3 &&
        LOCATION_PUCK_SCALES.has(resolvedScale) &&
        modelScale.every((value) => Number(value) === resolvedScale) &&
        Array.isArray(modelRotation) &&
        modelRotation.length === 3 &&
        modelRotation.every((value) => Number(value) === 0) &&
        puckState?.modelCastShadows === false &&
        puckState?.modelReceiveShadows === false &&
        puckState?.modelScaleMode === 'viewport' &&
        Number(puckState?.modelEmissiveStrength) === 1 &&
        puckState?.locationEnabled === true &&
        puckState?.puckBearingEnabled === true &&
        puckState?.puckBearing === 'heading' &&
        puckState?.modelLayerExists === true &&
        puckState?.modelSourceExists === true &&
        puckState?.indicatorLayerExists === false &&
        puckState?.renderedAtSnappedCoordinate === true &&
        Number(puckState?.modelAssetByteLength) ===
            LOCATION_PUCK_MODEL_ASSET_BYTE_LENGTH &&
        puckState?.modelAssetSha256 === LOCATION_PUCK_MODEL_ASSET_SHA256
    );
}

export function nativePuckStateProves3DSnapping(puckState) {
    return (
        nativePuckStateProvesSnapping(puckState) &&
        nativePuckStateProvesRendered3D(puckState)
    );
}
