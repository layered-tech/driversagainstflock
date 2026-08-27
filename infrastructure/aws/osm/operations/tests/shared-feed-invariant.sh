#!/usr/bin/env bash
set -Eeuo pipefail

operations_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
global_update="${operations_directory}/bin/global-update.sh"
current_update="${operations_directory}/bin/current-update.sh"
history_update="${operations_directory}/bin/history-update.sh"
initializer="${operations_directory}/bin/initialize-global-stack.sh"

[[ "$(grep --fixed-strings --count 'fetch-node-changes.py update' "${global_update}")" == 1 ]] \
    || { echo 'Shared feed must download each batch exactly once' >&2; exit 1; }
grep --fixed-strings --quiet 'global-replication-spool' "${global_update}" \
    || { echo 'Shared feed has no durable spool' >&2; exit 1; }
grep --fixed-strings --quiet 'current_sequence >= replication_sequence && history_sequence >= replication_sequence' "${global_update}" \
    || { echo 'Shared batch cleanup does not wait for both consumers' >&2; exit 1; }
grep --fixed-strings --quiet '/opt/daf-osm/bin/current-update.sh' "${global_update}" \
    || { echo 'Shared feed does not invoke the current consumer' >&2; exit 1; }
grep --fixed-strings --quiet '/opt/daf-osm/bin/history-update.sh' "${global_update}" \
    || { echo 'Shared feed does not invoke the history consumer' >&2; exit 1; }
grep --fixed-strings --quiet 'if (( $# != 2 )); then' "${current_update}" \
    || { echo 'Current consumer does not require one shared batch' >&2; exit 1; }
grep --fixed-strings --quiet 'if (( $# != 2 )); then' "${history_update}" \
    || { echo 'History consumer does not require one shared batch' >&2; exit 1; }
[[ "$(grep --fixed-strings --count 'fetch-node-changes.py update' "${current_update}" || true)" == 0 ]] \
    || { echo 'Current consumer still downloads a second stream' >&2; exit 1; }
[[ "$(grep --fixed-strings --count 'fetch-node-changes.py update' "${history_update}" || true)" == 0 ]] \
    || { echo 'History consumer still downloads a second stream' >&2; exit 1; }
[[ "$(grep --fixed-strings --count 'CurrentConsumerFailures' "${current_update}" || true)" == 0 ]] \
    || { echo 'Current consumer duplicates orchestrator failure metrics' >&2; exit 1; }
[[ "$(grep --fixed-strings --count 'HistoryConsumerFailures' "${history_update}" || true)" == 0 ]] \
    || { echo 'History consumer duplicates orchestrator failure metrics' >&2; exit 1; }
grep --fixed-strings --quiet 'trap - ERR' "${global_update}" \
    || { echo 'Consumer failures still contaminate shared-feed failure metrics' >&2; exit 1; }
grep --fixed-strings --quiet 'Global current and history bootstraps do not share one release cursor' "${initializer}" \
    || { echo 'Shared feed initialization permits mismatched bootstrap cursors' >&2; exit 1; }
grep --fixed-strings --quiet 'Global current and history bootstraps do not share one release timestamp' "${initializer}" \
    || { echo 'Shared feed initialization permits mismatched bootstrap timestamps' >&2; exit 1; }

echo 'Shared global feed retention and dual-consumer invariant passed'
