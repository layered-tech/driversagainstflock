<?php

namespace App\Jobs;

use App\Models\AreaAlertDelivery;
use App\Models\AreaSubscription;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

class SendAreaAlert implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public int $timeout = 30;

    public int $uniqueFor = 600;

    public function __construct(public int $deliveryId) {}

    public function uniqueId(): string
    {
        return (string) $this->deliveryId;
    }

    public function handle(): void
    {
        DB::transaction(function (): void {
            $subscriptionId = AreaAlertDelivery::whereKey($this->deliveryId)->value('area_subscription_id');
            $area = AreaSubscription::with('device')->whereKey($subscriptionId)->lockForUpdate()->first();
            $delivery = AreaAlertDelivery::whereKey($this->deliveryId)->lockForUpdate()->first();
            if (! $delivery || $delivery->status !== 'pending') {
                return;
            }
            if (! $area || ! $area->device->push_token || $area->alert_mode === 'off' || $area->preference_version !== $delivery->preference_version) {
                $delivery->update(['status' => 'cancelled']);

                return;
            }
            $request = Http::acceptJson()->connectTimeout(3)->timeout(10);
            if ($accessToken = config('services.expo.access_token')) {
                $request = $request->withToken($accessToken);
            }
            $ticket = $request->post('https://exp.host/--/api/v2/push/send', [
                ...array_intersect_key($delivery->payload, array_flip(['title', 'body', 'data'])), 'to' => $area->device->push_token, 'sound' => 'default', 'channelId' => 'area-changes',
            ])->throw()->json('data');
            if (($ticket['status'] ?? null) !== 'ok') {
                $code = $ticket['details']['error'] ?? 'UnknownError';
                if ($code === 'DeviceNotRegistered') {
                    $area->device->update(['push_token' => null]);
                    $delivery->update(['status' => 'cancelled', 'error' => $code]);

                    return;
                }
                throw new RuntimeException('Area notification rejected: '.$code);
            }
            $delivery->update(['status' => 'sent', 'ticket_id' => $ticket['id'] ?? null, 'sent_at' => now(),
                'payload' => [...$delivery->payload, 'push_token_hash' => hash('sha256', $area->device->push_token)],
            ]);
        });
    }

    public function backoff(): array
    {
        return [30, 120, 300, 900];
    }

    public function failed(?Throwable $exception): void
    {
        AreaAlertDelivery::whereKey($this->deliveryId)->where('status', 'pending')->update(['status' => 'failed', 'error' => 'Push delivery failed after retries.']);
        if ($exception) {
            report($exception);
        }
    }
}
