# DAF OSM production stack

This Terraform root provisions a private PostgreSQL/PostGIS and osm2pgsql host
for the production Drivers Against Flock OSM workload. It is independent from
the web server and follows the existing `daf-routing` network and operational
patterns without changing the public Moonlit Cloud topology.

No command in this directory is permission to change AWS. Follow the approval
gates in this runbook before every AWS operation, including remote-backend
initialization and planning.

The independent changeset metadata and discussion pipeline has its own
design, rollout, validation, and refresh runbook in [`CHANGESETS.md`](CHANGESETS.md).

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

The independent changeset stream adds complete metadata and every available
discussion comment for changesets associated with a retained ALPR node
lifecycle. Its short-lived pipeline buffer retains worldwide changesets seen
after the active weekly snapshot so later-tracked nodes can promote metadata
without rewinding the node feed. Published ALPR created, modified, deleted, and
touched counts are derived from retained node versions; OSM's all-element
`num_changes` is exposed separately and is never used as the touched count.

## Sources

| Purpose                                                                            | Source                                                                                                                              |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| North America current extract through Phase 7                                      | `https://download.openstreetmap.fr/extracts/north-america-latest.osm.pbf`                                                           |
| North America current checksum through Phase 7                                     | `https://download.openstreetmap.fr/extracts/north-america-latest.osm.pbf.md5`                                                       |
| North America current minute diffs retired by Phase 7.5                            | `https://download.openstreetmap.fr/replication/north-america/minute/`                                                               |
| Global current planet snapshot after Phase 7.5                                     | `https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf`                                                                        |
| Full public node history                                                           | Release-aligned immutable object under `https://osm-planet-us-west-2.s3.dualstack.us-west-2.amazonaws.com/planet-full-history/pbf/` |
| Global minute diffs for history through Phase 7 and both consumers after Phase 7.5 | `https://planet.openstreetmap.org/replication/minute/`                                                                              |
| Node-history backfill                                                              | `https://api.openstreetmap.org/api/0.6/node/{id}/history`                                                                           |
| Weekly changeset metadata and discussions                                          | Immutable release resolved from `https://planet.openstreetmap.org/planet/discussions-latest.osm.bz2`                                |
| Independent changeset minute replication                                           | `https://planet.openstreetmap.org/replication/changesets/`                                                                          |

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

The `daf-infrastructure` CloudWatch dashboard contains shared-host, EBS,
PostgreSQL, replication, publication parity, backup, GraphHopper, and graph
builder health. Alarms publish to the existing OSM and routing alert topics.

The stack creates:

- A `$150` monthly budget covering `Project=daf-osm` and `Project=daf-routing`.
- Actual-spend alerts at `$75` and `$125`.
- A forecast alert at 100 percent of budget.
- A project-filtered Cost Anomaly Detection monitor with an immediate alert for
  anomalies of at least `$10` and 20 percent impact.

The shared NAT gateway remains tagged to `daf-routing`, so its fixed and
per-byte costs are included alongside OSM resources in the unified budget.

## Changeset stream operations

The changeset rollout is independent from the shared node replication cursor.
Local implementation and offline verification do not use AWS credentials or a
production database. Deployment then installs the schema and inactive units,
bootstraps a checksum-pinned discussion dump, activates the update and daily
02:00 UTC backfill timers, and applies the four changeset alarms only after the
consumer catches up.

The retained discussion dump is approximately 8.95 GB compressed, about 3.5
percentage points of the current 256 GiB data volume. A refresh needs enough
free space for both old and new dumps. Run the manual
`daf-osm-changeset-refresh.service`; it pauses both timers, retains feed rows
observed after the new snapshot, preserves the live changeset cursor, and only
removes the old dump after checksum, import, completeness, and validation gates
pass.

Operational checks include `global-changeset.complete`, database/file cursor
parity, empty stages, retained dump checksum, missing tracked metadata, parent
and comment counts, feed retention, discussion ordering, stale open changeset
reporting, consumer lag, and backfill failures. Backups record the independent
changeset sequence and all four parent/comment counts without adding it to the
node-cursor convergence rule.

### Changeset Phase 9 steady-state reconciliation

Phase 9 was reconciled on 2026-09-09. The owner waived the planned seven-day
wait because the accumulated production utilization was sufficient. The clean
metric window ran from 2026-09-08 05:00 UTC through 2026-09-09 15:38 UTC; the
2026-09-07 worker saturation was excluded because it was caused by an
operator-started excess worker count rather than the steady-state workload.

- Peak five-minute average CPU was 73.55 percent, the highest CPU sample was
  82.69 percent, and peak hourly average CPU was 63.58 percent. The highest
  memory sample was 11.26 percent and peak hourly average memory was 10.17
  percent.
- Data-volume use peaked at 6.09 percent during the clean metric window. The
  final host snapshot used 16,797,077,504 of 274,743,689,216 bytes (6.11
  percent), leaving 257,946,611,712 bytes free.
- The first post-stream backup was 121,297,950 bytes and the 2026-09-09 backup
  was 135,071,505 bytes: 13,773,555 bytes of growth (11.36 percent) across two
  days after the initial bootstrap increase. Backup age remained below 25
  hours and no backup failure was observed.
- Over the clean metric window, published changesets increased from 179,254 to
  at least 179,966, published discussion comments increased from 2,599 to
  2,608, retained feed parents increased from 481,534 to 559,486, and retained
  feed comments increased from 6,207 to 7,042. The final snapshot contained
  180,070 published changesets, 2,608 published comments, 571,282 retained feed
  parents, and 7,185 retained feed comments.
- Changeset lag stayed between 40 and 305 seconds in the clean window. At the
  final snapshot it was 157 seconds; shared-feed, current, and history lag were
  each 74 seconds. Database and file changeset cursors both held sequence
  7,177,812, both staging tables were empty, and the update, backfill, and
  backup timers were active.
- Two approved manual backfills each completed successfully and promoted one
  retained-dump record. After the second run, the two remaining missing IDs
  (`188792029` and `188792034`) had arrived after the processed source cutoff
  and were greater than the retained dump maximum ID (`188277418`). Missing
  metadata at or before both the source and dump cutoffs was zero. The owner
  accepted this repeat post-cutoff arrival pattern as passing ingestion churn.
- All 22 unified dashboard alarms were `OK` in the final check. No changeset
  consumer or backfill failure datapoints appeared in the clean metric window.

The retained discussion dump was approximately 9.8 days old, below the
approximately 45-day refresh trigger. No dump refresh was approved or run; a
future refresh remains a separate approval-gated operation.

### Data-volume rightsizing

Status: complete on 2026-09-09. The rightsized 64 GiB volume is the protected
canonical OSM data volume, and the 256 GiB legacy volume was permanently
deleted after the operator explicitly waived the remaining rollback window.
Terraform validation and the complete OSM operations invariant suite passed.
The deterministic runtime artifact SHA-256 is
`f4986ea1186b0be084ea48b36a15bf18766b591687eb2178783df3b23367fdfb`.
Each remaining production phase below requires separate approval under the
approval protocol.

The approved read-only production plan completed on 2026-09-09. It contains
two creates, two in-place updates, zero replacements, and zero destroys. The
creates are the protected 64 GiB gp3 volume and its temporary `/dev/sdj`
attachment. The updates publish runtime artifact
`f4986ea1186b0be084ea48b36a15bf18766b591687eb2178783df3b23367fdfb`
and lower the data-volume alarm from 85 to 70 percent. The current volume and
attachment are state-address moves only. The saved plan SHA-256 is
`8e77d61579247907b9753da4f4f679aed584d70184e04973d99b68bea20a9424`.

That exact plan was applied on 2026-09-09: two resources were added, two were
updated in place, and none were replaced or destroyed. The protected encrypted
64 GiB gp3 volume is `vol-05a44dcbb7809f42d`, attached to
`i-096fe74bac4f594b3` as `/dev/sdj` with 3,000 IOPS and 125 MiB/s. The active
data output remains the protected 256 GiB `vol-0f28cb6d0f7ed35d9`. Artifact
version `qEjsZPclBKnI0SWSdozbnqdvBGjow6D0` has the planned SHA-256, the
70-percent alarm is `OK`, and a fresh Terraform plan reports no changes.

The narrowly scoped runtime-install SSM command completed successfully on
2026-09-09. It verified both the artifact and migration-script checksums before
installing `/opt/daf-osm/bin/migrate-data-volume.sh`. The active filesystem
remained the 256 GiB XFS volume, and PostgreSQL plus the global update,
changeset update, changeset backfill, backup, and metrics timers all remained
active. No data migration or mount change occurred in this phase.

The approved cutover SSM command
`46e27d8e-fc3d-45cd-9f6c-9c1e0b61f45f` then completed successfully in 5
minutes 8 seconds. It mounted `vol-05a44dcbb7809f42d` at
`/var/lib/daf-osm`, leaving `vol-0f28cb6d0f7ed35d9` attached but unmounted.
The new XFS filesystem reported 15,258,578,944 bytes used and 53,393,788,928
bytes available, or 23 percent use. PostgreSQL and all five timers were active.
Both core and full validation passed with 180,111 changeset parents, 2,608
available comments, one changeset open longer than 25 hours, 150,779 current
nodes, and 247,209 public lifecycle versions at global sequence 7,279,888.

The immediate post-cutover observation confirmed that both encrypted gp3
volumes remained attached with `DeleteOnTermination=false`. All 21 exact-name
CloudWatch alarm checks were `OK`. The operator policy intentionally denied a
prefix-only alarm query evaluated against `alarm:*`; retrying with the exact
Terraform-managed alarm names succeeded without broadening IAM. The latest
complete backup set remained the 135,071,505-byte archive and its checksum and
manifest uploaded at 2026-09-09 04:21 UTC. Because that backup predates the
cutover, a successful post-migration backup is still required before the legacy
volume retention window can close.

The first post-migration backup completed successfully through SSM command
`88badad0-9c8c-4320-91d4-5202006c2f06` at 2026-09-09 21:56:06 UTC. The
142,049,506-byte archive, SHA-256 sidecar, and manifest were uploaded and
remotely verified under `postgresql/20260909T215545Z/`; local backup files were
removed afterward. Its shared, current, and history cursors all matched at
7,279,907, and its changeset cursor was 7,177,903. This timestamp starts the
required 48-hour healthy retention window, so the protected legacy volume must
remain attached until at least 2026-09-11 21:56:06 UTC unless that rollback
window is explicitly waived. On 2026-09-09, the operator explicitly waived the
remaining window and requested removal of the legacy volume.

The checksum-verified final Terraform plan applied with zero additions, two
in-place updates, and two destroys. It detached and permanently deleted only
`vol-0f28cb6d0f7ed35d9`, renamed `vol-05a44dcbb7809f42d` as the canonical OSM
data volume, and moved its dashboard metrics to the active volume. Final SSM
validation command `5b4416c9-55d2-490d-b1e9-daf0eac3ceae` succeeded with only
the canonical 64 GiB OSM and GraphHopper volumes present. The OSM filesystem
reported 15,243,681,792 bytes used and 53,408,686,080 bytes available, or 23
percent use. PostgreSQL and all five timers were active; validation reported
180,150 changeset parents, 2,608 available comments, one changeset open longer
than 25 hours, 150,802 current nodes, and 247,248 public lifecycle versions at
global sequence 7,279,933.

The Phase 9 snapshot used 16,797,077,504 bytes on the 256 GiB volume. A 64 GiB
gp3 volume would begin at approximately 24.4 percent use. Adding another dump
the size of the 8,945,698,542-byte Phase 0 release during a refresh would raise
projected use to approximately 37.4 percent before database growth. The
migration also refuses a target that would leave less than 16 GiB free after
copying the source filesystem.

The rightsized volume retains the included 3,000 IOPS and 125 MiB/s gp3
performance. At the us-east-1 gp3 storage rate of $0.08 per GiB-month, steady
state falls from approximately $20.48 to $5.12 per month, saving approximately
$15.36 per month before taxes and backup storage. Both volumes are billed only
during the migration and rollback-retention window.

The rollout is deliberately staged:

1. Build and offline-validate the deterministic runtime artifact and Terraform
   transition. The current 256 GiB resource and attachment move to protected
   legacy addresses in state; this is an address move, not an AWS mutation. The
   replacement uses a temporary `data_rightsized` address until cutover.
2. Save and review a production Terraform plan. It may create only the new
   encrypted 64 GiB gp3 volume and temporary attachment, update the approved
   runtime artifact and 70-percent usage alarm, and include any already-reviewed
   pending monitoring changes. It must not replace or destroy the database host,
   network interface, old volume, graph volume, or either volume's data.
3. Apply only the reviewed saved plan, install the checksum-verified runtime
   artifact, and verify both protected volumes are attached while the 256 GiB
   filesystem remains mounted at `/var/lib/daf-osm`.
4. Run `/opt/daf-osm/bin/migrate-data-volume.sh --mode rightsize` through SSM
   with the reviewed old and new volume IDs. The script preserves the active
   timer set, stops all OSM writers, takes every pipeline lock, formats the new
   XFS filesystem only when it has no filesystem signature, checks refresh
   headroom, copies and dry-run-compares all data, swaps the UUID in `fstab`,
   starts PostgreSQL, and runs the core production validation before restarting
   timers.
5. Observe database availability, all replication cursors and lag, missing
   changeset metadata, backup success, volume use, and all alarms. Keep the old
   volume attached but unmounted during this observation window.
6. After separate approval, detach the old volume without deleting it. Retain
   it for at least one successful post-migration backup and 48 healthy hours.
7. After final destructive approval, remove the protected legacy resource and
   delete the 256 GiB volume. Normalize the canonical attachment and remove the
   temporary Terraform migration variables, output, and moved blocks.

Any pre-validation failure automatically restores the original `fstab`, remounts
the 256 GiB filesystem, starts PostgreSQL, and restores only the timers that were
active before migration. During the retention window, an approved reverse copy
uses the same command with `--mode rollback`, treating the mounted 64 GiB volume
as the source and the 256 GiB volume as the target. No Terraform phase may
delete the old volume until this rollback window is explicitly closed.

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

Status: complete on 2026-08-27.

Production approval was granted separately for the saved Terraform plan,
artifact apply, reader-view deployment, pre-cutover application deployment,
and final two-flag cutover.

Completion record:

- Terraform applied only the versioned bootstrap object: zero resources added,
  one changed, and zero destroyed. Artifact SHA-256
  `0dee6e8daba1ee5b9221bfe139940befe9e6edc35b15e617d43c32d6c5fa0abc`
  is S3 version `JCvQe8LajzclSTp4Dv_ZMzJMzuJAjH.7`.
- SSM command `9a468990-4d6e-425b-9c7d-d246cd390b8c` installed the
  reader schema and validator. Database validation passed with 147,105 current
  nodes, 237,925 public lifecycle versions, and replication sequence 7,261,831.
- Pre-cutover verification kept `OSM_READER_ENABLED=false` and
  `OVERPASS_INGESTION_ENABLED=true`. The reader was three minutes fresh, five
  representative rows matched, and the 92-row difference passed the explicitly
  approved maximum difference of 100. Exact count parity is not expected between
  the independent legacy batch and minute-replicated sources.
- The atomic production cutover set `OSM_READER_ENABLED=true` and
  `OVERPASS_INGESTION_ENABLED=false`. Post-cutover verification found a
  one-minute-old reader, a 93-row difference within the same approved bound,
  and parity for five representative rows. No legacy Overpass batch was active.
- Marker, hotlist, electronic-horizon, and directions production smoke tests
  each returned HTTP 200 without printing response payloads.

- Deploy the versioned OSM artifact containing
  `osm_current.application_alpr_nodes`, then apply `schema.sql` on the OSM host.
  The compatibility view exposes only the existing application column contract,
  and `osm_publisher` retains SELECT-only access.
- Deploy the Laravel reader support with `OSM_READER_ENABLED=false` and
  `OVERPASS_INGESTION_ENABLED=true`. This makes the new connection available
  without changing production reads or the existing ingestion schedule.
- Retrieve `/daf-osm/database/endpoint`, `/daf-osm/database/port`,
  `/daf-osm/database/name`, `/daf-osm/database/publisher-username`, and the
  decrypted `/daf-osm/database/publisher-password` directly into protected
  production environment fields. Never echo, log, or place the password in a
  command argument, shell history, repository file, or command result.
- Run `php artisan app:verify-osm-cutover` while the application still reads its
  legacy table. By default, it requires exact aggregate count parity, a reader
  source age of no more than ten minutes, and matching canonical fields for five
  evenly distributed rows. Use repeated `--node=<id>` options for separately
  approved representative node IDs. The command reports aggregate counts,
  timestamps, IDs, and mismatched field names without printing tags,
  coordinates, or credentials.
- Only after that command passes, set `OSM_READER_ENABLED=true` and
  `OVERPASS_INGESTION_ENABLED=false` in the same production configuration
  change and redeploy or reload every web, worker, and scheduler process.
- Re-run `php artisan app:verify-osm-cutover`, inspect
  `php artisan config:show osm`, and smoke-test the marker, directions, hotlist,
  and electronic-horizon
  endpoints. Confirm that their response shapes are unchanged and that no new
  scheduled Overpass batch starts.

Rollback: atomically restore `OSM_READER_ENABLED=false` and
`OVERPASS_INGESTION_ENABLED=true`, then redeploy or reload every application
process. The legacy application table remains intact through the observation
window, and the OSM database continues replicating independently.

### Phase 9: steady-state resize and cleanup

Status: in progress. Each change requires separate approval.

#### Phase 9A: retire application-local OSM storage

Deploy the runtime cleanup before dropping any application tables. The cleanup
makes `App\Models\OsmNode` permanently read the configured SELECT-only OSM
connection and compatibility view, removes the legacy Overpass and local
osm2pgsql writers, removes local marker mutation and confirmation features, and
keeps the published-node callback response without persisting it locally. Marker
payload cache version `v3` prevents a pre-cleanup static file from continuing to
serve legacy local markers.

Before deployment, run this read-only aggregate inventory on the Laravel host:

```bash
php artisan tinker --execute 'dump(["markers_total" => DB::table("markers")->count(), "markers_active" => DB::table("markers")->whereNull("deleted_at")->count(), "confirmations_total" => DB::table("confirmations")->count(), "nodes_total" => DB::table("nodes")->count(), "nodes_latest_sync" => DB::table("nodes")->max("last_synced_at")]);'
```

Stop if `markers_active` is nonzero until those records are accounted for or
their retirement is approved explicitly. Keep the three legacy tables and the
Phase 8 environment flags unchanged through the Phase 9A observation window so
the previous release remains deployable as rollback.

Production inventory passed before the Phase 9A deployment: `markers` contained
zero total and zero active rows, `confirmations` contained zero rows, and the
legacy `nodes` table contained 147,027 rows with a latest sync timestamp of
`2026-08-27 22:04:55`. No local marker or confirmation data requires migration;
the legacy node rows remain only as the Phase 8 rollback source until Phase 9B.

After the cleanup deploy, refresh the versioned marker file, inspect the reader
binding, and prove the retired routes and commands are absent:

```bash
php artisan markers:refresh-file
php artisan config:show osm
php artisan tinker --execute 'dump((new App\Models\OsmNode)->getConnectionName(), (new App\Models\OsmNode)->getTable());'
php artisan route:list --path=api
php artisan list
```

The Phase 9A production deployment bound `App\Models\OsmNode` to connection
`osm` and view `osm_current.application_alpr_nodes`. The view returned 147,131
rows while the untouched legacy table remained at 147,027 rows with its
`2026-08-27 22:04:55` final sync timestamp. The production schedule contained
only `markers:refresh-file` and `telescope:prune`. Route inspection confirmed
that the legacy save, delete, and confirmation routes were absent while the
published-node callback remained registered. Bounded marker, hotlist,
electronic-horizon, and directions smoke tests all returned HTTP 200.
The unbounded marker-file `v3` endpoint also returned HTTP 200.

Smoke-test marker, hotlist, electronic-horizon, directions, and published-node
flows. Confirm that no application query or scheduled command accesses the
legacy `markers`, `confirmations`, or `nodes` tables during the observation
window.

The Phase 9A follow-up application artifact moves marker-file generation into
an isolated Redis/Horizon queue. `markers:refresh-file` now returns after
dispatching one unique `App\Jobs\RefreshMarkerFile` job to the
`redis-long-running:marker-files` queue; a dedicated Horizon worker performs
the OSM read and atomic file replacement without occupying the default queue.
The same artifact removes the unused
directions provider verification command and the unused Laravel Socialite and
mobile OAuth bridge. Expo's direct OpenStreetMap OAuth flow is independent and
is unchanged. `OPENSTREETMAP_API_URL` remains required by the published-node
callback.

The first production queue attempt proved that the old 55-second job timeout
was too short. The corrective artifact uses a 600-second job timeout, a
660-second dedicated supervisor timeout, and a 720-second Redis
`retry_after`, preserving the required timeout ordering and preventing a second
copy from starting while the first still runs. Set
`REDIS_LONG_RUNNING_QUEUE_RETRY_AFTER=720` in production before deployment.

After deploying the corrective artifact, terminate Horizon through the normal
deployment hook so its process monitor reloads the new supervisor configuration,
then run:

```bash
php artisan horizon:terminate
php artisan horizon:status
php artisan horizon:supervisors
stat --format='before: modified=%y bytes=%s' storage/app/markers/markers-v3.json
php artisan markers:refresh-file
```

Wait for the process monitor to restart Horizon before checking its status.
`horizon:supervisors` must show both `redis:default` and
`redis-long-running:marker-files` workers. The refresh command must report
`Marker file refresh queued.` After Horizon processes the job, rerun `stat` and
confirm the modified time advanced and the file is nonempty. Then confirm the
retired backend OAuth routes and directions command are absent and the retained
OSM API URL is still configured:

The corrective queue deployment passed its production marker-file check. A
queued refresh advanced `markers-v3.json` from
`2026-08-28 04:22:38.196545167 +0000` to
`2026-08-28 04:24:16.666889871 +0000`; the resulting file remained nonempty at
100,696,634 bytes, and the public marker endpoint returned HTTP 200. The
unchanged byte count is acceptable because the advanced modification time
proves that the atomic replacement completed.

```bash
php artisan tinker --execute 'dump(["osm_redirect_route" => Route::has("auth.openstreetmap.redirect"), "osm_callback_route" => Route::has("auth.openstreetmap.callback"), "directions_verifier" => array_key_exists("directions:verify-providers", Artisan::all()), "openstreetmap_api_url" => config("services.openstreetmap.api_url")]);'
curl -sS -o /dev/null -w 'marker file v3: %{http_code}\n' https://driversagainstflock.org/api/markers
```

All three Boolean values must be `false`, the OSM API URL must be present, and
the marker endpoint must return HTTP 200. Also verify the login page no longer
offers backend OpenStreetMap login. Keep the old backend OAuth environment
values through the observation window if rollback to the prior release remains
necessary; the new release does not read them.

The production backend-removal check returned `false` for both retired OAuth
routes and for the directions verifier command. Its first check exposed the
development OpenStreetMap API URL; after correcting the production environment
and rebuilding Laravel's configuration cache, the application resolved
`https://api.openstreetmap.org/api/0.6`, whose capabilities endpoint returned
HTTP 200. The production login page no longer offered backend OpenStreetMap
login.

Rollback: deploy the Phase 8 application release. The retained tables and the
still-configured `OSM_READER_ENABLED=true` and
`OVERPASS_INGESTION_ENABLED=false` values restore the previous release without
reconstructing data.

#### Phase 9B: drop legacy application tables

This is a separate destructive database release. Begin only after Phase 9A has
completed its observation window, the aggregate inventory is accepted, and the
exact migration is approved. Drop dependent `confirmations` first, then
`markers`, then `nodes`. Historical migrations remain immutable; the cleanup
migration records the forward-only retirement. Before including the
now-unreferenced `social_accounts` table, inventory it separately in production:

```bash
php artisan tinker --execute 'dump(["social_accounts_total" => DB::table("social_accounts")->count()]);'
```

Stop if the count is nonzero until those accounts are explicitly accounted for.
The local development table contained zero rows during the follow-up artifact
audit, and the production inventory also returned zero rows. No social-account
data requires migration.

The approved Phase 9B artifact adds
`2026_08_28_043658_drop_legacy_osm_and_social_tables.php`. Its forward-only
migration drops `confirmations`, `markers`, `nodes`, and `social_accounts` in
that order. The schema audit found no foreign keys into or out of those tables.
The migration cannot reconstruct retired data, so its `down` method stops
instead of pretending the drop can be reversed.

The application owner explicitly approved applying Phase 9B without an
application-database backup. `markers`, `confirmations`, and `social_accounts`
were empty, while the 147,027 legacy `nodes` rows had already been superseded by
the independently maintained OSM reader database. This approval accepts that a
Phase 8 application rollback is no longer available after the migration runs.

Immediately before deployment, repeat the aggregate inventory. Stop if any
count differs from its approved value:

```bash
php artisan tinker --execute 'dump(["markers_total" => DB::table("markers")->count(), "confirmations_total" => DB::table("confirmations")->count(), "nodes_total" => DB::table("nodes")->count(), "social_accounts_total" => DB::table("social_accounts")->count()]);'
php artisan migrate --pretend --force
```

The approved values are zero markers, zero confirmations, 147,027 legacy nodes,
and zero social accounts. The migration preview must contain only the expected
four table drops before applying it:

```bash
php artisan migrate --force
```

Afterward, verify that all four tables are absent and that `App\Models\OsmNode`
still reads the OSM compatibility view rather than the application database:

```bash
php artisan tinker --execute 'dump(["confirmations" => Schema::hasTable("confirmations"), "markers" => Schema::hasTable("markers"), "nodes" => Schema::hasTable("nodes"), "social_accounts" => Schema::hasTable("social_accounts")]);'
php artisan tinker --execute 'dump((new App\Models\OsmNode)->getConnectionName(), (new App\Models\OsmNode)->getTable(), App\Models\OsmNode::query()->count());'
```

All four table-presence values must be `false`; the model must report connection
`osm`, table `osm_current.application_alpr_nodes`, and a nonzero current row
count. Retain the marker file already validated during Phase 9A; Phase 9B does
not queue another refresh. Repeat the marker, hotlist, electronic-horizon, and
directions smoke tests against the deployed application.

The production Phase 9B migration removed all four application tables. The
post-migration reader check still resolved connection `osm` and view
`osm_current.application_alpr_nodes`, which returned 147,148 current rows. The
retained marker file was present, and the marker, hotlist, electronic-horizon,
and directions endpoints all returned HTTP 200. Phase 9B is complete.

There is no rollback for this approved drop. Do not run
`php artisan migrate:rollback` and do not deploy a Phase 8 application release
afterward. Any future need for these tables requires a new forward migration;
the legacy node rows would need to be reconstructed from the OSM source.

#### Phase 9C: remove obsolete configuration

The application artifact audit found no remaining runtime or `.env.example`
references to the retired settings. The `OSM2PGSQL_*` values under
`infrastructure/aws/osm/operations` configure the active OSM server pipeline;
they are not Laravel application settings and must remain.

Remove the retained values below from the Laravel site's Forge environment:
`OSM_READER_ENABLED`, `OVERPASS_INGESTION_ENABLED`,
`OSM_READER_MAXIMUM_SOURCE_AGE_MINUTES`, and application-local `OSM2PGSQL_*`
values. Also remove the retired backend
`OPENSTREETMAP_CLIENT_ID`, `OPENSTREETMAP_CLIENT_SECRET`,
`OPENSTREETMAP_REDIRECT_URI`, `MOBILE_AUTH_REDIRECT_SCHEMES`, and
`MOBILE_AUTH_CODE_EXPIRES_MINUTES` values. Retain `OPENSTREETMAP_API_URL` and
the OSM reader connection, table, host, port, database, SELECT-only username,
password, and SSL mode.

Inspect names only before editing; this command does not print values:

```bash
grep -E '^(OSM_READER_ENABLED|OVERPASS_INGESTION_ENABLED|OSM_READER_MAXIMUM_SOURCE_AGE_MINUTES|OSM2PGSQL_[A-Z0-9_]+|OPENSTREETMAP_CLIENT_ID|OPENSTREETMAP_CLIENT_SECRET|OPENSTREETMAP_REDIRECT_URI|MOBILE_AUTH_REDIRECT_SCHEMES|MOBILE_AUTH_CODE_EXPIRES_MINUTES)=' .env | cut -d= -f1 || true
```

After saving the Forge environment, rebuild Laravel's configuration cache and
verify only the active reader contract without printing credentials:

```bash
php artisan config:cache
php artisan config:show osm
php artisan tinker --execute 'dump(["connection" => config("osm.reader.connection"), "table" => config("osm.reader.table"), "api_url" => config("services.openstreetmap.api_url")]);'
```

`config:show osm` must contain only the reader connection and table. The final
values must be connection `osm`, table
`osm_current.application_alpr_nodes`, and API URL
`https://api.openstreetmap.org/api/0.6`. Repeat the four Phase 9B endpoint smoke
tests; no marker-file refresh is required.

Production configuration caching and the three-value reader check passed on
2026-08-28. The operator explicitly waived another endpoint smoke-test pass
after the successful Phase 9B checks. Phase 9C is complete.

#### Phase 9D: steady-state infrastructure

The initial read-only audit covers the first 23 hours after the global stack
reached steady state, including the application cutover at
2026-08-28T03:07:06Z:

- The database remains on `r7g.large`. Its peak hourly CPU average was 5.74%,
  the highest individual CPU sample was 14.40%, and peak memory use was 3.07%.
- The protected data volume remains a 512 GiB gp3 volume with 3,000 IOPS and
  250 MiB/s throughput. Current use is 0.86%, and steady-state use peaked at
  0.98%. Peak queue depth was 0.092. The conservative sum of the independent
  five-minute read/write peaks was 10.72 IOPS and 1.96 MiB/s.
- Shared-feed, current, and history lag stayed below 171 seconds. PostgreSQL
  remained healthy; current parity, cursor divergence, and retained-spool
  values are zero.
- All 17 alarms then named `daf-osm-*` were `OK`, with no state transitions
  since application cutover. Pre-cutover alarm transitions were limited to
  bootstrap telemetry startup and brief minute-update parity, spool, and cursor
  windows.
- The newest verified backup was 1,155 seconds old at audit time. The four
  retained dumps total about 175.5 MB and range from 42.6 MB to 46.5 MB. The
  35-day lifecycle configuration remains enabled.
- Before Phase 7 budget unification, the OSM-only budget reported $7.469 actual
  spend against $300; AWS had not yet produced a forecast for the new stack.
- The data host has empty work and local-backup directories. Its downloaded
  bootstrap state is 4 KiB, and old extracted runtime artifacts total only
  4.44 MB. Those artifacts are not worth a destructive production cleanup.
- The `osm_publisher` credential is the active SELECT-only Laravel reader even
  though its historical name is misleading. Do not remove its role, SSM
  parameters, or Laravel environment values.

The measured I/O load supports returning gp3 throughput to its included
125 MiB/s baseline while retaining the 3,000 IOPS baseline. The Terraform
default now expresses that in-place change. Keep the 512 GiB volume because EBS
cannot shrink it in place, and keep `r7g.large` until at least seven full days
of steady-state metrics and scheduled backups are available.

The audit initially found that the operator could inspect current alarm state
but not alarm history. The reviewed `DafOsmMonitoring` policy added scoped
`cloudwatch:DescribeAlarmHistory` permission in `v2` on 2026-08-28. Phase 7
policy version `v3`, published on 2026-09-02, scopes alarm management to the
unified shared-host, OSM, and PostgreSQL names and dashboard management to
`daf-infrastructure`. It has one attachment, and exact alarm-history reads
remain supported.

The reviewed monitoring policy file SHA-256 is
`dbea9550992718d548988ce31c0b924cc8605dcb9a31bd81fa694cc2d23a4f39`.
The saved Terraform plan SHA-256 is
`2463638123d0025a6f6ecd0be391e856f32e64c72a1e62f322cb805a3e3547ac`.
That plan contains zero creates, one in-place update, zero replacements, and
zero destroys. Its only action changes `aws_ebs_volume.data` throughput from
250 MiB/s to 125 MiB/s; every output is unchanged.

The exact saved plan was applied on 2026-08-28: zero resources were added, one
was changed in place, and zero were destroyed. The attached 512 GiB gp3 volume
now reports 125 MiB/s throughput and 3,000 IOPS. AWS entered its normal
background `optimizing` state with the target configuration already active.
A fresh Terraform plan reports no changes.

The immediate post-apply check found PostgreSQL and all four runtime timers or
agents active, all 17 alarms `OK`, and the metrics service successful. Shared,
current, and history lag were 66 seconds; backup age was 2,388 seconds; parity,
both cursor divergences, and retained spool were zero. The current and history
projections contained 147,164 and 238,006 rows, respectively.

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
- All `daf-infrastructure-*` alarms are `OK`.
- The current and forecast spend remain below the approved thresholds.
