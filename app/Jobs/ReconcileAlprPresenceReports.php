<?php

namespace App\Jobs;

use App\Models\AlprPresenceReport;
use App\Services\OpenStreetMap\AlprPresenceReports;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class ReconcileAlprPresenceReports implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 120;

    public function __construct(public int $afterNodeId = 0) {}

    public function handle(AlprPresenceReports $reports): void
    {
        $ids = AlprPresenceReport::where('osm_node_id', '>', $this->afterNodeId)->distinct()->orderBy('osm_node_id')->limit(100)->pluck('osm_node_id');
        foreach ($ids as $id) {
            $reports->reconcile($id);
        }
        if ($ids->count() === 100) {
            self::dispatch($ids->last());
        }
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [30, 120, 300];
    }

    public function failed(?Throwable $exception): void
    {
        if ($exception) {
            report($exception);
        }
    }
}
