#!/usr/bin/env bash
set -Eeuo pipefail

operations_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
prepare="${operations_directory}/bin/prepare-global-rebuild.sh"
restore="${operations_directory}/bin/restore-phase7-runtime-state.sh"

for preserved_marker in \
    phase7-current-bootstrap.complete \
    phase7-history-bootstrap.complete \
    phase7-validation.complete \
    phase7-backup.complete \
    phase7-history-bootstrap-source-removed.complete; do
    grep --fixed-strings --quiet "${preserved_marker}" "${prepare}" \
        || { echo "Rebuild does not preserve ${preserved_marker}" >&2; exit 1; }
done

[[ "$(grep --fixed-strings --count 'phase7-current-replication.state' "${prepare}" || true)" == 0 ]] \
    || { echo 'Rebuild preserves an unsafe live current cursor' >&2; exit 1; }
[[ "$(grep --fixed-strings --count 'phase7-history-replication.state' "${prepare}" || true)" == 0 ]] \
    || { echo 'Rebuild preserves an unsafe live history cursor' >&2; exit 1; }

grep --fixed-strings --quiet 'restore_runtime_lock_ownership()' "${prepare}" \
    || { echo 'Rebuild does not restore runtime lock ownership' >&2; exit 1; }
grep --fixed-strings --quiet 'trap restore_runtime_lock_ownership EXIT' "${prepare}" \
    || { echo 'Rebuild lock ownership is not restored on every exit' >&2; exit 1; }
grep --fixed-strings --quiet 'chown osm_ingest:osm_ingest' "${prepare}" \
    || { echo 'Rebuild locks are not returned to osm_ingest' >&2; exit 1; }

lock_positions=(
    "$(grep --fixed-strings --line-number '/run/daf-osm/backup.lock' "${restore}" | cut -d: -f1)"
    "$(grep --fixed-strings --line-number '/run/daf-osm/global.lock' "${restore}" | cut -d: -f1)"
    "$(grep --fixed-strings --line-number '/run/daf-osm/global-current.lock' "${restore}" | cut -d: -f1)"
    "$(grep --fixed-strings --line-number '/run/daf-osm/global-history.lock' "${restore}" | cut -d: -f1)"
)
for position in "${lock_positions[@]}"; do
    [[ "${position}" =~ ^[0-9]+$ ]] || { echo 'Rollback lock contract is missing' >&2; exit 1; }
done
(( lock_positions[0] < lock_positions[1] \
    && lock_positions[1] < lock_positions[2] \
    && lock_positions[2] < lock_positions[3] )) \
    || { echo 'Rollback lock order is unsafe' >&2; exit 1; }

for state_key in \
    current_applied_sequence \
    current_source_timestamp \
    history_applied_sequence \
    history_source_timestamp; do
    grep --fixed-strings --quiet "${state_key}" "${restore}" \
        || { echo "Rollback does not reconstruct ${state_key}" >&2; exit 1; }
done

grep --fixed-strings --quiet 'current-replication.state' "${restore}" \
    || { echo 'Rollback does not write the current state file' >&2; exit 1; }
grep --fixed-strings --quiet 'history-replication.state' "${restore}" \
    || { echo 'Rollback does not write the history state file' >&2; exit 1; }
grep --fixed-strings --quiet 'global-stack.complete' "${restore}" \
    || { echo 'Rollback leaves the global activation marker in place' >&2; exit 1; }

echo 'Phase 7 rollback marker and cursor reconstruction invariant passed'
