function getRoadContext(userLocation) {
    return userLocation?.roadMatch?.roadContext ?? null;
}

export function getCurrentRoadText(userLocation) {
    const roadContext = getRoadContext(userLocation);
    const primaryText =
        typeof roadContext?.primaryText === 'string'
            ? roadContext.primaryText.trim()
            : '';

    if (primaryText) {
        return primaryText;
    }

    const component = Array.isArray(roadContext?.components)
        ? roadContext.components.find((item) => {
              return typeof item?.text === 'string' && item.text.trim();
          })
        : null;

    return typeof component?.text === 'string' ? component.text.trim() : '';
}

export function shouldClearRetainedCurrentRoadText(userLocation) {
    const roadMatch = userLocation?.roadMatch;

    return Boolean(
        !userLocation ||
        roadMatch?.isOffRoad === true ||
        roadMatch?.roadContext?.isOffRoad === true,
    );
}

export function getRetainedCurrentRoadText(previousRoadText, userLocation) {
    const currentRoadText = getCurrentRoadText(userLocation);

    if (currentRoadText) {
        return currentRoadText;
    }

    if (shouldClearRetainedCurrentRoadText(userLocation)) {
        return '';
    }

    return typeof previousRoadText === 'string' ? previousRoadText.trim() : '';
}
