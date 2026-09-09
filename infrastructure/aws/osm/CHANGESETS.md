# DAF OSM changeset metadata and discussion stream

This runbook records the design, implementation contract, phased production
rollout, validation requirements, and steady-state refresh procedure for the
independent OSM changeset metadata and discussion stream.

No command in this document is permission to change AWS. Follow every approval
gate below, including the separate approval required for each dump refresh.

## Recorded rollout status

Status recorded on 2026-09-09:

- Phases 0 through 9 are complete.
- The owner explicitly waived Phase 8’s one-hour healthy observation gate.
- The owner explicitly waived Phase 9’s seven-day wait based on accumulated
  production utilization and accepted post-cutoff metadata arrivals as healthy
  ingestion churn after two successful manual backfills.
- The Phase 9 reconciliation is recorded in `README.md`.
- Every future discussion-dump refresh requires separate approval.

The phase sections below preserve the original approval-gated plan language and
record the current rollout position at the phase level.

## Context

The moderation design in `design/Moderation.dc.html` needs complete metadata for every OpenStreetMap changeset associated with a tracked ALPR node lifecycle. That includes the changeset ID, author, timestamps, bbox, tags such as `comment`, `created_by`, and `source`, the affected ALPR nodes, and every discussion comment made available by OSM.

The existing AWS OSM stack records `changeset_id` on current and historical ALPR node versions, but it does not ingest changeset metadata or discussions. Those records come from a separate OSM data stream:

- Weekly discussion-inclusive `discussions-YYMMDD.osm.bz2` dumps.
- Independent `/replication/changesets/` minute diffs.

This rollout adds a third replication stream with its own bootstrap, cursor, timer, locks, staging tables, retained feed buffer, validation, backup coverage, metrics, alarms, activation gate, and refresh procedure. It never consumes or modifies the node replication spool.

The published dataset remains limited to changesets connected to tracked ALPR node lifecycles. The pipeline buffer retains every worldwide changeset and available discussion received after the active dump snapshot so metadata can be promoted if a node becomes tracked later.

No calls to `api.openstreetmap.org` are allowed.

## Confirmed source behavior

- OSM publishes separate metadata-only and discussion-inclusive weekly dumps. This rollout uses [`discussions-latest.osm.bz2`](https://planet.openstreetmap.org/planet/), not `changesets-latest.osm.bz2`.
- The current immutable discussion release pattern is:
  - `https://planet.openstreetmap.org/planet/YYYY/discussions-YYMMDD.osm.bz2`
  - `https://osm-planet-us-west-2.s3.dualstack.us-west-2.amazonaws.com/discussions/osm/YYYY/discussions-YYMMDD.osm.bz2`
- The current discussion dump is approximately 8.95 GB compressed. Phase 0 must record the actual release, size, checksum, and XML header timestamp used for deployment.
- Changeset replication state files use YAML-like `last_run` and `sequence` fields rather than osmosis state syntax.
- Logical replication sequence numbers are offset from artifact filenames. For example, [`007/172/783.state.txt`](https://planet.openstreetmap.org/replication/changesets/007/172/783.state.txt) contains logical sequence `7172782`.
- Therefore, logical sequence `S` is stored in artifact path `S + 1`.
- Minute diffs contain complete changeset snapshots and re-emit a changeset when it closes or its discussion changes.
- Each available discussion comment contains a comment ID, timestamp, full text, and nullable author UID/name. Visibility may be present depending on the source.
- Discussion text can be multiline Unicode and must not be written to logs, metrics, validation output, or rollout evidence.
- The discussion dump and minute diffs are XML. OPL conversion drops nested discussion elements, so changesets must be parsed directly from XML.

## Design

### Independent stream

The changeset stream owns:

- `global-changeset-replication.state`
- `global-changeset-bootstrap.complete`
- `global-changeset.complete`
- `global-changeset.lock`
- `global-changeset-backfill.lock`
- Its own download work directories and retained discussion dump
- Its own update, backfill, bootstrap, refresh, and activation services
- Its own cursor, failure metrics, and CloudWatch alarms

It does not use `global-replication.state`, `global-update.sh`, or the node replication spool.

### Published and buffered scope

The tracked changeset set is:

```sql
SELECT changeset_id
FROM osm_history.alpr_node_versions
WHERE changeset_id IS NOT NULL

UNION

SELECT changeset_id
FROM osm_current.alpr_nodes
WHERE changeset_id IS NOT NULL
```

`osm_history.changesets` and `osm_history.changeset_comments` contain only this tracked set.

`osm_pipeline.feed_changesets` and `osm_pipeline.feed_changeset_comments` contain every changeset and available discussion observed in the minute feed since the active discussion-dump snapshot.

When a node becomes tracked after its changeset diff has already passed, the retained feed tables provide the metadata and complete discussion for promotion into `osm_history`.

## Database schema

All objects are created under `SET ROLE osm_owner`.

### `osm_history.changesets`

Columns:

- `id bigint PRIMARY KEY` — external OSM changeset ID
- `created_at timestamptz NOT NULL`
- `closed_at timestamptz`
- `open boolean NOT NULL`
- `num_changes integer`
- `comments_count integer`
- `osm_uid bigint`
- `osm_user text`
- `min_lon`, `min_lat`, `max_lon`, `max_lat double precision`
- `bbox geometry(Geometry, 4326)`
- `tags jsonb NOT NULL DEFAULT '{}'`
- `source text NOT NULL CHECK (source IN ('discussion_dump', 'minute_diff'))`
- `replication_sequence bigint`
- `observed_at timestamptz NOT NULL`
- `ingested_at timestamptz NOT NULL DEFAULT clock_timestamp()`
- `updated_at timestamptz NOT NULL DEFAULT clock_timestamp()`

Constraints:

- IDs and non-null numeric counts cannot be negative.
- Tags must be a JSON object.
- Open changesets have no `closed_at`.
- Closed changesets have a `closed_at`.
- Bbox coordinates must be either all null or all present.
- Present bbox coordinates must be ordered and within valid longitude/latitude ranges.
- `bbox` is null when coordinates are absent.
- Present bbox geometry is created with `ST_Envelope(ST_MakeEnvelope(..., 4326))`, allowing point and line envelopes for degenerate bounds.

Indexes:

- `osm_uid`
- `closed_at`
- `observed_at`
- Partial index supporting stale-open checks
- Existing node tables gain indexes on `changeset_id`

### `osm_history.changeset_comments`

Columns:

- `changeset_id bigint NOT NULL`
- `comment_id bigint NOT NULL`
- `ordinal integer NOT NULL`
- `commented_at timestamptz NOT NULL`
- `osm_uid bigint`
- `osm_user text`
- `visible boolean`
- `body text NOT NULL`
- `replication_sequence bigint`
- `observed_at timestamptz NOT NULL`
- `ingested_at timestamptz NOT NULL DEFAULT clock_timestamp()`
- `updated_at timestamptz NOT NULL DEFAULT clock_timestamp()`

Contracts:

- Primary key: `(changeset_id, comment_id)`
- Foreign key to `osm_history.changesets(id)` with cascading deletion
- Non-negative ordinal
- Indexes on `(changeset_id, ordinal)`, `osm_uid`, and `commented_at`

Author fields remain nullable because OSM may withhold contributor identity. The stored body is the exact text made available by OSM.

### Pipeline buffer tables

`osm_pipeline.feed_changesets` and `osm_pipeline.feed_changeset_comments` mirror the permanent parent/comment structures.

They are ingestion-only and receive no `osm_publisher` privileges.

`feed_changeset_comments` references `feed_changesets` with cascading deletion. Parent `observed_at` is indexed for safe dump-refresh pruning.

### Staging tables

Two UNLOGGED parent stages prevent the minute importer from truncating a long-running dump scan:

- `osm_pipeline.changesets_stage`
- `osm_pipeline.changesets_dump_stage`

Each contains the parent fields plus:

- `ordinal bigint GENERATED ALWAYS AS IDENTITY`
- `discussion jsonb NOT NULL DEFAULT '[]'`

The discussion value is a complete ordered array for that source snapshot. It must be a JSON array.

Staging remains denormalized only to permit one streaming copy operation. Permanent discussion storage is normalized by the SQL loaders.

Last occurrence wins for duplicate changesets:

```sql
DISTINCT ON (id)
ORDER BY id, ordinal DESC
```

### Publisher views

`osm_history.application_changesets` exposes:

- `id AS osm_changeset_id`
- Author, timestamps, bbox, tags, ingestion source, observation metadata
- Raw OSM `num_changes AS osm_num_changes`
- `comments_count`
- Count of discussion rows currently available
- Derived ALPR node counts

`osm_history.application_changeset_comments` exposes:

- `osm_changeset_id`
- `osm_comment_id`
- Comment order, timestamp, author, visibility, and body

Grant `osm_publisher` SELECT on the history tables and both views, with no mutation privileges.

### ALPR node counts

OSM’s `num_changes` counts every changed element in the complete OSM changeset, including unrelated nodes, ways, and relations. It must never be used as the moderation design’s “Nodes touched” count.

The application changeset view derives ALPR counts from `osm_history.alpr_node_versions`, grouping each `(changeset_id, node_id)` once.

For each node within a changeset:

- Deleted: its final version in that changeset is invisible.
- Created: it includes version 1 and its final version is visible.
- Modified: all remaining visible cases.
- Touched: one distinct node regardless of how many versions it received within the changeset.

Expose:

- `alpr_nodes_created`
- `alpr_nodes_modified`
- `alpr_nodes_deleted`
- `alpr_nodes_touched`

These counts cover complete lifecycles of nodes that qualified as ALPR at any point, matching the existing historical-node retention contract.

## XML importer

Create `import-changesets.py` with:

```text
header --input FILE

load
  --input FILE [--input FILE ...]
  --source {discussion_dump,minute_diff}
  --as-of TIMESTAMP
  [--sequence NUMBER]
  [--only-ids FILE]
  [--stop-after-id NUMBER]
  [--dry-run]
```

Behavior:

- Open `.bz2`, `.gz`, and plain XML inputs with Python standard-library readers.
- Use `xml.etree.ElementTree.iterparse` and clear completed elements to keep memory bounded.
- Read the root dump timestamp for `header`.
- Parse the XML `open` attribute directly; do not infer it from OPL.
- Preserve all changeset tags in JSON.
- Parse every available `<discussion>/<comment>` child and its `<text>` body.
- Preserve XML-decoded multiline Unicode text exactly, replacing only embedded NUL with `�` because PostgreSQL text cannot store NUL.
- Treat missing discussion as an empty complete discussion snapshot.
- Treat absent UID, username, visibility, bbox, and close time according to their nullable contracts.
- Load one parent row with its discussion array into the stage selected by `--source`.
- Filter before writing when `--only-ids` is present.
- Stop safely after the requested maximum ID only after confirming dump order through the invariant fixture.
- Print only row counts, discussion counts, and `max_id_seen`; never print tags, usernames, or comment bodies.
- Fail on malformed XML, malformed IDs/timestamps, partial bbox coordinates, invalid discussion structure, or a nonzero copy process.
- In dry-run mode, emit aggregate validation results without connecting to PostgreSQL.

The existing OPL decoder in `import-history.py` remains unchanged and is still a separate follow-up.

## SQL loading

Both loaders take:

```sql
pg_advisory_xact_lock(hashtextextended('daf-osm-changeset-load', 0))
```

### Accepted snapshot rule

Parent upserts are monotonic on `observed_at`.

A parent snapshot is accepted only when:

```text
incoming observed_at >= stored observed_at
```

Only accepted parent snapshots may reconcile comments. A stale dump rescan or replay cannot overwrite parent metadata, delete later comments, or restore an older discussion.

### Comment reconciliation

For every accepted parent snapshot:

1. Expand its staged discussion array.
2. Delete stored comments for that changeset that are absent from the accepted complete snapshot.
3. Upsert all supplied comments.
4. Update comment author, visibility, text, ordinal, sequence, and observation metadata.
5. Keep the operation inside the parent-load transaction.

This mirrors the latest discussion state OSM makes available. It does not indefinitely retain content OSM later removes.

Do not enforce equality between `comments_count` and normalized comment rows because OSM may count comments whose contents or authors are unavailable. Record both values.

### Minute loader

`changesets-load.sql` performs one transaction:

1. Deduplicate minute-stage parents.
2. Upsert accepted parents into `feed_changesets`.
3. Reconcile their `feed_changeset_comments`.
4. Upsert accepted stage parents intersecting the tracked set into `osm_history.changesets`.
5. Reconcile their history comments.
6. Promote any tracked parent absent from history from the retained feed parent table.
7. Promote its complete buffered discussion.
8. Atomically write `changeset_applied_sequence` and `changeset_source_timestamp`.
9. Truncate the minute stage.
10. Commit.

### Dump/backfill loader

`changesets-bootstrap-load.sql`:

1. Takes the same advisory lock.
2. Deduplicates dump-stage parents.
3. Upserts only non-stale tracked parents into history.
4. Reconciles normalized history comments only for accepted snapshots.
5. Truncates the dump stage.
6. Commits.

## Replication fetcher

Create `fetch-changeset-diffs.py`.

### Logical sequence mapping

State files and PostgreSQL store logical sequence `S`.

The corresponding OSM artifact number is:

```text
artifact = S + 1
```

The artifact path is the nine-digit artifact number split into three groups:

```text
AAA/BBB/CCC
```

Both files use that offset path:

```text
AAA/BBB/CCC.state.txt
AAA/BBB/CCC.osm.gz
```

Every downloaded companion state must contain logical sequence `S`. A mismatch is fatal.

### Initialization

```text
initialize
  --server URL
  --start-timestamp TIMESTAMP
  --pending-state FILE
```

Behavior:

1. Read live `state.yaml` and validate head logical sequence and timestamp.
2. Search backward exponentially from the head until the requested timestamp is bracketed.
3. Binary-search logical sequences inside that known-existing bracket.
4. Fetch each candidate from artifact path `S + 1`.
5. Select the largest logical sequence whose `last_run <= start_timestamp`.
6. Write a normalized osmosis-format pending state using the logical sequence and an escaped UTC timestamp.

Do not assume logical sequence zero or artifact one exists.

### Update

```text
update
  --server URL
  --state FILE
  --pending-state FILE
  --output-directory DIRECTORY
  --max-diffs NUMBER
```

Behavior:

1. Read the applied logical sequence from the local state.
2. Read the current logical head from `state.yaml`.
3. Exit 3 only when applied sequence is already at or beyond the head.
4. Download contiguous logical sequences from `applied + 1` through the lesser of the head or `max-diffs` limit.
5. Resolve each logical sequence through artifact path `S + 1`.
6. Validate each companion state’s embedded logical sequence and timestamp.
7. Never skip a missing required artifact at or below the head.
8. Write the terminal logical sequence and `last_run` to the pending state.
9. Leave cursor promotion to the transaction-owning update script.

The fetcher follows redirects and uses only Python standard-library HTTP support.

## Bootstrap

Create:

- `bootstrap-changesets-core.sh`
- `bootstrap-changesets.sh`
- `daf-osm-changeset-bootstrap.service`

The service runs as `osm_ingest`, uses `global-changeset.lock`, has infinite startup timeout, Nice 15, idle I/O priority, and the existing hardening block.

### Initial bootstrap behavior

`bootstrap-changesets-core.sh --mode bootstrap`:

1. Require the existing global current/history bootstrap prerequisites.
2. Exit successfully when the changeset bootstrap marker already exists.
3. Resolve `discussions-latest.osm.bz2` to an immutable approved release URL.
4. Accept only anchored planet or us-west-2 discussion-mirror patterns.
5. Prefer the mirror URL after extracting the immutable release token.
6. Record HTTP metadata once in a resume-safe file.
7. Download and validate the release-specific MD5 sidecar.
8. Resume the approximately 8.95 GB discussion-dump download.
9. Verify the complete dump checksum.
10. Run a small local bzip/XML preflight.
11. Read dump timestamp `T_d` from the XML header.
12. Export all non-null tracked changeset IDs.
13. Stream only those IDs and their full discussions into the dump stage.
14. Load them with `changesets-bootstrap-load.sql`.
15. Assert every tracked changeset whose associated node version has `osm_updated_at <= T_d` exists in history.
16. Validate comment foreign keys and normalized discussion structure.
17. Initialize the independent feed at `T_d - 24 hours`.
18. Record the logical overlap sequence for restore replay.
19. Atomically record:
    - `changeset_applied_sequence`
    - `changeset_source_timestamp`
    - `changeset_dump_md5`
    - `changeset_dump_resolved_url`
    - `changeset_dump_timestamp`
    - `changeset_dump_max_id`
    - `changeset_dump_replay_sequence`
    - `changeset_bootstrap_complete=1`
20. Promote the normalized pending cursor to `global-changeset-replication.state`.
21. Emit bootstrap, parent-count, and discussion-count metrics.

The wrapper writes `global-changeset-bootstrap.complete` through a `.partial`, chmod, and atomic rename.

The versioned discussion dump and checksum remain under `${OSM_DOWNLOAD_PATH}` for daily historical gap closure and future refresh rollback.

## Minute consumer

Create:

- `changeset-update.sh`
- `daf-osm-changeset-update.service`
- `daf-osm-changeset-update.timer`

The timer runs independently every minute. The service runs as `osm_ingest`, uses `global-changeset.lock`, Nice 10, and the shared hardening block.

The script requires:

- `global-changeset-bootstrap.complete`
- `global-changeset.complete`
- `global-changeset-replication.state`

Each run:

1. Fetches at most `CHANGESET_MAX_DIFFS_PER_RUN=240` logical sequences.
2. Exits cleanly when the fetcher returns 3 at the head.
3. Validates the pending logical sequence and timestamp.
4. If PostgreSQL already committed that terminal sequence, promotes the pending file cursor and exits.
5. Imports all downloaded changesets and discussions without an ID filter.
6. Runs `changesets-load.sql`.
7. Promotes the pending state file only after the database transaction commits.
8. Emits:
   - `ChangesetConsumerSequence`
   - `ChangesetCount`
   - `ChangesetDiscussionCommentCount`
   - `ChangesetFeedRetainedCount`
   - `ChangesetFeedDiscussionCommentCount`
9. Emits `ChangesetConsumerFailures` from the orchestrator ERR trap.
10. Deletes the work directory after success or ordinary failure.

A host interruption after database commit but before file promotion is recovered by replay plus the already-committed shortcut.

## Historical gap closer

Create:

- `changeset-backfill.sh`
- `daf-osm-changeset-backfill.service`
- `daf-osm-changeset-backfill.timer`

The timer runs daily at 02:00 UTC. The service uses Nice 15, idle I/O priority, and `global-changeset-backfill.lock`.

It finds tracked changeset IDs that:

- Are missing from `osm_history.changesets`
- Are at or below `changeset_dump_max_id`

It then:

1. Streams only the missing IDs and discussions from the retained discussion dump.
2. Stops after the largest requested ID.
3. Loads through `changesets-bootstrap-load.sql`.
4. Verifies all requested parents were inserted.
5. Exits 0 with an explicit no-op log when nothing is missing.
6. Emits `ChangesetBackfillFailures` through its ERR trap.

Tracked IDs above the dump maximum must be present in the retained feed tables by construction and are promoted by the minute loader.

## Activation

Create:

- `activate-changeset-feed.sh`
- `daf-osm-changeset-activate.service`

The root-only activation service:

1. Requires the bootstrap marker and changeset state file.
2. Writes `global-changeset.complete` atomically with `osm_ingest` ownership and mode 0640.
3. Enables and starts the update and backfill timers.
4. Verifies both timers are enabled and active.
5. Leaves all node replication services unchanged.

Reinstallation enables changeset timers only when `global-changeset.complete` is nonempty. Otherwise it disables them.

## Retained-dump refresh

Create:

- `refresh-changesets.sh`
- `daf-osm-changeset-refresh.service`

Refresh is manual and requires separate approval for every execution.

The service runs as root because it manages timers. It invokes the data work as `osm_ingest`.

### Preconditions

- Bootstrap and activation markers exist.
- Existing dump URL, checksum, timestamp, maximum ID, and replay sequence are valid.
- The new immutable release is newer than the retained release.
- Sufficient free volume space exists for old and new dumps simultaneously.
- No backup or validation run is active.

### Refresh sequence

1. Record which changeset timers were enabled.
2. Disable both changeset timers.
3. Stop the update and backfill services.
4. Acquire `global-changeset.lock`, then `global-changeset-backfill.lock`.
5. Resolve and checksum-pin the new discussion release.
6. Download it alongside the retained release.
7. Verify checksum, XML header timestamp, and monotonic release timestamp.
8. Run `bootstrap-changesets-core.sh --mode refresh`.
9. Export the current tracked set.
10. Import all tracked parents and discussions from the new dump.
11. Load with monotonic parent/comment reconciliation.
12. Assert tracked-parent completeness at the new dump timestamp.
13. Determine and validate the new `T_d - 24 hours` replay sequence.
14. In one database transaction:
    - Delete buffered feed parents only where `observed_at <= T_d`.
    - Cascade deletion to their buffered comments.
    - Preserve every row observed after `T_d`, even when its changeset was created earlier.
    - Update dump URL, checksum, timestamp, maximum ID, and replay-sequence state.
15. Leave the live changeset consumer cursor unchanged.
16. Atomically update the retained-file marker to the new versioned path.
17. Run focused validation.
18. Remove the old dump and checksum only after successful finalization.
19. Restore the timers to their pre-refresh enabled state.

### Refresh failure behavior

- A failure before final database state commit leaves the old dump metadata authoritative.
- The old dump and checksum are never removed on failure.
- Monotonic upserts from a partially completed new scan are safe and may remain.
- The ERR trap restores previously enabled timers.
- A retry reuses verified partial or complete downloads.
- No pruning occurs unless the new dump has passed checksum, import, and completeness checks.

## Global lock order

Every operation acquiring multiple locks uses this order:

1. `backup.lock`
2. Existing regional current/history locks where applicable
3. `global.lock`
4. `global-current.lock`
5. `global-history.lock`
6. `global-changeset.lock`
7. `global-changeset-backfill.lock`

Required users of both changeset locks:

- Runtime installation
- Backup
- Validation
- Global rebuild preparation
- Phase 7 runtime restoration
- Changeset refresh

The update/bootstrap service uses only `global-changeset.lock`. The backfill service uses only `global-changeset-backfill.lock`. The shared database advisory lock serializes their SQL mutations.

## Backup and restoration

Extend the single pre-dump observation in `backup-core.sh` with:

- `changeset_applied_sequence`
- History changeset count
- History discussion-comment count
- Buffered changeset count
- Buffered discussion-comment count

Add to the manifest:

- `changeset_replication_sequence`
- `pre_dump_changeset_count`
- `pre_dump_changeset_comment_count`
- `pre_dump_feed_changeset_count`
- `pre_dump_feed_changeset_comment_count`

The changeset cursor is independent and must not participate in the shared/current/history node-cursor convergence check.

`backup.sh`:

- Acquires both changeset locks after the existing locks.
- Records `last_successful_backup_changeset_sequence`.
- Adds `changeset_sequence=` to `backup.complete`.

The isolated restore proof compares all four parent/comment counts, validates foreign keys and discussion ordering, and confirms the restored independent cursor.

If buffered feed data is ever excluded from backups, restoration must reset the changeset cursor to `changeset_dump_replay_sequence`. That optimization is not part of this rollout.

## Validation

Changeset validation is skipped before the bootstrap marker exists.

After bootstrap, validate:

- History parent count is positive.
- Parent IDs, counts, tags, open/closed state, bbox coordinates, and geometry are valid.
- Comment IDs, ordinals, timestamps, and bodies satisfy schema constraints.
- Every normalized comment has a valid parent.
- Comment ordinal values are unique within a changeset.
- Stored `comments_count` and available normalized count are both reported but are not required to match.
- Every tracked changeset at or before the active dump timestamp exists.
- Changesets open for more than 25 hours are reported.
- Parent and comment views exist and are owned by `osm_owner`.
- `osm_publisher` has SELECT-only access to history parents, comments, and views.
- `osm_publisher` has no access to pipeline buffer tables.
- Database and file changeset cursors match.
- Changeset cursor is not compared with node cursors.
- Both stages are empty after completed operations.
- The retained versioned discussion dump and checksum match recorded state.
- The dump timestamp, maximum ID, and replay sequence exist.
- Derived ALPR created/modified/deleted/touched counts are internally consistent.
- Raw `osm_num_changes` is never used as the derived touched count.

`validate.sh` acquires both changeset locks and adds `changeset_sequence=` to `global-validation.complete`.

## Metrics

Extend the existing metrics query and numeric guards with:

- `ChangesetConsumerLagSeconds`
- `ChangesetConsumerSequence`
- `ChangesetCount`
- `ChangesetDiscussionCommentCount`
- `ChangesetFeedRetainedCount`
- `ChangesetFeedDiscussionCommentCount`
- `ChangesetsMissingMetadata`
- `ChangesetBootstrapComplete`
- `ChangesetDumpAgeSeconds`

No metric or log contains usernames, tags, comment text, or coordinates.

## CloudWatch

Create four alarms after the feed has been healthy for at least one hour:

| Alarm | Metric | Condition | Evaluation | Missing data |
|---|---|---:|---:|---|
| `daf-infrastructure-osm-changeset-consumer-stale` | `ChangesetConsumerLagSeconds` | Maximum > 3600 | 300 seconds × 2 | breaching |
| `daf-infrastructure-osm-changeset-consumer-failure` | `ChangesetConsumerFailures` | Sum > 0 | 300 seconds × 1 | notBreaching |
| `daf-infrastructure-osm-changeset-metadata-missing` | `ChangesetsMissingMetadata` | Minimum > 0 | 3600 seconds × 24 | notBreaching |
| `daf-infrastructure-osm-changeset-backfill-failure` | `ChangesetBackfillFailures` | Sum > 0 | 3600 seconds × 1 | notBreaching |

All alarms use the alerts topic for alarm and OK actions, include `InstanceId`, and use `create_before_destroy`.

Dashboard additions:

- Minute replication:
  - Changeset consumer lag
  - Changeset consumer failures
- Publication and history volume:
  - Published changesets
  - Published discussion comments
  - Changeset consumer sequence
- History, backups, and parity:
  - Missing changeset metadata
  - Retained feed parent/comment counts
  - Backfill failures
- Add all four alarm ARNs to the alarm widget.
- Update the dashboard alarm-count invariant from 18 to 22.

Monitoring is applied only after activation and catch-up because the stale alarm treats missing data as breaching.

## Runtime integration

### New files

Operations binaries:

- `fetch-changeset-diffs.py`
- `import-changesets.py`
- `bootstrap-changesets-core.sh`
- `bootstrap-changesets.sh`
- `changeset-update.sh`
- `changeset-backfill.sh`
- `activate-changeset-feed.sh`
- `refresh-changesets.sh`

Systemd:

- Changeset bootstrap service
- Changeset update service and timer
- Changeset backfill service and timer
- Changeset activation service
- Manual changeset refresh service

Database:

- `changesets-bootstrap-load.sql`
- `changesets-load.sql`

Tests:

- Changeset XML import invariant
- Changeset state/offset invariant
- Changeset SQL stream invariant
- Changeset refresh invariant

### Existing runtime changes

Update:

- Production schema and publisher views
- Installer lock creation, ownership, acquisition, timer enablement, and required-path contracts
- Environment configuration for discussion dump URLs, changeset replication URL, and per-run diff limit
- Backup and validation scripts
- Global rebuild and Phase 7 restore scripts
- Metrics and CloudWatch-agent log configuration
- Artifact build contracts and deterministic packaging
- Operations test registration
- Terraform monitoring and unified dashboard
- AWS OSM README data scope, sources, rollout phases, operational checks, refresh instructions, and volume-size reconciliation

Do not change:

- `global-update.sh` node spool behavior
- `replication_runs.stream` constraint
- Node replication cursor semantics
- `import-history.py`
- IAM, networking, DNS, SSM parameters, budgets, instance size, or EBS size

## Offline test plan

### XML importer

Fixtures cover:

- Dump header extraction
- Closed and open changesets
- Empty discussions
- Multiple ordered comments
- Multiline text
- Unicode
- XML entities
- Embedded NUL replacement
- Missing comment author fields
- Optional visibility
- Empty comment text if accepted by OSM
- Partial and complete bbox values
- Repeated parent snapshots
- Last-occurrence-wins behavior
- `--only-ids`
- `--stop-after-id`
- Multiple gzip inputs
- Dry-run counts
- No sensitive content in stdout/stderr

### Replication fetcher

Mocked HTTP fixtures cover:

- Root YAML with and without fractional seconds
- Logical sequence to offset artifact path
- Companion state sequence validation
- Exponential timestamp bracketing
- Binary-search boundary selection
- Update at head returning 3
- One and multiple contiguous diffs
- `max-diffs` termination
- Missing artifact below head
- Redirects
- Malformed state
- Interrupted retry behavior

Include an immutable captured fixture proving that artifact path `007/172/783` contains logical sequence `7172782`.

### SQL loading

Database invariants cover:

- Parent and comments insert together
- Empty discussion clears an older available discussion when the newer snapshot is accepted
- Added comments appear after re-emission
- Removed comments disappear after re-emission
- Updated visibility and author fields are reconciled
- Stale dump snapshots cannot alter newer feed discussion state
- Buffered parent and comments promote together when newly tracked
- Missing historical IDs backfill from the discussion dump
- No comment orphans
- Both stages truncate
- Concurrent loaders share the advisory lock

### Derived ALPR counts

Fixtures include:

- Created node
- Modified node
- Deleted node
- Multiple versions of one node in one changeset
- Mixed created/modified/deleted changeset
- Changeset containing unrelated OSM elements where `osm_num_changes` exceeds `alpr_nodes_touched`

### Refresh

Fixtures prove:

- Rows observed at or before the new dump timestamp are pruned.
- A changeset created before the dump but observed afterward is retained.
- Buffered discussions cascade only with pruned parents.
- Newer history discussion state survives a dump rescan.
- Live consumer cursor remains unchanged.
- Old dump remains authoritative after a failed refresh.
- Timers are restored after success and failure.
- Old dump removal occurs only after final validation.

### Project checks

Run:

```text
bash infrastructure/aws/osm/operations/test.sh
bash infrastructure/aws/osm/operations/tests/changeset-import-invariant.sh
python3 infrastructure/aws/osm/operations/tests/changeset-state-invariant.py
bash infrastructure/aws/osm/operations/tests/changeset-stream-invariant.sh
bash infrastructure/aws/osm/operations/tests/changeset-refresh-invariant.sh
bash infrastructure/aws/osm/operations/build-artifact.sh
terraform fmt -check -recursive
terraform validate
```

Network-dependent source inspection remains manual and is not part of the default test suite.

## Phased production rollout

### Phase 0: read-only baseline

Status: complete as of 2026-09-07. No production mutation.

Before any implementation or AWS mutation:

- Confirm AWS identity, account, region, and clean Terraform plan.
- Record actual canonical volume size, utilization, and free bytes.
- Record CPU, memory, node replication lag, backup size/age, current alarms, and publisher privileges.
- Confirm no changeset tables, markers, locks, units, or state keys exist.
- Resolve the discussion dump to its immutable release.
- Record its exact size, checksum, header timestamp, and expected retained-volume percentage.
- Resolve the changeset replication endpoint.
- Record live logical head, `last_run`, and the `S → artifact S + 1` mapping.
- Inspect one discussion-bearing diff without logging its body into rollout records.
- Identify a known ALPR-related changeset suitable for aggregate-only validation.

Rollback: none; read-only.

### Phase 1: implementation and offline validation

Status: complete as of 2026-09-07. No AWS credentials or production databases.

- Implement schema, XML importer, replication fetcher, loaders, scripts, units, locks, backup, validation, metrics, artifact contracts, tests, and README phases.
- Keep runtime changes in one commit.
- Keep Terraform alarms/dashboard changes in a separate monitoring commit.
- Run the complete offline test plan.
- Build the deterministic artifact and record SHA-256.
- Run Terraform formatting and validation without the production backend.
- Review the full diff and remove unrelated changes.
- Confirm `import-history.py` and node replication behavior are unchanged.

Rollback: discard the local changes.

### Phase 2: saved runtime-artifact plan

Status: complete as of 2026-09-07. Separate approval was required. Read-only AWS access plus backend locking.

- Rebuild and confirm the artifact SHA matches Phase 1.
- Initialize only the OSM Terraform root.
- Save a Terraform plan.
- Require exactly one in-place bootstrap artifact object update.
- Require zero creates, replacements, or destroys.
- Require protected-topology checks to pass.
- Confirm no monitoring, networking, compute, or volume changes.
- Present exact commands, resources, cost, validation, and rollback before execution.

Rollback: delete the saved local plan and release any completed state lock.

### Phase 3: runtime-artifact apply

Status: complete as of 2026-09-07. Separate approval was required.

- Apply the exact saved Phase 2 plan.
- Verify S3 object version and SHA metadata.
- Require a fresh Terraform plan to show no changes.
- Confirm no host runtime changed because compute ignores user-data updates.

Rollback: apply an approved saved plan built from the prior runtime commit.

### Phase 4: runtime installation

Status: complete as of 2026-09-07. Separate approval was required. Host mutation only.

Through SSM:

- Download and SHA-verify the artifact.
- Run the existing installer.
- Create parent, comment, buffer, and stage tables plus both publisher views.
- Install all changeset services and timers.
- Create both changeset locks.
- Leave update and backfill timers disabled because activation marker is absent.
- Install the refresh service without enabling it.
- Restart existing metrics, backup, and node replication timers according to current installer behavior.

Validate:

- All new relations and views exist.
- Ownership and privileges are correct.
- Pipeline buffers are not publisher-readable.
- Both changeset timers are disabled.
- Node replication lag recovers promptly.
- Validation passes with changeset checks skipped.

Rollback: reinstall the previous artifact. New isolated tables may remain or be explicitly dropped under a separately reviewed command.

### Phase 5: discussion-dump bootstrap

Status: complete as of 2026-09-07. Separate approval was required.

Expected effect:

- One approximately 8.95 GB download through the routing NAT.
- Approximately 3.5 percentage points of a 256 GiB volume retained.
- MD5 verification and a potentially 45–90 minute low-priority XML scan.
- No overlap with backup or refresh.

Through SSM:

- Start the changeset bootstrap service.
- Monitor logs without printing tags or discussions.

Require:

- Bootstrap marker contains a logical sequence.
- Database and file cursors match.
- Dump URL, checksum, timestamp, maximum ID, and replay sequence are recorded.
- Published changeset count is positive.
- Available normalized discussion comments are present when the tracked set contains discussion-bearing changesets.
- Tracked metadata completeness is zero.
- Comment foreign-key validation passes.
- Node replication remains healthy.
- Actual volume growth matches expectations.

Rollback:

- Stop the service.
- Remove changeset bootstrap/activation markers, cursor file, HTTP metadata, and changeset state keys.
- Keep or remove the re-downloadable dump under an explicit command.
- Leave isolated table rows in place; they affect no current application consumer.

### Phase 6: activation and catch-up

Status: complete as of 2026-09-07. Separate approval was required.

Through SSM:

1. Start the changeset activation service.
2. Confirm update and backfill timers are enabled and active.
3. Observe independent feed catch-up from the 24-hour overlap.
4. Wait for changeset lag below 300 seconds.
5. Require zero missing tracked metadata.
6. Require zero consumer failures.
7. Verify a discussion-bearing feed snapshot normalized correctly when one exists.
8. Confirm derived ALPR counts do not use raw `num_changes`.
9. Manually run the backfill service and require a clean no-op.
10. Confirm node feed lag is unchanged.

Rollback:

- Disable both changeset timers.
- Stop active changeset services after locks release.
- Remove only `global-changeset.complete`.
- Preserve bootstrap data and cursor so activation can be retried.

### Phase 7: validation, backup, and isolated restore

Status: complete as of 2026-09-07. Separate approval was required for backup and restore.

- Run full validation as `osm_ingest`.
- Require parent, comment, privilege, cursor, retained-dump, stage, and completeness checks to pass.
- Manually start the backup service.
- Verify the manifest includes independent cursor and all four parent/comment counts.
- Verify backup marker includes `changeset_sequence`.
- Restore into an isolated database.
- Compare history and buffer parent/comment counts.
- Validate discussion foreign keys, order, cursor, and ALPR-derived counts.
- Remove only the isolated restore database afterward.

Rollback: none. Failure blocks monitoring deployment.

### Phase 8: monitoring

Status: complete as of 2026-09-07. The owner waived the one-hour healthy observation gate. Separate approval was required for plan and apply.

Only after at least one healthy hour:

- Plan the monitoring commit.
- Require four alarm creates and one dashboard update.
- Require zero replacements or unrelated destroys.
- Save and inspect the plan.
- Apply the exact saved plan.
- Verify all new alarms reach OK.
- Verify changeset parent/comment series render.
- Verify the unified alarm widget contains the new alarms.
- Verify the dashboard invariant expects 22 alarms.

Rollback: apply an approved saved plan from the prior monitoring commit.

### Phase 9: steady state and dump refresh

Status: steady-state audit complete as of 2026-09-09. The owner waived the
seven-day wait after reviewing accumulated production utilization. No dump
refresh was due or run. Every refresh still requires separate approval.

After seven days:

- Audit CPU, memory, volume use, backup growth, parent/comment counts, lag, missing metadata, and backfill results.
- Record reconciliation in the README.

Refresh when dump age exceeds approximately 45 days or backup growth crosses an agreed threshold:

- Present the exact manual refresh command, source release, cost, free-space check, impact, validation, and rollback.
- Start the manual refresh service.
- Confirm update and backfill timers pause.
- Monitor checksum, import, completeness, observation-based pruning, validation, and timer restoration.
- Confirm the live cursor did not move backward.
- Confirm post-snapshot changesets and discussions were retained.
- Confirm only the validated old dump was removed.

Rollback uses the retained prior dump when finalization has not completed. After successful state commit, the new validated dump is authoritative and the unchanged live cursor continues forward.

## End-to-end acceptance criteria

The rollout is complete when:

- The changeset consumer is independent from node replication.
- Every tracked ALPR lifecycle changeset has parent metadata.
- Every discussion comment currently made available by the dump/feed is normalized and linked to its parent.
- Newly tracked historical changesets promote from the retained feed or backfill from the retained discussion dump.
- Discussion re-emissions update complete snapshots without stale overwrite.
- Logical cursor and offset artifact mapping are validated.
- Database and file cursors agree.
- Changeset lag is below 300 seconds.
- Missing tracked metadata at or before the processed source and dump cutoffs
  is zero; newer arrivals may remain transiently missing while ingestion moves
  the cutoffs forward.
- Raw OSM `num_changes` remains distinct from derived ALPR node counts.
- Backup and isolated restore preserve parents, comments, buffers, and cursor.
- Validation passes.
- All four changeset alarms are OK.
- Existing current/history node replication remains healthy.
- No OSM API calls occur.

## Risks

- Sequence offset mistakes can replay or skip minute artifacts. Offset mapping and embedded-sequence assertions are mandatory.
- A missing required artifact stalls the consumer intentionally rather than skipping data.
- Discussion text increases database and backup growth. Phase 0 and the seven-day audit establish measured growth.
- Discussions may contain sensitive or personally identifying text. Access remains limited to the publisher role, and bodies never appear in logs or metrics.
- OSM may hide or remove discussion content. Newer complete snapshots replace older availability; removed content is not retained.
- Weekly XML parsing is CPU-intensive. It runs with idle I/O and low CPU priority and is never overlapped with backup.
- Dump and feed snapshot skew is covered by the 24-hour replay margin and monotonic observation timestamps.
- Refresh pruning by creation time would lose later re-emissions; pruning is strictly observation-based.
- Two changeset writers require complete OS-lock coverage and a shared SQL advisory lock.
- The existing node-history OPL decoder can still corrupt some usernames/tags and remains a separate repair.

## Out of scope

- Laravel `OsmChangeset` and discussion models
- Moderation controllers, queries, pagination, status storage, and UI
- Revert detection and reviewer workflow
- Repairing `import-history.py`
- Volume resize
- IAM, network, DNS, instance-size, or budget changes
- Capturing content unavailable from the discussion dump or replication feed
