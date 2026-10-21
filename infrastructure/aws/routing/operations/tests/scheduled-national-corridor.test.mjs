import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { hash } from '../corridor/v1.3.0/regional-catalogs.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = path.join(root, 'corridor/v1.3.0');
const workflow = readFileSync(
    path.join(root, 'scheduled-builder/v1.3.0/run-build.sh'),
    'utf8',
);
const stage = workflow.slice(
    workflow.indexOf('run_national_corridor_operation()'),
    workflow.indexOf('CURRENT_STAGE="deployment"'),
);

for (const unsafe of [false, true]) {
    test(`reviewed runner ${unsafe ? 'saves failure evidence without publishing unsafe exclusions' : 'publishes bounded exclusions and finishes diagnostics'}`, (t) => {
        const directory = mkdtempSync(path.join(tmpdir(), 'reviewed-runner-'));
        t.after(() => rmSync(directory, { recursive: true, force: true }));
        const mount = path.join(directory, 'mount');
        const release = '20261021T142248Z-us-v1';
        const output = path.join(mount, `output/national-corridor-${release}`);
        mkdirSync(output, { recursive: true });
        let records = readFileSync(
            new URL(
                './fixtures/us-261020-source-geometry.jsonl',
                import.meta.url,
            ),
            'utf8',
        )
            .trimEnd()
            .split('\n')
            .map(JSON.parse);
        if (unsafe)
            records[0].source_coordinates[records[0].node_index][0] +=
                0.0000001;
        const evidence = Buffer.from(
            records.map(JSON.stringify).join('\n') + '\n',
        );
        writeFileSync(path.join(output, 'source-geometry.jsonl'), evidence);
        writeFileSync(
            path.join(output, 'manifest.json'),
            JSON.stringify({
                source: { name: 'us-261020.osm.pbf', md5: 'a'.repeat(32) },
                record_count: 31935978,
                invalid_source_geometry_count: records.length,
                quarantine: {
                    key: 'source-geometry.jsonl',
                    record_count: records.length,
                    sha256: hash(evidence),
                },
            }),
        );
        for (const name of [
            'automatic-source-geometry-review.mjs',
            'source-geometry-review.mjs',
            'regional-catalogs.mjs',
        ])
            copyFileSync(path.join(bundle, name), path.join(directory, name));
        writeFileSync(
            path.join(directory, 'runner.sh'),
            readFileSync(
                path.join(bundle, 'run-reviewed-corridor.sh'),
                'utf8',
            ).replace(
                'readonly MOUNT=/mnt/daf-build',
                `readonly MOUNT="${mount}"`,
            ),
        );
        writeFileSync(
            path.join(directory, 'run-corridor.sh'),
            '#!/bin/bash\n[[ "$NATIONAL_CORRIDOR_EXPORT_ONLY" == 1 ]]\n',
        );
        writeFileSync(
            path.join(directory, 'national-build-diagnostics.sh'),
            `start_build_diagnostics() { mkdir -p "$1"; }\nupload_build_diagnostics() { return 0; }\nfinish_build_diagnostics() { echo "DIAGNOSTICS_FINISHED:$1:$2"; }\n`,
        );
        writeFileSync(
            path.join(directory, 'publish-and-promote.mjs'),
            `import fs from 'node:fs'; import {validateSourceGeometry} from './source-geometry-review.mjs'; const [directory,,,,,reviewFile]=process.argv.slice(2); const manifest=JSON.parse(fs.readFileSync(directory+'/manifest.json')); validateSourceGeometry(directory,manifest,JSON.parse(fs.readFileSync(reviewFile))); console.log('PUBLICATION_COMPLETE');`,
        );
        const bin = path.join(directory, 'bin');
        mkdirSync(bin);
        writeFileSync(path.join(bin, 'aws'), '#!/bin/bash\nexit 0\n', {
            mode: 0o755,
        });
        const result = spawnSync(
            'bash',
            [
                path.join(directory, 'runner.sh'),
                release,
                'us-261020.osm.pbf',
                'a'.repeat(32),
            ],
            {
                env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
                encoding: 'utf8',
                timeout: 10000,
            },
        );
        assert.ifError(result.error);
        const status = JSON.parse(
            readFileSync(path.join(directory, 'build-status.json')),
        );
        assert.equal(
            hash(
                readFileSync(
                    path.join(directory, 'diagnostics/source-geometry.jsonl'),
                ),
            ),
            hash(evidence),
        );
        if (unsafe) {
            assert.notEqual(result.status, 0);
            assert.equal(status.phase, 'failed-reviewing-source-geometry');
            assert.match(
                result.stdout,
                /DIAGNOSTICS_FINISHED:1:reviewing-source-geometry/,
            );
            assert.doesNotMatch(result.stdout, /PUBLICATION_COMPLETE/);
        } else {
            assert.equal(result.status, 0, result.stdout + result.stderr);
            assert.equal(status.phase, 'published');
            assert.match(result.stdout, /PUBLICATION_COMPLETE/);
            assert.match(result.stdout, /DIAGNOSTICS_FINISHED:0:published/);
            assert.equal(
                JSON.parse(
                    readFileSync(
                        path.join(
                            directory,
                            'diagnostics/geometry-review.json',
                        ),
                    ),
                ).impact.excluded_ways,
                10,
            );
        }
    });
}

test('scheduled builder and Terraform use the complete checksum-pinned reviewed bundle', () => {
    const assetsBytes = readFileSync(path.join(bundle, 'assets.json'));
    const assets = JSON.parse(assetsBytes);
    for (const asset of assets) {
        assert.equal(asset.key, `operations/corridor/v1.3.0/${asset.name}`);
        assert.equal(
            asset.sha256,
            hash(readFileSync(path.join(bundle, asset.name))),
        );
    }
    for (const name of [
        'run-reviewed-corridor.sh',
        'automatic-source-geometry-review.mjs',
        'publish-tiles.py',
        'national-build-diagnostics.sh',
    ]) {
        assert.ok(assets.some((asset) => asset.name === name));
    }
    assert.ok(
        workflow.includes(
            `NATIONAL_CORRIDOR_ASSETS_SHA256="${hash(assetsBytes)}"`,
        ),
    );
    assert.match(workflow, /operations\/corridor\/v1\.3\.0\/\*/);
    const bootstrap = readFileSync(
        path.join(root, 'scheduled-builder-national-user-data.sh'),
        'utf8',
    );
    assert.ok(bootstrap.includes('BOOTSTRAP_VERSION="v1.3.0"'));
    assert.ok(
        bootstrap.includes(`BOOTSTRAP_SHA256="${hash(Buffer.from(workflow))}"`),
    );
    const operations = readFileSync(
        path.join(root, '../operations.tf'),
        'utf8',
    );
    assert.match(
        operations,
        /operations\/scheduled-builder\/v1\.3\.0\/run-build.sh/,
    );
    for (const asset of assets)
        assert.ok(operations.includes(`"${asset.name}"`));
    assert.match(operations, /operations\/corridor\/v1\.3\.0\/\$\{name\}/);
    assert.match(
        readFileSync(path.join(root, '../schedule_variables.tf'), 'utf8'),
        /variable "national_corridor_builds_enabled"\s*\{[^}]*default\s*=\s*true/s,
    );
});

for (const mode of ['clean', 'quarantine', 'failed', 'download-failed']) {
    test(`scheduled national stage ${mode} preserves routing and reports its outcome`, (t) => {
        const directory = mkdtempSync(
            path.join(tmpdir(), 'scheduled-national-'),
        );
        t.after(() => rmSync(directory, { recursive: true, force: true }));
        const source = path.join(directory, 'source');
        mkdirSync(source);
        const command = `#!/bin/bash\nset -e\n[[ "$TEST_MODE" != failed ]] || exit 42\nprintf '%s' '{"impact":{"excluded_ways":${mode === 'quarantine' ? 10 : 0},"total_length_meters":6900.3}}' > "$(dirname "$0")/geometry-review.json"\necho PUBLICATION_COMPLETE\n`;
        writeFileSync(path.join(source, 'run-reviewed-corridor.sh'), command);
        writeFileSync(
            path.join(source, 'assets.json'),
            JSON.stringify([
                {
                    name: 'run-reviewed-corridor.sh',
                    key: 'operations/corridor/v1.3.0/run-reviewed-corridor.sh',
                    sha256: hash(Buffer.from(command)),
                },
            ]),
        );
        const script = `set -eu
OPERATION_ROOT="$1"; SOURCE="$1/source"; TEST_MODE="$2"; export TEST_MODE
NATIONAL_CORRIDOR_ASSETS_KEY=assets; NATIONAL_CORRIDOR_ASSETS_SHA256=hash
RELEASE_ID=release; PBF_NAME=source; PBF_MD5=hash; FAILURE_NOTIFIED=false
AWS_REGION=us-east-1; ALERTS_TOPIC_ARN=topic; ARTIFACT_BUCKET=bucket
download_operation() {
    [[ "$TEST_MODE" != download-failed ]] || return 47
    if [[ "$1" == assets ]]; then cp "$SOURCE/assets.json" "$2"; else cp "$SOURCE/run-reviewed-corridor.sh" "$2"; fi
}
write_cloudwatch_event() { echo "EVENT:$1 $2"; }
notify_failure() { echo "FAILURE:$1 $2"; }
aws() { echo "QUARANTINE_NOTIFICATION" >> "$OPERATION_ROOT/notifications"; }
${stage}
echo ROUTING_CONTINUES
`;
        const result = spawnSync('bash', ['-c', script, '_', directory, mode], {
            encoding: 'utf8',
            timeout: 10000,
        });
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /ROUTING_CONTINUES/);
        if (mode === 'failed' || mode === 'download-failed') {
            assert.match(
                result.stdout,
                /FAILURE:national_corridor_failed previous-release-retained/,
            );
            assert.doesNotMatch(
                result.stdout,
                /EVENT:national_corridor_published/,
            );
        } else {
            assert.match(result.stdout, /EVENT:national_corridor_published/);
            assert.doesNotMatch(result.stdout, /FAILURE:/);
            if (mode === 'quarantine') {
                assert.match(
                    result.stdout,
                    /EVENT:national_corridor_quarantined source-ways-10/,
                );
                assert.match(
                    readFileSync(path.join(directory, 'notifications'), 'utf8'),
                    /QUARANTINE_NOTIFICATION/,
                );
            }
        }
    });
}

for (const unsafe of [false, true]) {
    test(`automatic review CLI ${unsafe ? 'blocks exporter collapse before publication' : 'writes a validated source-bound policy'}`, (t) => {
        const directory = mkdtempSync(
            path.join(tmpdir(), 'automatic-review-cli-'),
        );
        t.after(() => rmSync(directory, { recursive: true, force: true }));
        const record = {
            osm_way_id: 123,
            reason: 'coincident_distinct_nodes',
            node_index: 1,
            node_ids: [1, 2],
            source_coordinates: [
                [-89, 43],
                [-89 + (unsafe ? 0.0000001 : 0), 43],
            ],
        };
        const bytes = Buffer.from(JSON.stringify(record) + '\n');
        writeFileSync(path.join(directory, 'source-geometry.jsonl'), bytes);
        writeFileSync(
            path.join(directory, 'manifest.json'),
            JSON.stringify({
                record_count: 1000000,
                source: { name: 'us-261020.osm.pbf', md5: 'a'.repeat(32) },
                invalid_source_geometry_count: 1,
                quarantine: {
                    key: 'source-geometry.jsonl',
                    sha256: hash(bytes),
                    record_count: 1,
                },
            }),
        );
        const review = path.join(directory, 'geometry-review.json');
        const script = `set -eu\nnode "$1" "$2" "$3"\necho PUBLICATION_ALLOWED`;
        const result = spawnSync(
            'bash',
            [
                '-c',
                script,
                '_',
                path.join(bundle, 'automatic-source-geometry-review.mjs'),
                directory,
                review,
            ],
            { encoding: 'utf8' },
        );
        if (unsafe) {
            assert.notEqual(result.status, 0);
            assert.doesNotMatch(result.stdout, /PUBLICATION_ALLOWED/);
            assert.match(result.stderr, /investigate exporter precision/);
        } else {
            assert.equal(result.status, 0, result.stderr);
            assert.match(result.stdout, /PUBLICATION_ALLOWED/);
            assert.equal(
                JSON.parse(readFileSync(review)).impact.excluded_ways,
                1,
            );
        }
    });
}
