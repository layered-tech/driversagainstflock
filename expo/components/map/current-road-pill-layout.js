/**
 * Road context remains useful while route guidance is active, so only the
 * presence of readable road text controls the pill's visibility.
 */
export function shouldShowCurrentRoadPill({ roadText }) {
    return typeof roadText === 'string' && Boolean(roadText.trim());
}
