<?php

namespace App\Jobs;

use App\Services\Overpass\OverpassChunkStore;
use App\Services\Overpass\OverpassNodeSynchronizer;
use Illuminate\Bus\Batchable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

class ProcessOverpassNodesChunk implements ShouldQueue
{
    use Batchable, Queueable;

    public int $tries = 3;

    public int $timeout = 60;

    /**
     * @var array<int, int>
     */
    public array $backoff = [10, 60, 300];

    /**
     * @param  array<int, array<string, mixed>>  $upserts
     * @param  array<int, int>  $deletes
     */
    public function __construct(
        public array $upserts,
        public array $deletes = [],
        public ?string $upsertsPath = null,
        public ?string $deletesPath = null,
        public ?string $syncImportId = null,
    ) {}

    public static function fromUpsertsPath(string $path, ?string $syncImportId = null): self
    {
        return new self([], upsertsPath: $path, syncImportId: $syncImportId);
    }

    public static function fromDeletesPath(string $path): self
    {
        return new self([], [], deletesPath: $path);
    }

    /**
     * Execute the job.
     */
    public function handle(OverpassNodeSynchronizer $synchronizer, OverpassChunkStore $chunks): void
    {
        if ($this->batch()?->cancelled()) {
            return;
        }

        $upserts = $this->upsertsPath ? $chunks->read($this->upsertsPath) : $this->upserts;
        $deletes = $this->deletesPath ? $chunks->read($this->deletesPath) : $this->deletes;

        $synchronizer->syncMany($upserts, $this->syncImportId);
        $synchronizer->deleteMany($deletes);

        $chunks->deleteFile($this->upsertsPath);
        $chunks->deleteFile($this->deletesPath);
    }

    public function failed(?Throwable $exception): void
    {
        Log::error('Overpass node chunk failed.', [
            'upserts' => count($this->upserts),
            'deletes' => count($this->deletes),
            'upserts_path' => $this->upsertsPath,
            'deletes_path' => $this->deletesPath,
            'sync_import_id' => $this->syncImportId,
            'error' => $exception?->getMessage(),
        ]);
    }
}
