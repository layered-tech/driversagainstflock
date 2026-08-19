const NATIVE_PUCK_COORDINATE_TOLERANCE_DEGREES = 0.000001;
const NATIVE_PUCK_HEADING_TOLERANCE_DEGREES = 0.5;
const LOCATION_PUCK_MODEL_ASSET_BYTE_LENGTH = 21_636;
const LOCATION_PUCK_MODEL_ASSET_SHA256 =
    'ab6a662ad8d0696f4a763ce364a1f73c0d4c5a56361baa4ab57644e85381fccc';

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

export function shortestSignedHeadingCorrection(
    renderedBearing,
    matchedHeading,
) {
    const normalizedRenderedBearing =
        ((Number(renderedBearing) % 360) + 360) % 360;
    const normalizedMatchedHeading =
        ((Number(matchedHeading) % 360) + 360) % 360;

    return (
        ((normalizedMatchedHeading - normalizedRenderedBearing + 540) % 360) -
        180
    );
}

function headingsAreWithinTolerance(firstHeading, secondHeading) {
    return (
        Number.isFinite(Number(firstHeading)) &&
        Number.isFinite(Number(secondHeading)) &&
        Math.abs(
            shortestSignedHeadingCorrection(firstHeading, secondHeading),
        ) <= NATIVE_PUCK_HEADING_TOLERANCE_DEGREES
    );
}

export function nativePuckStateProvesHeadingLocked(puckState) {
    const expectedCorrection = shortestSignedHeadingCorrection(
        puckState?.renderedBearing,
        puckState?.providerHeading,
    );

    return (
        puckState?.puckKind === '3d' &&
        puckState?.providerOwnedByApp === true &&
        puckState?.headingCorrectionObserverActive === true &&
        Number.isFinite(Number(puckState?.renderedBearing)) &&
        Number.isFinite(Number(puckState?.providerHeading)) &&
        Number.isFinite(Number(puckState?.appliedHeadingCorrection)) &&
        Number.isFinite(Number(puckState?.effectiveModelHeading)) &&
        Math.abs(
            Number(puckState.appliedHeadingCorrection) - expectedCorrection,
        ) <= NATIVE_PUCK_HEADING_TOLERANCE_DEGREES &&
        headingsAreWithinTolerance(
            puckState.effectiveModelHeading,
            puckState.providerHeading,
        ) &&
        (!puckState?.cameraFollowingPuck ||
            headingsAreWithinTolerance(
                puckState.cameraBearing,
                puckState.renderedBearing,
            ))
    );
}

export function nativePuckStateProvesHeadingTurn(puckState) {
    return (
        nativePuckStateProvesHeadingLocked(puckState) &&
        puckState?.headingCorrectionEverNonZero === true &&
        Number(puckState?.maximumAbsoluteHeadingCorrection) >
            NATIVE_PUCK_HEADING_TOLERANCE_DEGREES &&
        headingsAreWithinTolerance(
            puckState?.cameraBearing,
            puckState?.providerHeading,
        )
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
        puckState?.providerOwnedByApp === true &&
        puckState?.providerAtSnappedCoordinate === true &&
        puckState?.providerAtRawCoordinate === false &&
        puckState?.renderedAtSnappedCoordinate === true
    );
}

export function nativePuckStateProvesRendered3D(puckState) {
    const modelRotation = puckState?.modelRotation;
    const modelUri = String(puckState?.modelUri ?? '');

    return (
        puckState?.puckKind === '3d' &&
        modelUri.endsWith('navigation_puck.glb') &&
        puckState?.modelScaleIsExpression === true &&
        Array.isArray(modelRotation) &&
        modelRotation.length === 3 &&
        modelRotation.every((value) => Number(value) === 0) &&
        puckState?.modelCastShadows === false &&
        puckState?.modelReceiveShadows === false &&
        puckState?.modelScaleMode === 'map' &&
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
