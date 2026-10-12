/** Reconstruct the editable OSM node from the map inventory, without a request. */
export function getMarkerOsmNode(marker) {
    const properties = marker?.properties ?? {};
    const source = properties.osm_nodes?.[0];
    const id = Number(
        String(properties.osm_id ?? source?.node_id ?? '').replace(
            /^node\//,
            '',
        ),
    );
    const version = Number(properties.osm_version ?? source?.version);
    const coordinate = marker?.location ?? marker?.geometry?.coordinates;
    if (
        !source?.tags ||
        !Number.isInteger(id) ||
        id <= 0 ||
        !Number.isInteger(version) ||
        version <= 0 ||
        !Array.isArray(coordinate)
    ) {
        return null;
    }
    const [longitude, latitude] = coordinate.map(Number);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
        ...source,
        id,
        version,
        latitude,
        longitude,
        tags: { ...source.tags },
    };
}
