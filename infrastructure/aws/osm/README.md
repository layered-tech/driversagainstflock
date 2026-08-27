# DAF OSM production stack

This Terraform root provisions a private PostgreSQL/PostGIS and osm2pgsql host
for the production Drivers Against Flock OSM workload. It is independent from
the web server and follows the existing `daf-routing` network and operational
patterns without changing the public Moonlit Cloud topology.

No command in this directory is permission to change AWS. Follow the approval
gates in this runbook before every AWS operation, including remote-backend
initialization and planning.

## Data scope

Through Phase 7, the deployed database retains only the OSM node data required
by the original North America workload:

- The current state of North America nodes whose exact
  `surveillance:type=ALPR` tag is present.
- Every publicly available version of every node that has had that exact tag
  while located in North America.
- For each retained version: node ID, version, visibility, longitude, latitude,
  complete tags, OSM timestamp, changeset ID, contributor UID, and contributor
  username.
- Small replication, publication, and backup state tables needed to operate and
  monitor the pipeline.
- osm2pgsql slim middle tables needed to apply current-state minute diffs.

Phase 7.5 converts the entire active data stack to global scope: global
bootstrap sources, every currently exact-tagged public node worldwide, every
public version of every node that has had the exact tag anywhere, and one global
minute feed with separately checkpointed current and history consumers. The
completed Phase 7 regional stack remains only as a versioned rollback artifact.

The application-readable role can select both the current and historical
schemas, including contributor fields.

The stack does not retain OSM ways, relations, road segments, nearest-road
results, or derived road distances. Ways and relations are not imported even as
temporary PostgreSQL rows.

## Sources

| Purpose                                                                            | Source                                                                        |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| North America current extract through Phase 7                                      | `https://download.openstreetmap.fr/extracts/north-america-latest.osm.pbf`     |
| North America current checksum through Phase 7                                     | `https://download.openstreetmap.fr/extracts/north-america-latest.osm.pbf.md5` |
| North America current minute diffs retired by Phase 7.5                            | `https://download.openstreetmap.fr/replication/north-america/minute/`         |
| Global current planet snapshot after Phase 7.5                                     | `https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf`                  |
| Full public node history                                                           | Release-aligned immutable object under `https://osm-planet-us-west-2.s3.dualstack.us-west-2.amazonaws.com/planet-full-history/pbf/` |
| Global minute diffs for history through Phase 7 and both consumers after Phase 7.5 | `https://planet.openstreetmap.org/replication/minute/`                        |
| Node-history backfill                                                              | `https://api.openstreetmap.org/api/0.6/node/{id}/history`                     |

Through Phase 7, the region polygon is used only to decide whether an
exact-tagged node has been in North America. Once a node qualifies, every
publicly available version of that node is retained, including versions before
or after its qualifying location or tag. Phase 7.5 removes that regional
qualification boundary and removes the polygon from the active runtime and
validation contract.

## AWS layout

- Existing production VPC and public subnet are data sources and remain
  protected by topology checks.
- A Terraform-owned `10.0.3.0/24` private subnet and route table contain the OSM
  host at `10.0.3.10`.
- The existing `daf-routing` NAT gateway supplies internet egress. An OSM-only
  S3 gateway endpoint keeps artifact and backup traffic off the NAT gateway.
- The EC2 instance has no public address and no SSH ingress. Operations use
  Systems Manager Session Manager and Run Command.
- PostgreSQL ingress is limited by security group to the protected Moonlit
  Laravel security group, and `pg_hba.conf` additionally limits the client to
  the approved Laravel private address.
- A protected encrypted EBS data volume survives host replacement. The root
  volume is rebuildable.
- Versioned private S3 buckets contain the pinned bootstrap artifact and
  PostgreSQL backups.
- The daily `daf-osm-backup.timer` is installed but remains disabled until
  Phase 7, after the first manual backup and isolated restore proof are approved.
- Private Route 53 publishes `database.daf-osm.internal`.
- SSM Parameter Store publishes the endpoint, port, database name, and generated
  application-reader credentials. The password is a `SecureString`.
- The EC2 role is bounded by `DafOsmWorkloadBoundary` and can access only its
  bootstrap object, backup prefix, runtime parameters, logs, metrics, and SSM
  managed-instance channels.

## Monitoring and cost controls

Every Terraform-owned resource is tagged with `Project=daf-osm`,
`Environment=production`, and `ManagedBy=terraform`.

The `daf-osm` CloudWatch dashboard contains instance, EBS, PostgreSQL, current
replication, history replication, publication parity, and backup health. Alarms
publish to `daf-osm-alerts`.

The stack creates:

- A `$300` monthly budget filtered to `Project=daf-osm`.
- Actual-spend alerts at `$150` and `$250`.
- A forecast alert at 100 percent of budget.
- A project-filtered Cost Anomaly Detection monitor with an immediate alert for
  anomalies of at least `$10` and 20 percent impact.

The shared NAT gateway remains tagged to `daf-routing`, so its per-byte data
processing is not included in the `Project=daf-osm` budget. EC2 network metrics
show OSM traffic, but AWS cannot assign a shared NAT gateway's billing line to
the originating project tag. The approval summary must call out that unallocated
incremental cost. A dedicated OSM NAT gateway would provide stricter allocation
but add a fixed monthly charge and requires a separate design approval.

## Approval protocol

Before any AWS command, provide the operator with:

1. The exact commands to be run.
2. Whether the commands are read-only or mutating.
3. The resources and protected topology involved.
4. Expected one-time and steady-state cost impact.
5. Expected service and data impact.
6. Validation and rollback steps.

Wait for explicit approval for that exact phase. Approval does not carry into a
later phase. In particular, IAM changes, Terraform planning, Terraform apply,
current import, full-history import, instance resizing, application cutover,
restore tests, and cleanup are independent approvals.

## Rollout plan

### Phase 0: read-only production baseline

Status: complete.

- Confirm caller identity, account, and region.
- Confirm the protected VPC, Moonlit public subnet and security group, routing
  private subnet, shared NAT gateway, routing state, alarms, dashboard, and
  budget.
- Confirm that no OSM Terraform state or conflicting CIDR exists.
- Record denied IAM capabilities instead of broadening the routing operator.

No production resource is changed in this phase.

### Phase 1: local implementation and offline validation

Status: locally complete on 2026-08-24.

- Build the runtime artifact locally.
- Format Terraform and validate it with a local provider while the S3 backend is
  disabled.
- Validate JSON, shell, Python, Lua, SQL contract, systemd references, artifact
  contents, and IAM boundary alignment.
- Review the complete local diff and remove unrelated scaffolding.

No AWS credentials or production databases are used in this phase.

### Phase 2: OSM operator IAM bootstrap

Status: complete on 2026-08-24. All four live `v1` policy documents match the
reviewed local JSON. The workload boundary has zero attachments, and each of
the three operator policies has one attachment.

Approval required for every mutation.

- Create the `DafOsmWorkloadBoundary` managed policy from the reviewed JSON.
- Create narrowly scoped `DafOsmInfrastructure`, `DafOsmServices`, and
  `DafOsmMonitoring` managed policies. The monitoring split keeps every policy
  below IAM's 6,144-character managed-policy limit while preserving statement
  identifiers and the original effective permissions.
- Attach only those three OSM operator policies to the existing
  `daf-route-operator` IAM user. Do not attach the workload boundary to the
  operator; Terraform assigns it only to `daf-osm-*` workload roles.
- Do not alter or replace the existing routing policies.
- Retain the existing routing policies on the shared operator: the OSM backend
  and routing remote-state data source depend on their prefix-scoped access to
  the protected routing state bucket.
- Keep the explicit Route 53 deny limited to the Moonlit public hosted zone so
  it cannot override the routing policy's access to its private hosted zone.
- Read back the live policy documents and attachment counts before continuing.

Rollback: detach the three OSM operator policies and delete only the newly
created OSM policies after confirming that no `daf-osm-*` workload role uses
the boundary.

### Phase 3: saved Terraform plan

Status: complete on 2026-08-25. The saved plan contains 57 creates, zero
updates, zero replacements, and zero destroys, and both protected-topology
checks pass. The runtime artifact SHA-256 is
`f4e783e8f8eac3b7a52909f09db684077182aaf7ba2d7c0ca5110a68e1ea5c2f`; the
saved plan SHA-256 is
`e5f892c746dc1b0e210d8adb954c6159a0956356ea76c18461510afb9df93a07`.

Approval required. This phase may read AWS APIs and use the protected S3 state
backend and lock file, but it must not apply changes.

- Build the deterministic artifact and record its SHA-256.
- Initialize only the `infrastructure/aws/osm` Terraform root.
- Run `terraform plan -out=...` with the approved alert endpoint.
- Save the human-readable plan and inspect every create, update, replace, and
  destroy action.
- Require zero changes to Moonlit, routing-owned resources, the internet gateway,
  the routing subnet, and the routing NAT gateway.
- Present resource counts, IAM scope, monthly estimate, and notable risks.

Rollback: remove the local saved plan and release any completed state lock. A
plan creates no workload resources.

### Phase 4: infrastructure apply

Status: complete on 2026-08-25. The reviewed infrastructure plan and scoped
bootstrap repair plans were applied without changing the protected Moonlit or
routing-owned topology. The final runtime artifact SHA-256 is
`f11fe72c3218de8a2222d1e448c0b47353f8f65be2537ccd286d90ce503cf5c6`.
PostgreSQL 17, the pinned OSM tools, TLS, SSM, metrics, alarms, networking,
encrypted storage, protected S3 buckets, private DNS, parameters, dashboard,
budget, anomaly monitor, and confirmed SNS subscription were verified. Neither
data bootstrap is active, the backup timer is disabled, and the full
post-apply Terraform plan reports no changes.

Approval required only after the saved plan is reviewed.

- Apply the exact saved plan, never a newly calculated plan.
- Confirm the SNS email subscription request.
- Verify subnet routing, no public address, security-group ingress, SSM managed
  instance registration, encrypted volumes, S3 protections, Route 53, parameter
  names, log group, alarms, dashboard, budget, and anomaly monitor.
- Verify PostgreSQL installation without starting either data bootstrap.
- Verify `daf-osm-backup.timer` is disabled and remains disabled until Phase 7.

Rollback: stop at diagnosis if bootstrap fails. Preserve the EBS volume and S3
buckets. Any Terraform rollback must use a separately reviewed saved plan.

### Phase 5: current North America bootstrap

Status: complete on 2026-08-25. The checksum-verified North America extract
bootstrapped 136,183 exact-tagged current nodes; the validated post-replication
snapshot contained 136,358 current and staging rows with zero publication, tag,
contributor, geometry, or output-shape errors. Data-changing and zero-relevant-node
minute intervals both completed successfully, replication lag recovered to 207
seconds, and the freshness, failure, and publication-parity alarms reached `OK`.
The deployed runtime artifact SHA-256 is
`fd205049c76505ff5e89833e47155b78172cc8ce35ed025eb2b379e5f99567ad`.

- Start `daf-osm-current-bootstrap.service` through SSM.
- Verify the source checksum before import.
- Verify that only exact-tagged nodes exist in the osm2pgsql output and current
  publication.
- Verify contributor fields, full tags, coordinates, publication parity, and a
  nonzero row count.
- Observe minute updates for at least one complete replication interval and
  require healthy lag/failure alarms.

Rollback: stop current timers and bootstrap service. Do not publish an empty
table and do not cut over any consumer.

### Phase 6: complete public node-history bootstrap

Status: complete on 2026-08-26. The checksum-verified 161,811,792,379-byte
full-history source bootstrapped 144,113 qualifying North America nodes and
203,237 public lifecycle versions. Global minute catch-up and API backfills
then advanced the validated dataset to 214,092 lifecycle versions with zero
contributor, tag, visibility, geometry, staging, output-shape, or cursor-parity
errors. Database and file history cursors matched at sequence 7,259,738,
observed history lag recovered to 109 seconds, and all relevant database,
storage, freshness, failure, and publication-parity alarms reached `OK`. The
source and checksum remain retained without partial files, and the Phase 7
backup timer remains disabled and inactive. The deployed runtime artifact
SHA-256 is
`c493b31cba846b41ae9f30754b4c4321122d3c8910277960a4e1c170cf07482a`.

- Start `daf-osm-history-bootstrap.service` through SSM.
- Identify exact ALPR versions, qualify IDs by North America location, then load
  every public version of each qualifying ID.
- Verify contributor username, UID, changeset, timestamp, version, visibility,
  coordinates, and complete tags on retained versions.
- Through SSM, run
  `runuser --user osm_ingest -- /opt/daf-osm/bin/validate.sh` so PostgreSQL
  peer authentication uses the ingest operating-system identity.
- Retain the checksum-pinned full-history source and checksum through Phase 6
  validation and the first verified backup. Do not delete them in this phase;
  source deletion occurs only in Phase 7.
- Observe global minute history updates and API backfills for newly qualifying
  IDs.

Rollback: stop history services and preserve the current-state database. Retain
the checksum-pinned full-history source and checksum through validation and the
first verified backup. Remove only other explicitly identified temporary files
after checking that they are re-downloadable; do not delete the current
projection or protected EBS volume.

### Phase 7: backup, restore, and history-source cleanup proof

Status: complete on 2026-08-26. The first encrypted, versioned PostgreSQL
backup was uploaded and remotely verified at 42,627,010 bytes with SHA-256
`212f65e339f8c58d946abbf340299a3fec18aaa6e83178da18ede605737e39c3`.
An isolated restore reproduced 136,510 current nodes, 214,147 public lifecycle
versions, current/history cursors 7,259,810 and 7,259,811, all 21 validated
constraints, staging parity, contributor-field aggregates, and table ownership.
The isolated database and temporary restore files were then removed while the
verified S3 backup and sidecars remained intact. The daily backup timer is
enabled and active. After its bootstrap, validation, backup, database, and file
sequence gates passed, the 161,811,792,379-byte full-history source and checksum
were removed and the durable cleanup marker was recorded at history sequence
7,259,838. The final deployed runtime artifact SHA-256 is
`e1aed7af7870921b96128d8a726272284e85f04d090624da42a95c8a6d588e97`.

- Through SSM, manually start `daf-osm-backup.service` to complete, upload, and
  remotely verify the first encrypted logical backup. Do not enable the timer
  yet.
- Verify the durable `backup.complete` marker, backup age, and failure metrics.
- Restore into an isolated database or replacement volume, not over production.
- Run current/history counts, constraints, contributor-field, and replication
  cursor checks against the restore.
- Only after the first backup is verified and the restore proof is approved, use
  SSM to enable and start `daf-osm-backup.timer`.
- After the durable history-bootstrap, `validation.complete`, `backup.complete`,
  and history-replication markers pass their sequence checks, use SSM to run
  `runuser --user osm_ingest -- /opt/daf-osm/bin/cleanup-history-bootstrap.sh`
  so PostgreSQL peer authentication succeeds. Full-history source deletion
  occurs only in this phase.
- Verify the source and checksum are absent and the
  `history-bootstrap-source-removed.complete` marker is durable.

Rollback: discard only the isolated restore after approval. Keep the verified
backup under the configured S3 lifecycle.

### Phase 7.5: single global replication and global node stack

Approval required for the destructive in-place database rebuild and runtime
deployment. There are no production database consumers before Phase 8, so this
phase does not create a shadow database: it stops the Phase 7 timers, verifies
the completed Phase 7 backup marker, rebuilds the existing OSM schemas globally,
and accepts bootstrap downtime. Activating the global timer requires separate
explicit approval after both global bootstraps and shared-feed initialization
pass. Cleaning the retained global history source requires another explicit
approval after validation, backup, and restore gates pass. Phase 8 application
cutover remains an independent approval.

- Replace the independent regional-current and global-history downloaders with
  one global minute-diff acquisition path. Fetch each sequence once and retain
  its durable spool entry until both downstream consumers have committed it.
- Keep independent current and history applied cursors, failure state, and
  retry behavior. A successful consumer must not advance the other consumer or
  allow a shared diff to be removed before both commits are durable.
- Bootstrap the global current projection in the rebuilt database from a checksum-pinned
  current planet snapshot, initialize it at the matching global replication
  cursor, and replay retained global diffs until it reaches the shared feed head.
- Store the current state of every visible public node worldwide whose exact
  `surveillance:type=ALPR` tag is present. Remove it from the current projection
  when it becomes invisible or loses the exact tag.
- Re-download the checksum-pinned full-history planet source and bootstrap
  global history qualification without a region polygon so nodes that qualified
  only in the past are not missed. Retain every publicly available version of
  every globally qualifying node, then continue applying lifecycle versions
  from the shared global feed and API backfills.
- Validate nonzero global counts, exact-tag filtering, current/staging parity,
  contributor fields, complete tags, visibility, geometry, sequence continuity,
  per-consumer cursor parity, retry recovery, and output shape against the
  checksum-pinned global bootstrap sources. No regional subset is an acceptance
  gate.
- Add separate shared-feed, current-consumer, and history-consumer metrics and
  alarms for source lag, retained spool depth, applied cursors, cursor divergence,
  failures, and publication parity.
- Complete and remotely verify a post-migration backup, then restore it into an
  isolated database and repeat the global current/history validation there.
- After explicit activation approval, enable the single global timer. The final
  runtime contains no North America source, timer, cursor, polygon, metric,
  alarm, or validation branch. Preserve the completed Phase 7 backup and
  versioned artifact as the rollback source.

Execution order through SSM after the destructive rebuild/runtime deployment is
approved:

1. Start `daf-osm-global-rebuild-prepare.service`. This preserves the Phase 7
   backup marker, drains database readers, drops the unused schemas, and creates
   the global schema.
2. Start `daf-osm-current-bootstrap.service`, then
   `daf-osm-history-bootstrap.service`. Do not overlap the two planet downloads.
3. Verify both immutable planet filenames identify the same release, then start
   `daf-osm-global-initialize.service`. It requires identical checksum-pinned
   bootstrap sequence and timestamp values before creating the shared feed.
4. After separate activation approval, start
   `daf-osm-global-activate.service`. Let the one shared feed replay until its
   shared, current, and history database/file cursors converge and its retained
   spool is empty.
5. Run `runuser --user osm_ingest -- /opt/daf-osm/bin/validate.sh`. Only after
   `global-validation.complete` exists, manually start
   `daf-osm-backup.service` and verify the remote archive and both sidecars.
6. Restore that backup into an isolated database. Re-run the global counts,
   constraints, metadata, output-shape, and shared/current/history cursor checks
   against the restore. Remove only the isolated restore after the proof passes.
7. Enable and start `daf-osm-backup.timer`. After separate source-cleanup
   approval, run
   `runuser --user osm_ingest -- /opt/daf-osm/bin/cleanup-history-bootstrap.sh`
   and verify the global cleanup marker and source absence.

Rollback: leave Phase 8 consumers unchanged and stop the global timer. Restore
the completed Phase 7 database backup. Before installing the versioned Phase 7
runtime artifact, run `/opt/daf-osm/bin/restore-phase7-runtime-state.sh` as root.
It reconstructs both legacy replication state files from the restored database
snapshot and restores the preserved Phase 7 bootstrap, validation, backup, and
source-cleanup markers. Install the Phase 7 artifact and resume its
regional-current and global-history services only after their restored file
cursors match the restored database cursors. Remove incomplete global bootstrap
files only after the Phase 7 stack is validated.

### Phase 8: consumer cutover

Approval required and intentionally separate from infrastructure rollout.

- Add the production application or new service as an explicitly approved
  database client.
- Retrieve reader credentials without printing decrypted secrets.
- Compare current ALPR counts and representative rows with the existing source.
- Disable the scheduled Overpass current-state ingestion only after parity and
  freshness gates pass.
- Keep public API response contracts unchanged.

Rollback: restore Overpass ingestion and the previous application configuration;
the OSM database continues replicating independently.

### Phase 9: steady-state resize and cleanup

Each change requires separate approval.

- Resize from any temporary import instance class only after CPU, memory, lag,
  and I/O data support the steady-state class.
- Adjust EBS size or throughput only from measured utilization.
- Review budget attribution, alarm history, backup growth, and lifecycle results.
- Remove bootstrap intermediates and obsolete credentials only after resolving
  exact paths and proving recovery sources.

There is no automatic destroy phase. Protected EBS, S3, state, and database
resources require an explicit decommission plan.

## Routine operational checks

Use SSM rather than SSH. Do not print SecureString values or coordinate-bearing
database output into command results. Prefer aggregate counts, lag, service
status, disk percentages, and redacted validation queries.

The normal healthy state is:

- PostgreSQL is reachable only from approved clients.
- Current replication lag is under ten minutes.
- History lag is under one hour after bootstrap.
- Publication parity mismatch is zero.
- A successful backup is less than 25 hours old.
- All `daf-osm-*` alarms are `OK`.
- The current and forecast spend remain below the approved thresholds.
