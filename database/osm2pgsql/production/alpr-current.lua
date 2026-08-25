local alpr_nodes = osm2pgsql.define_node_table('alpr_nodes_stage', {
    { column = 'tags', type = 'jsonb', not_null = true },
    { column = 'surveillance', type = 'text' },
    { column = 'surveillance_type', type = 'text', not_null = true },
    { column = 'direction', type = 'text' },
    { column = 'camera_direction', type = 'text' },
    { column = 'osm_version', type = 'int4', not_null = true },
    { column = 'osm_updated_at', type = 'timestamptz', not_null = true },
    { column = 'changeset_id', type = 'int8', not_null = true },
    { column = 'osm_uid', type = 'int8', not_null = true },
    { column = 'osm_user', type = 'text', not_null = true },
    { column = 'geom', type = 'point', projection = 4326, not_null = true },
}, {
    schema = 'osm_ingest',
    ids = {
        type = 'node',
        id_column = 'node_id',
        create_index = 'primary_key',
    },
})

local function format_timestamp(timestamp)
    if timestamp == nil then
        return nil
    end

    return os.date('!%Y-%m-%dT%H:%M:%SZ', timestamp)
end

function osm2pgsql.process_node(object)
    if object.tags['surveillance:type'] ~= 'ALPR' then
        return
    end

    alpr_nodes:insert({
        tags = object.tags,
        surveillance = object.tags.surveillance,
        surveillance_type = object.tags['surveillance:type'],
        direction = object.tags.direction,
        camera_direction = object.tags['camera:direction'],
        osm_version = object.version,
        osm_updated_at = format_timestamp(object.timestamp),
        changeset_id = object.changeset,
        osm_uid = object.uid,
        osm_user = object.user,
        geom = object:as_point(),
    })
end
