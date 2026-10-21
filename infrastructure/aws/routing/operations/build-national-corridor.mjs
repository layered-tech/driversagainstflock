import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const bucket = 'daf-routing-graphs-326364278889-us-east-1';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const aws = (service, operation, ...args) =>
    execFileSync(
        'aws',
        [
            service,
            operation,
            '--profile',
            'daf-routing',
            '--region',
            'us-east-1',
            ...args,
        ],
        { encoding: 'utf8', env: { ...process.env, AWS_PAGER: '' } },
    ).trim();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function buildBundle() {
    const directory = path.join(root, 'corridor/v1.2.0');
    const assets = JSON.parse(
        readFileSync(path.join(directory, 'assets.json')),
    );
    const files = assets.map((asset) => {
        assert.match(asset.name, /^[A-Za-z0-9._-]+$/);
        const filename = path.join(directory, asset.name);
        assert.equal(hash(readFileSync(filename)), asset.sha256);
        return { name: asset.name, filename, sha256: asset.sha256 };
    });
    for (const name of [
        'build-national-source.sh',
        'national-build-diagnostics.sh',
    ]) {
        const filename = path.join(root, name);
        files.push({ name, filename, sha256: hash(readFileSync(filename)) });
    }
    return files;
}

export async function launch(args = process.argv.slice(2)) {
    let release =
        new Date()
            .toISOString()
            .replace(/[-:]/g, '')
            .replace(/\.\d{3}Z$/, 'Z') + '-us-v1';
    let pbf, md5;
    const dryRun = args.includes('--dry-run'),
        yes = args.includes('--yes');
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--release-id') release = args[++i];
        else if (args[i] === '--pbf-name') pbf = args[++i];
        else if (args[i] === '--pbf-md5') md5 = args[++i];
        else
            assert.ok(
                ['--dry-run', '--yes'].includes(args[i]),
                `Unknown argument: ${args[i]}`,
            );
    }
    assert.match(release, /^\d{8}T\d{6}Z-us-v\d+$/);
    assert.equal(
        Boolean(pbf),
        Boolean(md5),
        'Provide source name and checksum together',
    );
    if (!pbf) {
        const html = execFileSync(
            'curl',
            [
                '--fail',
                '--silent',
                '--show-error',
                '--max-time',
                '30',
                'https://download.geofabrik.de/north-america/us.html',
            ],
            { encoding: 'utf8' },
        );
        pbf = [...new Set(html.match(/us-\d{6}\.osm\.pbf\.md5/g) ?? [])]
            .sort()
            .at(-1)
            ?.replace(/\.md5$/, '');
        assert.ok(pbf, 'No immutable national source found');
        md5 = execFileSync(
            'curl',
            [
                '--fail',
                '--silent',
                '--show-error',
                '--max-time',
                '30',
                `https://download.geofabrik.de/north-america/${pbf}.md5`,
            ],
            { encoding: 'utf8' },
        )
            .trim()
            .split(/\s+/)[0]
            .toLowerCase();
    }
    assert.match(pbf, /^us-\d{6}\.osm\.pbf$/);
    assert.match(md5, /^[a-f0-9]{32}$/);
    const files = buildBundle();
    const prefix = `experimental/road-corridors/operations/${release}/national`;
    console.log(
        JSON.stringify({
            release,
            source: pbf,
            md5,
            prefix,
            operation: 'national-corridors-only',
            dryRun,
        }),
    );
    if (dryRun) return;
    assert.ok(yes, 'Use --yes to authorize the billable temporary builder');
    assert.equal(
        aws(
            'sts',
            'get-caller-identity',
            '--query',
            'Account',
            '--output',
            'text',
        ),
        '326364278889',
    );
    const existing = JSON.parse(
        aws(
            'ec2',
            'describe-instances',
            '--filters',
            'Name=tag:Name,Values=daf-routing-builder',
            'Name=instance-state-name,Values=pending,running,stopping,stopped',
            '--query',
            'Reservations[].Instances[].InstanceId',
            '--output',
            'json',
        ),
    );
    assert.deepEqual(existing, [], 'Another builder already exists');
    execFileSync('curl', [
        '--fail',
        '--silent',
        '--show-error',
        '--head',
        '--connect-timeout',
        '10',
        '--max-time',
        '30',
        `https://download.geofabrik.de/north-america/${pbf}`,
    ]);
    const template = JSON.parse(
        aws(
            'ec2',
            'describe-launch-template-versions',
            '--launch-template-name',
            'daf-routing-builder',
            '--versions',
            '$Default',
            '--output',
            'json',
        ),
    ).LaunchTemplateVersions[0];
    assert.equal(
        template.LaunchTemplateData.InstanceType,
        'r8g.4xlarge',
        'Builder type changed; review launch configuration',
    );
    const launchArgs = [
        '--launch-template',
        `LaunchTemplateName=daf-routing-builder,Version=${template.VersionNumber}`,
        '--count',
        '1',
        '--client-token',
        `daf-national-${release}`,
        '--instance-initiated-shutdown-behavior',
        'terminate',
        '--user-data',
        readFileSync(path.join(root, 'builder-user-data.sh'), 'utf8'),
        '--tag-specifications',
        'ResourceType=instance,Tags=[{Key=Name,Value=daf-routing-builder},{Key=Project,Value=daf-routing},{Key=Environment,Value=production},{Key=ManagedBy,Value=terraform}]',
        'ResourceType=volume,Tags=[{Key=Name,Value=daf-routing-builder-temporary},{Key=Project,Value=daf-routing},{Key=Environment,Value=production},{Key=ManagedBy,Value=terraform}]',
        '--query',
        'Instances[0].InstanceId',
        '--output',
        'text',
    ];
    try {
        aws('ec2', 'run-instances', ...launchArgs, '--dry-run');
        throw new Error('Dry run unexpectedly launched');
    } catch (error) {
        assert.match(
            String(error.stderr),
            /DryRunOperation/,
            'Builder launch permission check failed',
        );
    }
    for (const file of files)
        aws(
            's3api',
            'put-object',
            '--bucket',
            bucket,
            '--key',
            `${prefix}/${file.name}`,
            '--body',
            file.filename,
            '--server-side-encryption',
            'AES256',
            '--if-none-match',
            '*',
        );
    const instance = aws('ec2', 'run-instances', ...launchArgs);
    assert.match(instance, /^i-[a-f0-9]{17}$/);
    const statusDirectory = mkdtempSync(
        path.join(tmpdir(), 'daf-national-launch-'),
    );
    const statusFile = path.join(statusDirectory, 'launch.json');
    const status = {
        release,
        source: pbf,
        md5,
        instance,
        prefix,
        started_at: new Date().toISOString(),
    };
    writeFileSync(statusFile, JSON.stringify(status, null, 2));
    console.log(`Builder launched: ${instance}; local status: ${statusFile}`);
    let handedOff = false;
    try {
        let volume,
            online = false;
        for (let attempt = 0; attempt < 120; attempt++) {
            volume = aws(
                'ec2',
                'describe-volumes',
                '--filters',
                `Name=attachment.instance-id,Values=${instance}`,
                'Name=attachment.device,Values=/dev/sdf',
                '--query',
                'Volumes[0].VolumeId',
                '--output',
                'text',
            );
            const ping = aws(
                'ssm',
                'describe-instance-information',
                '--filters',
                `Key=InstanceIds,Values=${instance}`,
                '--query',
                'InstanceInformationList[0].PingStatus',
                '--output',
                'text',
            );
            if (/^vol-[a-f0-9]{17}$/.test(volume) && ping === 'Online') {
                online = true;
                break;
            }
            await pause(5000);
        }
        assert.ok(online, 'Builder did not become available through SSM');
        const commands = [
            'set -euo pipefail',
            "trap 'shutdown -h +1' EXIT",
            'while [[ ! -f /var/lib/cloud/instance/boot-finished ]]; do sleep 2; done',
            'systemctl is-active --quiet daf-routing-builder-expiry.timer',
            'systemctl is-active --quiet amazon-cloudwatch-agent',
            'install -d -m 0700 /var/lib/daf-routing-build/national',
            'cd /var/lib/daf-routing-build/national',
            ...files.flatMap((file) => [
                `aws s3 cp --region us-east-1 --no-progress s3://${bucket}/${prefix}/${file.name} ${file.name}`,
                `printf '%s  %s\\n' '${file.sha256}' '${file.name}' | sha256sum --check --status`,
            ]),
            `bash build-national-source.sh ${volume} ${release} ${pbf} ${md5}`,
        ];
        const command = aws(
            'ssm',
            'send-command',
            '--instance-ids',
            instance,
            '--document-name',
            'AWS-RunShellScript',
            '--timeout-seconds',
            '60',
            '--parameters',
            JSON.stringify({ executionTimeout: ['43200'], commands }),
            '--cloud-watch-output-config',
            'CloudWatchOutputEnabled=true,CloudWatchLogGroupName=/daf-routing/builder',
            '--query',
            'Command.CommandId',
            '--output',
            'text',
        );
        assert.match(command, /^[a-f0-9-]{36}$/);
        handedOff = true;
        Object.assign(status, { command, volume, status: 'running' });
        writeFileSync(statusFile, JSON.stringify(status, null, 2));
        const s3Key = `experimental/road-corridors/${release}/us/launch.json`;
        aws(
            's3api',
            'put-object',
            '--bucket',
            bucket,
            '--key',
            s3Key,
            '--body',
            statusFile,
            '--server-side-encryption',
            'AES256',
        );
        console.log(JSON.stringify(status));
        return status;
    } finally {
        if (!handedOff)
            aws(
                'ec2',
                'terminate-instances',
                '--instance-ids',
                instance,
                '--output',
                'json',
            );
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    await launch();
