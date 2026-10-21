import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function awsStore(bucket, workDirectory, execute = execFileSync) {
    const aws = (args) =>
        execute('aws', ['--region', 'us-east-1', ...args], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    return {
        putTilesVerified(directory, readbackDirectory, prefix) {
            execute(
                'python3',
                [
                    fileURLToPath(
                        new URL('./publish-tiles.py', import.meta.url),
                    ),
                    bucket,
                    directory,
                    readbackDirectory,
                    prefix,
                ],
                {
                    stdio: 'inherit',
                },
            );
        },
        putImmutable(key, filename) {
            try {
                aws([
                    's3api',
                    'put-object',
                    '--bucket',
                    bucket,
                    '--key',
                    key,
                    '--body',
                    filename,
                    '--if-none-match',
                    '*',
                    '--content-type',
                    key.endsWith('.gz')
                        ? 'application/gzip'
                        : 'application/json',
                ]);
            } catch (error) {
                if (!String(error.stderr).includes('(PreconditionFailed)'))
                    throw error;
                // The mandatory subsequent readback checks existing immutable bytes too.
            }
        },
        get(key, filename) {
            aws([
                's3api',
                'get-object',
                '--bucket',
                bucket,
                '--key',
                key,
                filename,
            ]);
        },
        getPointer(key) {
            const file = path.join(workDirectory, 'current.json');
            try {
                const metadata = JSON.parse(
                    aws([
                        's3api',
                        'get-object',
                        '--bucket',
                        bucket,
                        '--key',
                        key,
                        file,
                    ]),
                );
                return {
                    value: JSON.parse(readFileSync(file)),
                    etag: metadata.ETag,
                };
            } catch (error) {
                if (String(error.stderr).includes('(NoSuchKey)')) return null;
                throw error;
            }
        },
        compareAndSwap(key, value, etag) {
            const file = path.join(workDirectory, 'next.json');
            writeFileSync(file, JSON.stringify(value));
            aws([
                's3api',
                'put-object',
                '--bucket',
                bucket,
                '--key',
                key,
                '--body',
                file,
                '--content-type',
                'application/json',
                ...(etag ? ['--if-match', etag] : ['--if-none-match', '*']),
            ]);
        },
    };
}
