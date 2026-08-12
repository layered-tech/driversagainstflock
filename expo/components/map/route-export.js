export const ROUTE_EXPORT_FORMAT_GPX = 'gpx';
export const ROUTE_EXPORT_FORMAT_KML = 'kml';

function escapeXml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function getRouteExportName(route) {
    return (
        route?.destination?.label ??
        route?.destination?.inputValue ??
        'Drivers Against Flock route'
    );
}

function getSelectedRouteOption(route) {
    if (Array.isArray(route?.coordinates)) {
        return route;
    }

    const routeOptions = Object.values(route?.routes ?? {}).filter(
        (routeOption) => Array.isArray(routeOption?.coordinates),
    );
    const selectedRouteKey = route?.selectedRouteKey;

    return (
        routeOptions.find(
            (routeOption) => routeOption.routeKey === selectedRouteKey,
        ) ??
        routeOptions.find((routeOption) => routeOption.routeKey === 'ideal') ??
        routeOptions[0] ??
        null
    );
}

function getRouteExportCoordinates(route) {
    const coordinates = getSelectedRouteOption(route)?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return [];
    }

    return coordinates.filter(
        (coordinate) =>
            Array.isArray(coordinate) &&
            Number.isFinite(coordinate[0]) &&
            Number.isFinite(coordinate[1]),
    );
}

export function buildRouteExportText(route, format) {
    const coordinates = getRouteExportCoordinates(route);

    if (coordinates.length < 2) {
        return '';
    }

    const name = escapeXml(getRouteExportName(route));

    if (format === ROUTE_EXPORT_FORMAT_KML) {
        const kmlCoordinates = coordinates
            .map(([longitude, latitude]) => `${longitude},${latitude},0`)
            .join('\n                    ');

        return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
    <Document>
        <name>${name}</name>
        <Placemark>
            <name>${name}</name>
            <LineString>
                <tessellate>1</tessellate>
                <coordinates>
                    ${kmlCoordinates}
                </coordinates>
            </LineString>
        </Placemark>
    </Document>
</kml>`;
    }

    const trackPoints = coordinates
        .map(
            ([longitude, latitude]) =>
                `            <trkpt lat="${latitude}" lon="${longitude}" />`,
        )
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="Drivers Against Flock" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
    <trk>
        <name>${name}</name>
        <trkseg>
${trackPoints}
        </trkseg>
    </trk>
</gpx>`;
}
