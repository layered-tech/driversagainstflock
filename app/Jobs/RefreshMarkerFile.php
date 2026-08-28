<?php

namespace App\Jobs;

use App\Services\MarkerFileCache;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class RefreshMarkerFile implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 55;

    public int $uniqueFor = 3600;

    public function handle(MarkerFileCache $markerFileCache): void
    {
        $markerFileCache->refresh();
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [60, 300];
    }
}
