# Changeset stream Phase 0 baseline

Observed on 2026-09-06 between 04:20 and 04:29 UTC. This phase was read-only;
it made no production infrastructure, service, or database changes.

## AWS and Terraform

- Caller: `arn:aws:iam::326364278889:user/daf-route-operator`
- Account: `326364278889`
- Region: `us-east-1`
- OSM host: `i-096fe74bac4f594b3`, `r7g.large`, running in `us-east-1a`
- A lock-free refresh plan completed with: `No changes. Your infrastructure
  matches the configuration.`
- The plan emitted existing provider warnings for the deprecated EC2
  `network_interface` argument and base64-encoded `user_data`.
- A prefix-only `cloudwatch:DescribeAlarms` call was denied because it was
  evaluated against `alarm:*`. Reading all 18 alarms by their exact,
  policy-scoped names succeeded. No IAM permission was broadened.

All 18 configured infrastructure alarms were `OK`:

- Shared-host status, CPU, and memory
- PostgreSQL availability, backup freshness, and backup failures
- OSM data-volume usage
- Shared-feed freshness, failures, and retained spool
- Current-consumer freshness, failures, and cursor divergence
- History-consumer freshness, failures, and cursor divergence
- Publication parity
- Routing graph-build scheduler failures

## Capacity and health

- Canonical volume: `vol-0f28cb6d0f7ed35d9`, 256 GiB gp3, 3,000 IOPS,
  125 MiB/s, attached and in use
- Mounted filesystem: 274,743,689,216 bytes total; 2,825,641,984 bytes used;
  271,918,047,232 bytes free; 1.0285 percent used by exact byte ratio
- Memory: 16,433,766,400 bytes total; 1,671,999,488 bytes used;
  9,564,241,920 bytes available at the host observation
- Prior 24-hour peak hourly CPU average: 8.4164 percent
- Prior 24-hour highest individual CPU sample: 89.4667 percent
- Prior 24-hour peak hourly memory average: 10.1777 percent
- Prior 24-hour highest memory sample: 10.6294 percent
- Prior 24-hour maximum shared-feed lag: 160 seconds
- Prior 24-hour maximum current-consumer lag: 160 seconds
- Prior 24-hour maximum history-consumer lag: 166 seconds
- Direct database observation showed all three source lags at 46 seconds
- Latest verified backup object: 47,978,348 bytes, last modified
  2026-09-05T04:29:12Z
- Backup age at the database observation: 86,265 seconds

## Publisher and pre-install absence checks

Aggregate database and host checks confirmed:

- No `osm_history` or `osm_pipeline` changeset parent, comment, buffer, or
  staging relations exist.
- No `changeset_*` pipeline state keys exist.
- No changeset markers, locks, or systemd units exist.
- `osm_publisher` has SELECT access without mutation privileges on every
  current/history table or view.
- `osm_publisher` has no privileges on pipeline tables.
- `osm_publisher` has database CONNECT but neither CREATE nor TEMPORARY.

The successful aggregate-only host/database evidence is recorded by SSM
command `198027b8-9c0e-48c3-be73-ab69bc8e5dee`.

## Discussion dump

- Latest alias: `https://planet.openstreetmap.org/planet/discussions-latest.osm.bz2`
- Immutable release token: `discussions-260831.osm.bz2`
- Preferred resolved mirror:
  `https://osm-planet-us-west-2.s3.dualstack.us-west-2.amazonaws.com/discussions/osm/2026/discussions-260831.osm.bz2`
- Compressed size: 8,945,698,542 bytes (8.3313 GiB)
- MD5: `d0c9439e214ddb815d14ecaa9613987b`
- XML header timestamp: `2026-08-30T23:59:56Z`
- One retained compressed dump consumes 3.2560 percent of the mounted
  filesystem capacity, or 3.2899 percent of the currently free bytes.

Only the first 8 MiB range was downloaded to inspect the XML header. The full
dump was not downloaded during this phase.

## Changeset replication

- Endpoint: `https://planet.openstreetmap.org/replication/changesets/`
- Live logical head: `7172828`
- Live `last_run`: `2026-09-06T04:26:17.680432000Z`
- Logical sequence `7172828` maps to artifact `7172829`, path
  `007/172/829`; its companion state contains logical sequence `7172828` and
  the same timestamp.
- A discussion-bearing sample was found at logical sequence `7172790`, artifact
  `7172791`, path `007/172/791`. Its companion state matched, and aggregate-only
  inspection found 14 changesets, one discussion, and one comment.
- No comment body, username, tag value, or coordinate from the sample was
  retained in this record.

## Aggregate validation candidate

OSM changeset `188599705` is associated with one distinct tracked ALPR node and
is suitable for later aggregate-only validation.
