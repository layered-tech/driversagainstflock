import { getStateCodeForCoordinate } from './local-state-geometry';
import stateBoundaries from './us-state-boundaries.json';

/**
 * Census TIGERweb States 20M, January 1, 2024 vintage. Bundled at build time so
 * resolving a trip's starting state never creates a reverse-geocoding request.
 */
export function getLocalStartingStateCode(coordinate) {
    return getStateCodeForCoordinate(coordinate, stateBoundaries);
}
