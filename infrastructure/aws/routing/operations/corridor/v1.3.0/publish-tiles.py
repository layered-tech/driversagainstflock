#!/usr/bin/env python3
"""Publish immutable tiles with bounded concurrency and verify every readback."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


def checksum(filename):
    result = hashlib.sha256()
    with filename.open('rb') as contents:
        for chunk in iter(lambda: contents.read(65536), b''):
            result.update(chunk)
    return result.hexdigest()


def main():
    bucket, directory, readback, prefix = sys.argv[1:]
    directory, readback = Path(directory), Path(readback)
    tiles = json.loads((directory / 'manifest.json').read_text())['tiles']

    def aws(*args):
        return subprocess.run(
            ['aws', '--region', 'us-east-1', '--cli-connect-timeout', '10',
             '--cli-read-timeout', '30', *args],
            env={**os.environ, 'AWS_MAX_ATTEMPTS': '3'},
            capture_output=True, text=True, timeout=180,
        )

    def publish(tile):
        key = tile['key']
        if key != 'tiles/' + tile['id'] + '-' + tile['sha256'] + '.jsonl.gz' or '..' in key:
            raise ValueError('Invalid tile key: ' + key)
        source, target = directory / key, readback / key
        if checksum(source) != tile['sha256']:
            raise ValueError('Source checksum mismatch: ' + key)
        result = aws('s3api', 'put-object', '--bucket', bucket, '--key', prefix + key,
                     '--body', str(source), '--if-none-match', '*', '--content-type', 'application/gzip')
        if result.returncode and '(PreconditionFailed)' not in result.stderr:
            raise RuntimeError(key + ': ' + result.stderr)
        target.parent.mkdir(parents=True, exist_ok=True)
        result = aws('s3api', 'get-object', '--bucket', bucket, '--key', prefix + key, str(target))
        if result.returncode:
            raise RuntimeError(key + ': ' + result.stderr)
        if target.stat().st_size != tile['size_bytes'] or checksum(target) != tile['sha256']:
            raise ValueError('Readback checksum mismatch: ' + key)

    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        for start in range(0, len(tiles), 64):
            list(executor.map(publish, tiles[start:start + 64]))
            count = min(start + 64, len(tiles))
            if count % 512 == 0 or count == len(tiles):
                print('PUBLISH_TILES verified=' + str(count) + ' total=' + str(len(tiles)), flush=True)


if __name__ == '__main__':
    main()
