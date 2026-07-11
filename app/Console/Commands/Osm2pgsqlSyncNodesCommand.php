<?php

namespace App\Console\Commands;

use App\Services\Overpass\OverpassNodeSynchronizer;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

class Osm2pgsqlSyncNodesCommand extends Command
{
    private const REQUIRED_METADATA_COLUMNS = [
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
    protected $signature = 'app:osm2pgsql:sync-nodes
        {--chunk= : Number of imported rows to process at a time}
        {--allow-empty-reconcile : Allow deleting stale nodes when the import table is empty}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Mirror osm2pgsql ALPR rows into canonical OSM nodes';

    public function __construct(private OverpassNodeSynchronizer $synchronizer)
    {
        parent::__construct();
    }

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        if (! config('osm2pgsql.enabled')) {
            $this->info('osm2pgsql sync is disabled.');

            return self::SUCCESS;
        }

        $chunkSize = $this->chunkSize();

        if ($chunkSize === null) {
            return self::FAILURE;
        }

        if (! $this->hasRequiredImportColumns()) {
            return self::FAILURE;
        }

        $lock = Cache::lock(
            Osm2pgsqlReplicationUpdateCommand::OPERATION_LOCK_KEY,
            $this->operationLockSeconds(),
        );

        if (! $lock->get()) {
            $this->warn('Another osm2pgsql operation is already running; skipping node sync.');

            return self::SUCCESS;
        }

        $this->progressLine(sprintf(
            'Starting osm2pgsql node sync from %s using %d row chunks.',
            $this->importTable(),
            $chunkSize,
        ));

        try {
            try {
                return $this->syncNodes($chunkSize);
            } catch (Throwable $exception) {
                Log::error('osm2pgsql node sync failed.', [
                    'table' => $this->importTable(),
                    'error' => $exception->getMessage(),
                ]);

                $this->error('osm2pgsql node sync failed.');
                $this->error($exception->getMessage());

                return self::FAILURE;
            }
        } finally {
            $lock->release();
        }
    }

    private function syncNodes(int $chunkSize): int
    {
        $syncImportId = (string) Str::uuid();
        $totals = [
            'synced' => 0,
            'created' => 0,
            'updated' => 0,
        ];
        $chunkNumber = 0;

        DB::table($this->importTable())
            ->select([
                'node_id',
                'latitude',
                'longitude',
                'tags',
                DB::raw('to_char(osm_updated_at AT TIME ZONE \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS"Z"\') as osm_updated_at'),
                'osm_version',
                'osm_changeset_id',
                'osm_user',
                'osm_uid',
            ])
            ->orderBy('node_id')
            ->chunkById($chunkSize, function (Collection $rows) use (&$totals, &$chunkNumber, $syncImportId): void {
                $chunkNumber++;

                $elements = $rows
                    ->map(fn (object $row): ?array => $this->elementFromImportRow($row))
                    ->filter()
                    ->values()
                    ->all();

                $this->progressLine(sprintf(
                    'Processing osm2pgsql import chunk %d: %d rows, %d valid elements.',
                    $chunkNumber,
                    $rows->count(),
                    count($elements),
                ));

                $result = $this->synchronizer->syncMany($elements, $syncImportId);

                $totals['synced'] += $result['synced'];
                $totals['created'] += $result['created'];
                $totals['updated'] += $result['updated'];

                $this->progressLine(sprintf(
                    'Finished osm2pgsql import chunk %d: %d synced (%d created, %d updated).',
                    $chunkNumber,
                    $result['synced'],
                    $result['created'],
                    $result['updated'],
                ));
            }, 'node_id');

        if ($totals['synced'] === 0 && ! $this->option('allow-empty-reconcile')) {
            $this->warn('The osm2pgsql import table is empty; refusing to reconcile stale nodes.');

            return self::FAILURE;
        }

        $this->progressLine('Reconciling stale osm2pgsql nodes.');

        $deleted = $this->synchronizer->deleteMissingNodes($syncImportId, null);

        $this->info(
            sprintf(
                'Synced %d nodes (%d created, %d updated) and deleted %d stale nodes.',
                $totals['synced'],
                $totals['created'],
                $totals['updated'],
                $deleted,
            ),
        );

        return self::SUCCESS;
    }

    /**
     * @return array{id: int, lat: float, lon: float, tags: array<string, mixed>}|null
     */
    private function elementFromImportRow(object $row): ?array
    {
        if (
            ! isset($row->node_id, $row->latitude, $row->longitude)
            || ! is_numeric($row->node_id)
            || ! is_numeric($row->latitude)
            || ! is_numeric($row->longitude)
        ) {
            return null;
        }

        return [
            'id' => (int) $row->node_id,
            'lat' => (float) $row->latitude,
            'lon' => (float) $row->longitude,
            'tags' => $this->tagsFromImportRow($row->tags ?? []),
            'timestamp' => $row->osm_updated_at ?? null,
            'version' => $row->osm_version ?? null,
            'changeset' => $row->osm_changeset_id ?? null,
            'user' => $row->osm_user ?? null,
            'uid' => $row->osm_uid ?? null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function tagsFromImportRow(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }

        if (is_object($value)) {
            return (array) $value;
        }

        if (! is_string($value) || trim($value) === '') {
            return [];
        }

        $decoded = json_decode($value, true);

        return is_array($decoded) ? $decoded : [];
    }

    private function importTable(): string
    {
        return (string) config('osm2pgsql.import_table');
    }

    private function hasRequiredImportColumns(): bool
    {
        $missingColumns = collect(self::REQUIRED_METADATA_COLUMNS)
            ->reject(fn (string $column): bool => Schema::hasColumn($this->importTable(), $column));

        if ($missingColumns->isEmpty()) {
            return true;
        }

        $this->error(sprintf(
            'The osm2pgsql import table is missing required metadata columns: %s.',
            $missingColumns->implode(', '),
        ));
        $this->error('Re-run the initial osm2pgsql import with --extra-attributes and the updated flex style.');

        return false;
    }

    private function chunkSize(): ?int
    {
        $value = $this->option('chunk') ?? config('osm2pgsql.sync_chunk');
        $chunkSize = filter_var($value, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1],
        ]);

        if ($chunkSize === false) {
            $this->error('The --chunk option must be a positive integer.');

            return null;
        }

        return $chunkSize;
    }

    private function operationLockSeconds(): int
    {
        return max(60, (int) config('osm2pgsql.process_timeout_seconds') + 60);
    }

    private function progressLine(string $message): void
    {
        $this->line($message);
    }
}
