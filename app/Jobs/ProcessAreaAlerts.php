<?php

namespace App\Jobs;

use App\Models\AreaAlertDelivery;
use App\Models\AreaDevice;
use App\Models\AreaSubscription;
use App\Services\Areas\AreaAlerts;
use App\Services\Areas\AreaChanges;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class ProcessAreaAlerts implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 60;

    public int $uniqueFor = 120;

    public function __construct(public int $afterId = 0) {}

    public function uniqueId(): string
    {
        return (string) $this->afterId;
    }

    public function handle(AreaAlerts $alerts, AreaChanges $changes): void
    {
        $throughId = $changes->latestVersionId();
        $ids = AreaSubscription::where('id', '>', $this->afterId)->orderBy('id')->limit(50)->pluck('id');
        foreach ($ids as $id) {
            $alerts->process($id, $throughId);
        }
        AreaAlertDelivery::where('status', 'pending')->orderBy('id')->limit(500)->pluck('id')->each(fn (int $id) => SendAreaAlert::dispatch($id));
        if ($ids->count() === 50) {
            self::dispatch($ids->last());
        }
        if ($this->afterId === 0) {
            AreaDevice::where('last_seen_at', '<', now()->subDays(90))->delete();
            AreaAlertDelivery::where('updated_at', '<', now()->subDays(30))->delete();
        }
    }

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
