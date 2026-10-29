import {
    makeScorecardCameraConeRing,
    parseCameraDirectionRanges,
} from '../scorecard/exposure-detection.js';

export function areaCameraCones(changes) {
    return {
        type: 'FeatureCollection',
        features: changes.flatMap((change) => {
            const coordinate = [change.longitude, change.latitude];
            if (!coordinate.every(Number.isFinite)) return [];
            return parseCameraDirectionRanges(change.direction).map(
                (range, index) => ({
                    type: 'Feature',
                    id: `${change.id}-${index}`,
                    properties: { kind: change.kind },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [
                            makeScorecardCameraConeRing(coordinate, range),
                        ],
                    },
                }),
            );
        }),
    };
}
