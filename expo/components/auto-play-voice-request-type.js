export function resolveAutoPlayVoiceRequestType({
    hasDestinationCoordinates = false,
    requestType,
} = {}) {
    if (requestType === 'navigation') {
        return 'navigation';
    }

    if (requestType === 'directions') {
        return 'directions';
    }

    if (requestType === 'search' || requestType === 'query') {
        return 'search';
    }

    if (hasDestinationCoordinates) {
        return 'directions';
    }

    return 'search';
}
