#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=common.sh
source /opt/daf-osm/bin/common.sh

readonly UNKNOWN_AGE_SECONDS=315360000

postgresql_up=0
if psql_osm --tuples-only --no-align --command='SELECT 1' >/dev/null 2>&1; then
    postgresql_up=1
fi

if (( postgresql_up == 0 )); then
    put_metric PostgreSQLUp 0 None
    log 'PostgreSQL is unavailable; emitted health metric only'
    exit 0
fi

IFS=$'\t' read -r \
    shared_feed_lag_seconds \
    current_lag_seconds \
    history_lag_seconds \
    backup_age_seconds \
    current_count \
    history_count \
    shared_feed_sequence \
    current_sequence \
    history_sequence \
    last_successful_replication \
    history_bootstrap_complete \
    <<< "$(psql_osm --tuples-only --no-align --field-separator=$'\t' --command="
SELECT
    COALESCE((
        SELECT greatest(0, extract(epoch FROM clock_timestamp() - state_value::timestamptz))::bigint
        FROM osm_pipeline.state
        WHERE state_key = 'shared_feed_source_timestamp'
    ), ${UNKNOWN_AGE_SECONDS}),
    COALESCE((
        SELECT greatest(0, extract(epoch FROM clock_timestamp() - state_value::timestamptz))::bigint
        FROM osm_pipeline.state
        WHERE state_key = 'current_source_timestamp'
    ), ${UNKNOWN_AGE_SECONDS}),
    COALESCE((
        SELECT greatest(0, extract(epoch FROM clock_timestamp() - state_value::timestamptz))::bigint
        FROM osm_pipeline.state
        WHERE state_key = 'history_source_timestamp'
    ), ${UNKNOWN_AGE_SECONDS}),
    COALESCE((
        SELECT greatest(0, extract(epoch FROM clock_timestamp())::bigint - state_value::bigint)
        FROM osm_pipeline.state
        WHERE state_key = 'last_successful_backup_unix_time'
    ), ${UNKNOWN_AGE_SECONDS}),
    (SELECT count(*) FROM osm_current.alpr_nodes),
    (SELECT count(*) FROM osm_history.alpr_node_versions),
    COALESCE((SELECT state_value::bigint FROM osm_pipeline.state WHERE state_key = 'shared_feed_sequence'), 0),
    COALESCE((SELECT state_value::bigint FROM osm_pipeline.state WHERE state_key = 'current_applied_sequence'), 0),
    COALESCE((SELECT state_value::bigint FROM osm_pipeline.state WHERE state_key = 'history_applied_sequence'), 0),
    COALESCE((SELECT state_value::bigint FROM osm_pipeline.state WHERE state_key = 'last_successful_replication_unix_time'), 0),
    COALESCE((SELECT state_value::integer FROM osm_pipeline.state WHERE state_key = 'history_bootstrap_complete'), 0)
")"

stage_relation="$(psql_osm --tuples-only --no-align \
    --command="SELECT to_regclass('osm_ingest.alpr_nodes_stage')")"
stage_count=0
if [[ -n "${stage_relation}" ]]; then
    stage_count="$(psql_osm --tuples-only --no-align \
        --command='SELECT count(*) FROM osm_ingest.alpr_nodes_stage')"
fi
publication_parity_mismatch=$(( stage_count > current_count \
    ? stage_count - current_count \
    : current_count - stage_count ))
current_cursor_divergence=$(( shared_feed_sequence > current_sequence \
    ? shared_feed_sequence - current_sequence \
    : current_sequence - shared_feed_sequence ))
history_cursor_divergence=$(( shared_feed_sequence > history_sequence \
    ? shared_feed_sequence - history_sequence \
    : history_sequence - shared_feed_sequence ))
retained_spool_batches="$(find "${OSM_DATA_PATH}/global-replication-spool" \
    -xdev \
    -mindepth 1 \
    -maxdepth 1 \
    -type d \
    -name 'sequence-[0-9]*' \
    -print \
    | wc --lines)"

for numeric_value in \
    "${shared_feed_lag_seconds}" \
    "${current_lag_seconds}" \
    "${history_lag_seconds}" \
    "${backup_age_seconds}" \
    "${current_count}" \
    "${history_count}" \
    "${shared_feed_sequence}" \
    "${current_sequence}" \
    "${history_sequence}" \
    "${last_successful_replication}" \
    "${history_bootstrap_complete}" \
    "${publication_parity_mismatch}" \
    "${current_cursor_divergence}" \
    "${history_cursor_divergence}" \
    "${retained_spool_batches}"; do
    [[ "${numeric_value}" =~ ^[0-9]+$ ]] || die "Metric query returned non-numeric value: ${numeric_value}"
done

metric_data="$(jq --compact-output --null-input \
    --arg instance_id "${INSTANCE_ID}" \
    --argjson postgresql_up "${postgresql_up}" \
    --argjson shared_feed_lag_seconds "${shared_feed_lag_seconds}" \
    --argjson current_lag_seconds "${current_lag_seconds}" \
    --argjson history_lag_seconds "${history_lag_seconds}" \
    --argjson backup_age_seconds "${backup_age_seconds}" \
    --argjson current_count "${current_count}" \
    --argjson history_count "${history_count}" \
    --argjson shared_feed_sequence "${shared_feed_sequence}" \
    --argjson current_sequence "${current_sequence}" \
    --argjson history_sequence "${history_sequence}" \
    --argjson last_successful_replication "${last_successful_replication}" \
    --argjson history_bootstrap_complete "${history_bootstrap_complete}" \
    --argjson publication_parity_mismatch "${publication_parity_mismatch}" \
    --argjson current_cursor_divergence "${current_cursor_divergence}" \
    --argjson history_cursor_divergence "${history_cursor_divergence}" \
    --argjson retained_spool_batches "${retained_spool_batches}" \
    '
    def metric($name; $value; $unit): {
        MetricName: $name,
        Dimensions: [{Name: "InstanceId", Value: $instance_id}],
        Value: $value,
        Unit: $unit
    };
    [
        metric("PostgreSQLUp"; $postgresql_up; "None"),
        metric("SharedFeedSourceLagSeconds"; $shared_feed_lag_seconds; "Seconds"),
        metric("CurrentConsumerLagSeconds"; $current_lag_seconds; "Seconds"),
        metric("HistoryConsumerLagSeconds"; $history_lag_seconds; "Seconds"),
        metric("BackupAgeSeconds"; $backup_age_seconds; "Seconds"),
        metric("CurrentAlprNodeCount"; $current_count; "Count"),
        metric("HistoryEventCount"; $history_count; "Count"),
        metric("SharedFeedSequence"; $shared_feed_sequence; "Count"),
        metric("CurrentConsumerSequence"; $current_sequence; "Count"),
        metric("HistoryConsumerSequence"; $history_sequence; "Count"),
        metric("LastSuccessfulReplicationUnixTime"; $last_successful_replication; "Seconds"),
        metric("HistoryBootstrapComplete"; $history_bootstrap_complete; "None"),
        metric("PublicationParityMismatch"; $publication_parity_mismatch; "Count"),
        metric("CurrentConsumerCursorDivergence"; $current_cursor_divergence; "Count"),
        metric("HistoryConsumerCursorDivergence"; $history_cursor_divergence; "Count"),
        metric("SharedFeedRetainedBatchCount"; $retained_spool_batches; "Count")
    ]
    ')"

aws cloudwatch put-metric-data \
    --region "${AWS_REGION}" \
    --namespace "${CLOUDWATCH_NAMESPACE}" \
    --metric-data "${metric_data}" \
    >/dev/null

log 'Published OSM pipeline metrics'
