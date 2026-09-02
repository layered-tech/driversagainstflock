#!/usr/bin/env bash

set -euo pipefail

readonly OPERATIONS_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while IFS= read -r operation_script; do
    bash -n "${operation_script}"
done < <(find "${OPERATIONS_DIRECTORY}" -type f -name '*.sh' ! -path '*/test.sh' -print | sort)

python3 -m json.tool "${OPERATIONS_DIRECTORY}/cloudwatch-agent.json" >/dev/null
python3 "${OPERATIONS_DIRECTORY}/tests/iam-policy-invariant.py"
bash "${OPERATIONS_DIRECTORY}/tests/consolidation-phase1-invariant.sh"
bash "${OPERATIONS_DIRECTORY}/tests/dashboard-period-invariant.sh"
bash "${OPERATIONS_DIRECTORY}/tests/local-reader-tunnel-invariant.sh"
bash "${OPERATIONS_DIRECTORY}/tests/local-tunnel-invariant.sh"
bash "${OPERATIONS_DIRECTORY}/tests/phase7-rollback-invariant.sh"
bash "${OPERATIONS_DIRECTORY}/tests/shared-feed-invariant.sh"

echo "osm-operations-tests: PASS"
