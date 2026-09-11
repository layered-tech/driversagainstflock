import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    buildRouteExportText,
    ROUTE_EXPORT_FORMAT_GPX,
    ROUTE_EXPORT_FORMAT_KML,
} from '../route-export.js';

const route = {
    destination: { label: 'Home & <Work>' },
    routes: {
        ideal: {
            coordinates: [
                [-97.7431, 30.2672],
                [-97.75, 30.28],
            ],
            routeKey: 'ideal',
        },
    },
    selectedRouteKey: 'ideal',
};

describe('route exports', () => {
    test('builds a GPX track from the selected route geometry', () => {
        const gpx = buildRouteExportText(route, ROUTE_EXPORT_FORMAT_GPX);

        assert.match(gpx, /<name>Home &amp; &lt;Work&gt;<\/name>/);
        assert.match(gpx, /<trkpt lat="30\.2672" lon="-97\.7431" \/>/);
        assert.match(gpx, /<trkpt lat="30\.28" lon="-97\.75" \/>/);
    });

    test('builds KML coordinates in longitude-latitude order', () => {
        const kml = buildRouteExportText(route, ROUTE_EXPORT_FORMAT_KML);

        assert.match(kml, /-97\.7431,30\.2672,0/);
        assert.match(kml, /-97\.75,30\.28,0/);
        assert.match(kml, /<name>Home &amp; &lt;Work&gt;<\/name>/);
    });

    test('does not produce an export without a complete route line', () => {
        assert.equal(
            buildRouteExportText(
                { coordinates: [[-97.7431, 30.2672]] },
                ROUTE_EXPORT_FORMAT_GPX,
            ),
            '',
        );
    });
});
