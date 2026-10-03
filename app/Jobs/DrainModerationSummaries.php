<?php

namespace App\Jobs;

use App\Services\OpenStreetMap\ModerationProcessing;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class DrainModerationSummaries implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $maxExceptions = 3;

    public int $timeout = 50;

    public int $tries = 0;

    public bool $failOnTimeout = true;

    public function __construct()
    {
        $this->onConnection((string) config('moderation.processing.connection', 'redis'));
        $this->onQueue((string) config('moderation.processing.queue', 'moderation'));
    }

    public function handle(ModerationProcessing $processing): void
    {
        if ($processing->hasRunningSummaryInvalidators()) {
            $this->release(60);

            return;
        }

        $result = $processing->drainSummaryBatch();
        if ($result['jobs'] > 0 || $result['skipped'] !== []) {
            $this->release(60);
        }
    }

    public function failed(?Throwable $exception): void
    {
        app(ModerationProcessing::class)->recordSummaryDrainFailure($exception);
    }
}
