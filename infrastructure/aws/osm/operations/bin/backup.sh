#!/usr/bin/env bash
set -Eeuo pipefail

# The core captures one immutable cursor/count observation before pg_dump,
# then performs the verified S3 upload and local archive cleanup.
# shellcheck source=/dev/null
source /opt/daf-osm/bin/backup-core.sh

[[ "${backup_current_sequence:-}" =~ ^[0-9]+$ ]] \
    || die 'Verified backup pre-dump current sequence is invalid'
[[ "${backup_history_sequence:-}" =~ ^[0-9]+$ ]] \
    || die 'Verified backup pre-dump history sequence is invalid'
[[ "${backup_completed_at:-}" =~ ^[0-9]+$ ]] \
    || die 'Verified backup completion time is invalid'

write_pipeline_state last_successful_backup_current_sequence "${backup_current_sequence}"
write_pipeline_state last_successful_backup_history_sequence "${backup_history_sequence}"

marker_path="${OSM_STATE_PATH}/backup.complete"
marker_partial="${marker_path}.partial"
printf 'current_sequence=%s\nhistory_sequence=%s\ncompleted_at_unix=%s\n' \
    "${backup_current_sequence}" \
    "${backup_history_sequence}" \
    "${backup_completed_at}" \
    > "${marker_partial}"
chmod 0640 "${marker_partial}"
mv --force "${marker_partial}" "${marker_path}"

log "Recorded durable verified-backup marker at pre-dump current sequence ${backup_current_sequence}, history sequence ${backup_history_sequence}"
