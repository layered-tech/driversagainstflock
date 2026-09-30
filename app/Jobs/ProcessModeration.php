<?php

namespace App\Jobs;

use App\Services\OpenStreetMap\ModerationProcessing;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\Cache;
use Throwable;

class ProcessModeration implements ShouldQueue
{
    use Queueable;

    private const int MissingPayloadValue = -1;
    public ?int $target = self::MissingPayloadValue;
    public ?int $ruleId = self::MissingPayloadValue;
    public ?int $ruleVersion = self::MissingPayloadValue;
    public ?int $processId = self::MissingPayloadValue;
    public ?int $runNumber = self::MissingPayloadValue;
    public int $tries = 3;
    public int $timeout = 50;
    private bool $legacyPayload = false;

    public function __construct(
        public string $kind,
        ?int $target = null,
        ?int $ruleId = null,
        ?int $ruleVersion = null,
        ?int $processId = null,
        ?int $runNumber = null,
    ) {
        $this->target = $target;
        $this->ruleId = $ruleId;
        $this->ruleVersion = $ruleVersion;
        $this->processId = $processId;
        $this->runNumber = $runNumber;
        $this->onConnection((string) config('moderation.processing.connection', 'redis'));
        $this->onQueue((string) config('moderation.processing.queue', 'moderation'));
    }

    public function __wakeup(): void
    {
        $this->initializeLegacyPayload();
    }

    private function initializeLegacyPayload(): void
    {
        foreach (['target', 'ruleId', 'ruleVersion', 'processId', 'runNumber'] as $property) {
            if ($this->{$property} !== self::MissingPayloadValue) {
                continue;
            }

            $this->{$property} = null;
            $this->legacyPayload = true;
        }
    }

    public function handleSynchronously(ModerationProcessing $processing): void
    {
        $middleware = $this->middleware()[0];
        $lock = Cache::lock($middleware->getLockKey($this), $middleware->expiresAfter);
        if (! $lock->get()) {
            throw new LockTimeoutException('Target is already being processed. Retry when the current job finishes.');
        }
        try {
            $this->handle($processing);
        } finally {
            $lock->release();
        }
    }

    public function middleware(): array
    {
        $this->initializeLegacyPayload();
        $group = $this->kind === 'outcome'
            ? 'outcome:node:'.$this->target
            : implode(':', array_filter([$this->kind, $this->ruleId, $this->target], fn (mixed $value): bool => $value !== null));

        return [(new WithoutOverlapping('moderation:'.$group))->shared()->releaseAfter(60)->expireAfter(75)];
    }

    public function handle(ModerationProcessing $processing): void
    {
        $this->initializeLegacyPayload();
        if ($this->legacyPayload) {
            if ($this->processId !== null && $this->runNumber !== null) {
                $processing->markJobComplete($this->processId, $this->runNumber);
            }

            return;
        }

        if ($this->processId !== null && $this->runNumber !== null) {
            $processing->markRunning($this->processId, $this->runNumber);
        }
        $processing->process($this->kind, $this->target, $this->ruleId, $this->ruleVersion);
        if ($this->processId !== null && $this->runNumber !== null) {
            $processing->markJobComplete($this->processId, $this->runNumber);
        }
    }

    public function backoff(): array
    {
        return [60, 300];
    }

    public function failed(?Throwable $exception): void
    {
        $this->initializeLegacyPayload();
        if ($this->legacyPayload) {
            return;
        }

        if ($this->processId !== null && $this->runNumber !== null) {
            app(ModerationProcessing::class)->markJobFailed($this->processId, $this->runNumber, $exception);
        }
    }
}
