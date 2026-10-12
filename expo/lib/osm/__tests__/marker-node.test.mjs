import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMarkerOsmNode } from '../marker-node.js';

test('map inventory supplies the OSM id, version, full tags and location for editing', () => {
    const marker = {
        location: [-97, 30],
        properties: {
            osm_id: 123,
            osm_version: 4,
            osm_nodes: [
                {
                    id: 7,
                    node_id: 123,
                    tags: { manufacturer: 'Axon', note: 'Preserve' },
                },
            ],
        },
    };
    assert.deepEqual(getMarkerOsmNode(marker), {
        id: 123,
        node_id: 123,
        version: 4,
        longitude: -97,
        latitude: 30,
        tags: { manufacturer: 'Axon', note: 'Preserve' },
    });
    assert.equal(
        getMarkerOsmNode({
            ...marker,
            properties: { ...marker.properties, osm_version: undefined },
        }),
        null,
    );
    assert.equal(getMarkerOsmNode(null), null);
    assert.equal(
        getMarkerOsmNode({
            ...marker,
            properties: { ...marker.properties, osm_id: 'node/123' },
        }).id,
        123,
    );
});
