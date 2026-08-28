<?php

namespace App\Jobs;

use App\Services\MarkerFileCache;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

class RefreshMarkerFile implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 600;

    public int $uniqueFor = 3600;

    public function __construct()
    {
        $this->onConnection('redis-long-running');
        $this->onQueue('marker-files');
    }

    public function handle(MarkerFileCache $markerFileCache): void
    {
        $markerFileCache->refresh();
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [60, 300];
    }

    public function failed(?Throwable $exception): void
    {
        Log::error('Marker file refresh failed.', [
            'exception' => $exception,
        ]);
    }
}
