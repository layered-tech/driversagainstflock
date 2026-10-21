import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const launcher = fileURLToPath(
    new URL('../build-national-corridor.mjs', import.meta.url),
);
const args = [
    launcher,
    '--yes',
    '--release-id',
    '20261021T040000Z-us-v1',
    '--pbf-name',
    'us-261020.osm.pbf',
    '--pbf-md5',
    'a'.repeat(32),
];
function fixture(t) {
    const directory = mkdtempSync(path.join(tmpdir(), 'national-launch-test-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const log = path.join(directory, 'calls'),
        parameters = path.join(directory, 'parameters');
    writeFileSync(
        path.join(directory, 'curl'),
        '#!/bin/bash\nexit "${SOURCE_TEST_FAILURE:-0}"\n',
        { mode: 0o755 },
    );
    writeFileSync(
        path.join(directory, 'aws'),
        `#!/usr/bin/env python3
import sys,json,os
args=sys.argv[1:]
with open(os.environ['AWS_TEST_LOG'],'a') as f: f.write(json.dumps(args)+'\\n')
if args[:2]==['sts','get-caller-identity']: print('326364278889')
elif args[:2]==['ec2','describe-instances']: print('[]')
elif args[:2]==['ec2','describe-launch-template-versions']: print(json.dumps({'LaunchTemplateVersions':[{'VersionNumber':8,'LaunchTemplateData':{'InstanceType':'r8g.4xlarge'}}]}))
elif args[:2]==['ec2','run-instances'] and '--dry-run' in args:
 print('DryRunOperation: allowed',file=sys.stderr); sys.exit(255)
elif args[:2]==['ec2','run-instances']: print('i-0123456789abcdef0')
elif args[:2]==['ec2','describe-volumes']: print('vol-0123456789abcdef0')
elif args[:2]==['ssm','describe-instance-information']: print('Online')
elif args[:2]==['ssm','send-command']:
 if os.environ.get('SSM_TEST_FAILURE')=='1': sys.exit(1)
 with open(os.environ['AWS_TEST_PARAMETERS'],'w') as f: f.write(args[args.index('--parameters')+1])
 print('00000000-0000-0000-0000-000000000000')
`,
        { mode: 0o755 },
    );
    return {
        log,
        parameters,
        env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            AWS_TEST_LOG: log,
            AWS_TEST_PARAMETERS: parameters,
        },
    };
}
test('national launcher pins inputs and hands off only corridor work with automatic cleanup', (t) => {
    const f = fixture(t);
    const result = spawnSync(process.execPath, args, {
        env: f.env,
        encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const calls = readFileSync(f.log, 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse);
    const parameters = JSON.parse(readFileSync(f.parameters));
    assert.equal(
        spawnSync('bash', ['-n'], { input: parameters.commands.join('\n') })
            .status,
        0,
    );
    assert.ok(
        parameters.commands
            .at(-1)
            .startsWith('bash build-national-source.sh vol-'),
    );
    assert.ok(
        parameters.commands.some((cmd) => cmd.includes('shutdown -h +1')),
    );
    assert.ok(
        parameters.commands.every(
            (cmd) => !/deploy-graph|scheduled-builder|put-parameter/.test(cmd),
        ),
    );
    const pin = parameters.commands.find((cmd) =>
        cmd.includes('sha256sum --check'),
    );
    const signatureCheck = spawnSync(
        'bash',
        ['-c', pin.replace('| sha256sum --check --status', '')],
        { encoding: 'utf8' },
    );
    assert.ok(
        signatureCheck.stdout.endsWith('\n'),
        'Checksum input must end with a real newline',
    );
    assert.ok(
        !signatureCheck.stdout.includes('\\n'),
        'Checksum input must not contain a literal escape',
    );
    assert.ok(calls.some((call) => call.includes('--dry-run')));
    assert.ok(!calls.some((call) => call.includes('terminate-instances')));
    assert.ok(
        calls.filter((call) => call.includes('--if-none-match')).length >= 8,
    );
});
test('national launch fails before provisioning when the pinned source is unavailable', (t) => {
    const f = fixture(t);
    const result = spawnSync(process.execPath, args, {
        env: { ...f.env, SOURCE_TEST_FAILURE: '22' },
        encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.ok(!readFileSync(f.log, 'utf8').includes('run-instances'));
});
test('national launch terminates its temporary builder if the SSM handoff fails', (t) => {
    const f = fixture(t);
    const result = spawnSync(process.execPath, args, {
        env: { ...f.env, SSM_TEST_FAILURE: '1' },
        encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.ok(readFileSync(f.log, 'utf8').includes('terminate-instances'));
});
test('dry run validates the pinned bundle without accessing AWS', (t) => {
    const f = fixture(t);
    const result = spawnSync(process.execPath, [...args, '--dry-run'], {
        env: f.env,
        encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.throws(() => readFileSync(f.log));
});
