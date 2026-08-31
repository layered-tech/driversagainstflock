function parseCoordinate(value) {
    const match = String(value ?? '')
        .trim()
        .match(
            /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/,
        );

    if (!match) {
        return null;
    }

    const latitude = Number(match[1]);
    const longitude = Number(match[2]);

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        return null;
    }

    return { latitude, longitude };
}

function parseCoordinateQuery(value) {
    const match = String(value ?? '')
        .trim()
        .match(/^([^()]+?)(?:\s*\(([^()]*)\))?$/);
    const coordinate = parseCoordinate(match?.[1]);

    if (!coordinate) {
        return null;
    }

    return {
        coordinate,
        label: String(match?.[2] ?? '').trim(),
    };
}

function coordinateIsDestination(coordinate) {
    return Boolean(
        coordinate &&
            (coordinate.latitude !== 0 || coordinate.longitude !== 0),
    );
}

function makeDestinationWaypoint(coordinate, label) {
    const coordinateLabel = `${coordinate.latitude}, ${coordinate.longitude}`;
    const destinationLabel = label || coordinateLabel;

    return {
        id: `android-geo:${coordinate.latitude},${coordinate.longitude}`,
        inputValue: destinationLabel,
        kind: 'place',
        label: destinationLabel,
        location: coordinate,
        subtitle: label ? coordinateLabel : '',
    };
}

export function parseAndroidGeoIntent(value) {
    if (typeof value !== 'string' || !value.toLowerCase().startsWith('geo:')) {
        return null;
    }

    let url;

    try {
        url = new URL(value);
    } catch {
        return null;
    }

    if (url.protocol.toLowerCase() !== 'geo:' || url.hash) {
        return null;
    }

    const queryValues = url.searchParams.getAll('q');
    const intentValues = url.searchParams.getAll('intent');

    if (queryValues.length > 1 || intentValues.length > 1) {
        return null;
    }

    const intent = String(intentValues[0] ?? '').trim().toLowerCase();

    if (intent && intent !== 'navigation' && intent !== 'directions') {
        return null;
    }

    const query = String(queryValues[0] ?? '').trim();
    const coordinatePath = `${url.host}${url.pathname}`
        .replace(/^\/+|\/+$/g, '')
        .split(';', 1)[0];
    const pathCoordinate = parseCoordinate(coordinatePath);
    const coordinateQuery = parseCoordinateQuery(query);
    const destinationCoordinate = coordinateIsDestination(pathCoordinate)
        ? pathCoordinate
        : coordinateIsDestination(coordinateQuery?.coordinate)
          ? coordinateQuery.coordinate
          : null;

    if (destinationCoordinate) {
        const destinationLabel = coordinateQuery
            ? coordinateQuery.label
            : query;

        return {
            destinationQuery: '',
            destinationWaypoint: makeDestinationWaypoint(
                destinationCoordinate,
                destinationLabel,
            ),
        };
    }

    if (!query) {
        return null;
    }

    return {
        destinationQuery: query,
        destinationWaypoint: null,
    };
}
