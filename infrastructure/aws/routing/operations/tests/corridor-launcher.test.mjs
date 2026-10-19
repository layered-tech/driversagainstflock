import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const launcher = fileURLToPath(
    new URL('../build-corridor-graph.sh', import.meta.url),
);
test('experimental launch pins every input, cannot deploy, and hands off cleanup', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'corridor-launch-'));
    try {
        const log = path.join(directory, 'calls');
        const parameters = path.join(directory, 'parameters');
        writeFileSync(path.join(directory, 'exporter.jar'), 'fixture');
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
elif args[:2]==['ec2','describe-instances']: print('')
elif args[:2]==['ec2','run-instances']: print('i-0123456789abcdef0')
elif args[:2]==['ec2','describe-volumes']: print('vol-0123456789abcdef0')
elif args[:2]==['ssm','describe-instance-information']: print('Online')
elif args[:2]==['ssm','send-command']:
 with open(os.environ['AWS_TEST_PARAMETERS'],'w') as f: f.write(args[args.index('--parameters')+1])
 print('00000000-0000-0000-0000-000000000000')
elif args[:2]==['s3','cp'] and args[-1]=='-': print('{}')
`,
            { mode: 0o755 },
        );
        const result = spawnSync(
            'bash',
            [
                launcher,
                '--yes',
                '--detach',
                '--exporter-jar',
                path.join(directory, 'exporter.jar'),
                '--release-id',
                '20261018T120000Z-us-v1',
                '--pbf-name',
                'us-261017.osm.pbf',
                '--pbf-md5',
                'a'.repeat(32),
            ],
            {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    PATH: `${directory}:${process.env.PATH}`,
                    AWS_TEST_LOG: log,
                    AWS_TEST_PARAMETERS: parameters,
                },
            },
        );
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const calls = readFileSync(log, 'utf8')
            .trim()
            .split('\n')
            .map(JSON.parse);
        const commands = JSON.parse(readFileSync(parameters, 'utf8')).commands;
        const syntax = spawnSync('bash', ['-n'], {
            input: commands.join('\n'),
            encoding: 'utf8',
        });
        assert.equal(syntax.status, 0, syntax.stderr);
        assert.equal(
            commands.filter((command) => command.includes('sha256sum --check'))
                .length,
            3,
        );
        assert.ok(
            commands.some((command) =>
                command.includes('--corridor-exporter-sha256'),
            ),
        );
        assert.ok(
            commands.some((command) => command.includes('shutdown -h +1')),
        );
        assert.ok(
            commands.every(
                (command) =>
                    !/deploy-graph|scheduled-builder|put-parameter/.test(
                        command,
                    ),
            ),
        );
        assert.ok(
            calls.every(
                (call) =>
                    !call.includes('terminate-instances') &&
                    !call.includes('put-parameter'),
            ),
        );
        const uploads = calls.filter(
            (call) => call[0] === 's3api' && call[1] === 'put-object',
        );
        assert.equal(uploads.length, 3);
        assert.ok(
            uploads.every(
                (call) =>
                    call.includes('--if-none-match') &&
                    call[call.indexOf('--key') + 1].startsWith('experimental/'),
            ),
        );
        assert.ok(
            !readFileSync(log, 'utf8').includes(
                '"operations/active-build.json"',
            ),
        );
        writeFileSync(log, '');
        const unavailable = spawnSync(
            'bash',
            [
                launcher,
                '--yes',
                '--detach',
                '--exporter-jar',
                path.join(directory, 'exporter.jar'),
                '--release-id',
                '20261018T120000Z-us-v1',
                '--pbf-name',
                'us-261017.osm.pbf',
                '--pbf-md5',
                'a'.repeat(32),
            ],
            {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    PATH: `${directory}:${process.env.PATH}`,
                    AWS_TEST_LOG: log,
                    AWS_TEST_PARAMETERS: parameters,
                    SOURCE_TEST_FAILURE: '28',
                },
            },
        );
        assert.notEqual(unavailable.status, 0);
        assert.ok(!readFileSync(log, 'utf8').includes('run-instances'));
        assert.ok(!readFileSync(log, 'utf8').includes('put-object'));
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
