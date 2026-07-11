local alpr_nodes = osm2pgsql.define_table({
    name = 'osm2pgsql_alpr_nodes',
    ids = { type = 'node', id_column = 'node_id' },
    columns = {
        { column = 'latitude', type = 'double', not_null = true },
        { column = 'longitude', type = 'double', not_null = true },
        { column = 'geom', type = 'point', projection = 4326, not_null = true },
        { column = 'tags', type = 'jsonb', not_null = true },
        { column = 'surveillance_type', type = 'text' },
        { column = 'direction', type = 'text' },
        { column = 'camera_direction', type = 'text' },
        { column = 'osm_updated_at', type = 'timestamptz' },
        { column = 'osm_version', type = 'int4' },
        { column = 'osm_changeset_id', type = 'int8' },
        { column = 'osm_user', type = 'text' },
        { column = 'osm_uid', type = 'int8' },
    },
})

local function osm_timestamp(timestamp)
    if timestamp == nil then
        return nil
    end

    return os.date('!%Y-%m-%dT%H:%M:%SZ', timestamp)
end

function osm2pgsql.process_node(object)
    if object.tags['surveillance:type'] ~= 'ALPR' then
        return
    end

    local geom = object:as_point()
    local longitude, latitude = geom:get_bbox()

    alpr_nodes:insert({
        latitude = latitude,
        longitude = longitude,
        geom = geom,
        tags = object.tags,
        surveillance_type = object.tags['surveillance:type'],
        direction = object.tags.direction,
        camera_direction = object.tags['camera:direction'],
        osm_updated_at = osm_timestamp(object.timestamp),
        osm_version = object.version,
        osm_changeset_id = object.changeset,
        osm_user = object.user,
        osm_uid = object.uid,
    })
end
