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

    // Older patched Auto Play builds emitted shouldStartNavigation as a
    // boolean. A text-only true value is ambiguous because Android Auto also
    // used it for generic geo queries, so keep those requests results-only.
    if (requestType === true) {
        return hasDestinationCoordinates ? 'navigation' : 'search';
    }

    if (requestType === false || hasDestinationCoordinates) {
        return 'directions';
    }

    return 'search';
}
