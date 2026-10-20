<?php

namespace App\Jobs;

use App\Models\AreaAlertDelivery;
use App\Models\AreaDevice;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Throwable;

class CheckAreaPushReceipts implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 30;

    public int $uniqueFor = 300;

    public function handle(): void
    {
        $deliveries = AreaAlertDelivery::with('subscription.device')->where('status', 'sent')->whereNotNull('ticket_id')
            ->where('sent_at', '<=', now()->subMinutes(15))->orderBy('id')->limit(100)->get();
        if ($deliveries->isEmpty()) {
            return;
        }
        $request = Http::acceptJson()->connectTimeout(3)->timeout(10);
        if ($token = config('services.expo.access_token')) {
            $request = $request->withToken($token);
        }
        $receipts = $request->post('https://exp.host/--/api/v2/push/getReceipts', ['ids' => $deliveries->pluck('ticket_id')->all()])->throw()->json('data', []);
        foreach ($deliveries as $delivery) {
            $receipt = $receipts[$delivery->ticket_id] ?? null;
            if (! $receipt) {
                if ($delivery->sent_at->lt(now()->subDay())) {
                    $delivery->update(['status' => 'failed', 'error' => 'No push receipt received within 24 hours.']);
                }

                continue;
            }
            if (($receipt['status'] ?? null) === 'ok') {
                $delivery->update(['status' => 'delivered']);

                continue;
            }
            $code = $receipt['details']['error'] ?? 'UnknownError';
            if ($code === 'DeviceNotRegistered') {
                DB::transaction(function () use ($delivery): void {
                    $device = AreaDevice::whereKey($delivery->subscription?->area_device_id)->lockForUpdate()->first();
                    if ($device?->push_token && hash_equals($delivery->payload['push_token_hash'] ?? '', hash('sha256', $device->push_token))) {
                        $device->update(['push_token' => null]);
                    }
                });
            }
            $delivery->update(['status' => 'failed', 'error' => $code]);
        }
    }

    public function backoff(): array
    {
        return [60, 300, 900];
    }

    public function failed(?Throwable $exception): void
    {
        if ($exception) {
            report($exception);
        }
    }
}
