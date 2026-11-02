import { getManeuverKind } from './map/maneuver-kind.js';
import { automotiveManeuverImages } from './auto-play-maneuver-images.generated.js';
import { getAutoPlayRoundaboutExitImage } from './auto-play-roundabout-exit-images.js';

export function getAutoPlayManeuverImage(maneuver) {
    const kind = getManeuverKind(maneuver);
    return (
        (kind === 'roundabout'
            ? getAutoPlayRoundaboutExitImage(maneuver.exit_number)
            : null) ??
        automotiveManeuverImages[kind] ??
        automotiveManeuverImages.straight
    );
}
