#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=/dev/null
source /opt/daf-osm/bin/common-core.sh

history_pending_sequence=''

write_pipeline_state()
{
    local key="$1"
    local value="$2"

    if [[ "${key}" == history_applied_sequence ]]; then
        history_pending_sequence="${value}"
        return 0
    fi

    if [[ "${key}" == history_source_timestamp && -n "${history_pending_sequence}" ]]; then
        psql_osm \
            --set=history_sequence="${history_pending_sequence}" \
            --set=history_timestamp="${value}" \
            <<'PIPELINE_STATE_SQL'
BEGIN;
INSERT INTO osm_pipeline.state (state_key, state_value)
VALUES
    ('history_applied_sequence', :'history_sequence'),
    ('history_source_timestamp', :'history_timestamp')
ON CONFLICT (state_key) DO UPDATE
SET state_value = EXCLUDED.state_value, updated_at = clock_timestamp();
COMMIT;
PIPELINE_STATE_SQL
        history_pending_sequence=''
        return 0
    fi

    psql_osm \
        --set=state_key="${key}" \
        --set=state_value="${value}" \
        <<'PIPELINE_STATE_SQL'
INSERT INTO osm_pipeline.state (state_key, state_value)
VALUES (:'state_key', :'state_value')
ON CONFLICT (state_key) DO UPDATE
SET state_value = EXCLUDED.state_value, updated_at = clock_timestamp();
PIPELINE_STATE_SQL
}
