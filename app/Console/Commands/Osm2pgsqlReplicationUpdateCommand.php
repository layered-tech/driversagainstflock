<?php

namespace App\Console\Commands;

use App\Models\OsmNode;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Throwable;

class Osm2pgsqlReplicationUpdateCommand extends Command
{
    public const OPERATION_LOCK_KEY = 'osm2pgsql:operation';

    private const REQUIRED_IMPORT_COLUMNS = [
        'node_id',
        'latitude',
        'longitude',
        'tags',
        'surveillance_type',
        'direction',
        'camera_direction',
        'osm_updated_at',
        'osm_version',
        'osm_changeset_id',
        'osm_user',
        'osm_uid',
    ];

    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:osm2pgsql:update';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Apply queued OSM replication updates through osm2pgsql';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        if (! config('osm2pgsql.enabled')) {
            $this->info('osm2pgsql updates are disabled.');

            return self::SUCCESS;
        }

        $lock = Cache::lock(self::OPERATION_LOCK_KEY, $this->operationLockSeconds());

        if (! $lock->get()) {
            $this->warn('Another osm2pgsql operation is already running; skipping update.');

            return self::SUCCESS;
        }

        try {
            try {
                $result = Process::timeout($this->processTimeoutSeconds())
                    ->env($this->postgresEnvironment())
                    ->run(
                        $this->replicationCommand(),
                        function (string $type, string $output): void {
                            $this->writeProcessOutput($type, $output);
                        },
                    );
            } catch (Throwable $exception) {
                Log::error('osm2pgsql replication update process failed before completion.', [
                    'error' => $exception->getMessage(),
                ]);

                $this->error('osm2pgsql replication update failed before completion.');
                $this->error($exception->getMessage());

                return self::FAILURE;
            }

            if ($result->failed()) {
                Log::error('osm2pgsql replication update failed.', [
                    'exit_code' => $result->exitCode(),
                    'stdout' => $result->output(),
                    'stderr' => $result->errorOutput(),
                ]);

                $this->error('osm2pgsql replication update failed.');

                if ($result->errorOutput() !== '') {
                    $this->error($result->errorOutput());
                }

                return self::FAILURE;
            }

            $this->info('osm2pgsql replication update completed.');

            if (! $this->hasRequiredImportColumns()) {
                return self::FAILURE;
            }

            try {
                $mirrorResult = $this->mirrorNodes();
            } catch (Throwable $exception) {
                Log::error('osm2pgsql node SQL mirror failed.', [
                    'table' => $this->importTable(),
                    'error' => $exception->getMessage(),
                ]);

                $this->error('osm2pgsql node SQL mirror failed.');
                $this->error($exception->getMessage());

                return self::FAILURE;
            }

            if ($mirrorResult === null) {
                return self::FAILURE;
            }

            $this->info(sprintf(
                'Mirrored %d osm2pgsql nodes into %s and deleted %d stale nodes.',
                $mirrorResult['mirrored'],
                $this->nodesTable(),
                $mirrorResult['deleted'],
            ));

            return self::SUCCESS;
        } finally {
            $lock->release();
        }
    }

    /**
     * @return array<int, string>
     */
    private function replicationCommand(): array
    {
        $command = [
            (string) config('osm2pgsql.replication_binary'),
            'update',
            '--verbose',
            '-d',
            (string) config('osm2pgsql.database'),
            '--',
            '--verbose',
            '--append',
            '--slim',
            '--extra-attributes',
            '--output=flex',
            '--style='.$this->absoluteStylePath(),
        ];

        $flatNodes = config('osm2pgsql.flat_nodes');

        if (is_string($flatNodes) && trim($flatNodes) !== '') {
            $command[] = '--flat-nodes='.trim($flatNodes);
        }

        return $command;
    }

    private function absoluteStylePath(): string
    {
        $style = (string) config('osm2pgsql.style');

        if ($this->isAbsolutePath($style)) {
            return $style;
        }

        return base_path($style);
    }

    private function isAbsolutePath(string $path): bool
    {
        return str_starts_with($path, DIRECTORY_SEPARATOR)
            || preg_match('/^[A-Za-z]:[\/\\\\]/', $path) === 1;
    }

    private function processTimeoutSeconds(): int
    {
        return max(1, (int) config('osm2pgsql.process_timeout_seconds'));
    }

    /**
     * @return array{mirrored: int, deleted: int}|null
     */
    private function mirrorNodes(): ?array
    {
        $importCount = (int) DB::table($this->importTable())->count();

        if ($importCount === 0) {
            $this->warn('The osm2pgsql import table is empty; refusing to mirror stale deletions.');

            return null;
        }

        return DB::transaction(function (): array {
            $syncImportId = (string) Str::uuid();

            return [
                'mirrored' => $this->upsertImportedNodes($syncImportId),
                'deleted' => $this->deleteStaleNodes(),
            ];
        });
    }

    private function upsertImportedNodes(string $syncImportId): int
    {
        $importTable = $this->quotedTableName($this->importTable());
        $nodesTable = $this->quotedTableName($this->nodesTable());

        return DB::affectingStatement(
            <<<SQL
            INSERT INTO {$nodesTable} (
                osm_id,
                latitude,
                longitude,
                location,
                tags,
                surveillance_type,
                direction,
                camera_direction,
                osm_updated_at,
                osm_version,
                osm_changeset_id,
                osm_user,
                osm_uid,
                sync_import_id,
                last_synced_at,
                created_at,
                updated_at
            )
            SELECT
                source.node_id,
                source.latitude,
                source.longitude,
                ST_SetSRID(ST_MakePoint(source.longitude, source.latitude), 4326),
                source.tags,
                source.surveillance_type,
                source.direction,
                source.camera_direction,
                source.osm_updated_at AT TIME ZONE 'UTC',
                source.osm_version,
                source.osm_changeset_id,
                source.osm_user,
                source.osm_uid,
                ?,
                now(),
                now(),
                now()
            FROM {$importTable} source
            ON CONFLICT (osm_id) DO UPDATE SET
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                location = EXCLUDED.location,
                tags = EXCLUDED.tags,
                surveillance_type = EXCLUDED.surveillance_type,
                direction = EXCLUDED.direction,
                camera_direction = EXCLUDED.camera_direction,
                osm_updated_at = EXCLUDED.osm_updated_at,
                osm_version = EXCLUDED.osm_version,
                osm_changeset_id = EXCLUDED.osm_changeset_id,
                osm_user = EXCLUDED.osm_user,
                osm_uid = EXCLUDED.osm_uid,
                sync_import_id = EXCLUDED.sync_import_id,
                last_synced_at = EXCLUDED.last_synced_at,
                updated_at = EXCLUDED.updated_at
            SQL,
            [$syncImportId],
        );
    }

    private function deleteStaleNodes(): int
    {
        $importTable = $this->quotedTableName($this->importTable());
        $nodesTable = $this->quotedTableName($this->nodesTable());

        return DB::affectingStatement(
            <<<SQL
            DELETE FROM {$nodesTable} nodes
            WHERE NOT EXISTS (
                SELECT 1
                FROM {$importTable} source
                WHERE source.node_id = nodes.osm_id
            )
            SQL,
        );
    }

    private function hasRequiredImportColumns(): bool
    {
        $missingColumns = collect(self::REQUIRED_IMPORT_COLUMNS)
            ->reject(fn (string $column): bool => Schema::hasColumn($this->importTable(), $column));

        if ($missingColumns->isEmpty()) {
            return true;
        }

        $this->error(sprintf(
            'The osm2pgsql import table is missing required SQL mirror columns: %s.',
            $missingColumns->implode(', '),
        ));
        $this->error('Re-run the initial osm2pgsql import with --extra-attributes and the updated flex style.');

        return false;
    }

    private function importTable(): string
    {
        return (string) config('osm2pgsql.import_table');
    }

    private function nodesTable(): string
    {
        return (new OsmNode)->getTable();
    }

    private function quotedTableName(string $table): string
    {
        $segments = array_map('trim', explode('.', $table));

        if ($segments === [] || in_array('', $segments, true)) {
            throw new InvalidArgumentException('Database table names must not contain empty segments.');
        }

        return implode('.', array_map(
            fn (string $segment): string => $this->quoteIdentifier($segment),
            $segments,
        ));
    }

    private function quoteIdentifier(string $identifier): string
    {
        return '"'.str_replace('"', '""', $identifier).'"';
    }

    private function writeProcessOutput(string $type, string $output): void
    {
        if ($type === 'err' || $type === 'stderr') {
            $this->getOutput()->getErrorStyle()->write($output);

            return;
        }

        $this->getOutput()->write($output);
    }

    /**
     * @return array<string, string>
     */
    private function postgresEnvironment(): array
    {
        $connection = config('database.connections.pgsql', []);

        $environment = [
            'PGDATABASE' => config('osm2pgsql.database'),
            'PGHOST' => $connection['host'] ?? null,
            'PGPORT' => $connection['port'] ?? null,
            'PGUSER' => $connection['username'] ?? null,
            'PGPASSWORD' => $connection['password'] ?? null,
        ];

        return collect($environment)
            ->filter(fn (mixed $value): bool => is_scalar($value) && trim((string) $value) !== '')
            ->map(fn (mixed $value): string => (string) $value)
            ->all();
    }

    private function operationLockSeconds(): int
    {
        return $this->processTimeoutSeconds() + 60;
    }
}
