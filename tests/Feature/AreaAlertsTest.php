<?php

use App\Jobs\CheckAreaPushReceipts;
use App\Jobs\ProcessAreaAlerts;
use App\Jobs\SendAreaAlert;
use App\Models\AreaAlertDelivery;
use App\Models\AreaDevice;
use App\Models\AreaSubscription;
use App\Services\Areas\AreaAlerts;
use App\Services\Areas\AreaChanges;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Tests\CreatesModerationSource;

uses(CreatesModerationSource::class);

beforeEach(function (): void {
    $this->createModerationSource();
    Http::preventStrayRequests();
    $this->device = AreaDevice::factory()->create(['push_token' => 'ExponentPushToken[test]']);
    $this->area = AreaSubscription::factory()->for($this->device, 'device')->create(['alert_mode' => 'instant']);
});

test('instant alerts are created once for matching new changes and send once', function () {
    $this->sourceNode();
    $service = app(AreaAlerts::class);
    $service->process($this->area->id);
    $service->process($this->area->id);
    $this->assertDatabaseCount('area_alert_deliveries', 1);
    $delivery = AreaAlertDelivery::firstOrFail();
    expect($delivery->payload['data']['area_id'])->toBe($this->area->id);
    Http::fake(['exp.host/*' => Http::response(['data' => ['status' => 'ok', 'id' => 'ticket-1']])]);
    $job = new SendAreaAlert($delivery->id);
    $job->handle();
    $job->handle();
    Http::assertSentCount(1);
    expect($delivery->fresh()->status)->toBe('sent');
});

test('in app only and filtered types never produce pushes', function () {
    $this->sourceNode();
    $this->area->update(['notify_added' => false]);
    app(AreaAlerts::class)->process($this->area->id);
    $this->area->update(['alert_mode' => 'off', 'notify_added' => true]);
    $this->sourceNode(201);
    app(AreaAlerts::class)->process($this->area->id);
    $this->assertDatabaseCount('area_alert_deliveries', 0);
    expect($this->area->fresh()->last_processed_version_id)->toBe(app(AreaChanges::class)->latestVersionId());
});

test('digests respect local time and Monday cadence without repeating', function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-12 12:59:00', 'UTC'));
    $this->area->update(['alert_mode' => 'weekly', 'digest_time' => '08:00', 'next_digest_at' => '2026-10-12 13:00:00+00']);
    $this->sourceNode();
    app(AreaAlerts::class)->process($this->area->id);
    $this->assertDatabaseCount('area_alert_deliveries', 0);
    $this->travel(1)->minutes();
    app(AreaAlerts::class)->process($this->area->id);
    app(AreaAlerts::class)->process($this->area->id);
    $this->assertDatabaseCount('area_alert_deliveries', 1);
    expect(AreaAlertDelivery::first()->payload['body'])->toContain('1 cameras added');
    expect($this->area->fresh()->next_digest_at->toIso8601String())->toBe('2026-10-19T13:00:00+00:00');
    $this->area->alert_mode = 'daily';
    expect(app(AreaAlerts::class)->nextDigest($this->area, CarbonImmutable::parse('2026-10-31 14:00:00Z'))->toIso8601String())->toBe('2026-11-01T14:00:00+00:00');
});

test('queued notifications are cancelled after preferences change or unsubscribe', function () {
    $this->sourceNode();
    app(AreaAlerts::class)->process($this->area->id);
    $delivery = AreaAlertDelivery::firstOrFail();
    $this->area->increment('preference_version');
    (new SendAreaAlert($delivery->id))->handle();
    expect($delivery->fresh()->status)->toBe('cancelled');
    $this->area->delete();
    (new SendAreaAlert($delivery->id))->handle();
    Http::assertNothingSent();
});

test('invalid push tokens are removed and transient delivery failures remain retryable', function () {
    $this->sourceNode();
    app(AreaAlerts::class)->process($this->area->id);
    $delivery = AreaAlertDelivery::firstOrFail();
    Http::fake(['exp.host/*' => Http::sequence()->push(['data' => ['status' => 'error', 'details' => ['error' => 'MessageRateExceeded']]])->push(['data' => ['status' => 'error', 'details' => ['error' => 'DeviceNotRegistered']]])]);
    expect(fn () => (new SendAreaAlert($delivery->id))->handle())->toThrow(RuntimeException::class);
    expect($delivery->fresh()->status)->toBe('pending');
    (new SendAreaAlert($delivery->id))->handle();
    expect($this->device->fresh()->push_token)->toBeNull()->and($delivery->fresh()->status)->toBe('cancelled');
});

test('push receipts record delivery failures and remove unregistered devices', function () {
    $this->sourceNode();
    app(AreaAlerts::class)->process($this->area->id);
    $delivery = AreaAlertDelivery::firstOrFail();
    $delivery->update(['status' => 'sent', 'sent_at' => now()->subMinutes(20), 'ticket_id' => 'receipt-1', 'payload' => [...$delivery->payload, 'push_token_hash' => hash('sha256', $this->device->push_token)]]);
    Http::fake(['exp.host/*' => Http::response(['data' => ['receipt-1' => ['status' => 'error', 'details' => ['error' => 'DeviceNotRegistered']]]])]);
    (new CheckAreaPushReceipts)->handle();
    expect($delivery->fresh()->status)->toBe('failed')->and($this->device->fresh()->push_token)->toBeNull();
});

test('new subscriptions do not alert about preexisting history', function () {
    $this->sourceNode(1);
    $this->area->update(['last_processed_version_id' => app(AreaChanges::class)->latestVersionId()]);
    app(AreaAlerts::class)->process($this->area->id);
    $this->assertDatabaseCount('area_alert_deliveries', 0);
    $this->sourceNode(2);
    app(AreaAlerts::class)->process($this->area->id);
    $this->assertDatabaseCount('area_alert_deliveries', 1);
});

test('old push receipts cannot clear a newly registered device token', function () {
    $this->sourceNode();
    app(AreaAlerts::class)->process($this->area->id);
    $delivery = AreaAlertDelivery::firstOrFail();
    $delivery->update(['status' => 'sent', 'sent_at' => now()->subMinutes(20), 'ticket_id' => 'old-ticket', 'payload' => [...$delivery->payload, 'push_token_hash' => hash('sha256', 'ExponentPushToken[old]')]]);
    Http::fake(['exp.host/*' => Http::response(['data' => ['old-ticket' => ['status' => 'error', 'details' => ['error' => 'DeviceNotRegistered']]]])]);
    (new CheckAreaPushReceipts)->handle();
    expect($this->device->fresh()->push_token)->toBe('ExponentPushToken[test]');
});

test('scheduled processing queues pending deliveries and expires abandoned devices', function () {
    Bus::fake([ProcessAreaAlerts::class, SendAreaAlert::class]);
    $this->sourceNode();
    $expired = AreaDevice::factory()->create(['last_seen_at' => now()->subDays(91)]);
    (new ProcessAreaAlerts)->handle(app(AreaAlerts::class), app(AreaChanges::class));
    Bus::assertDispatched(SendAreaAlert::class);
    $this->assertDatabaseMissing('area_devices', ['id' => $expired->id]);
    $this->assertDatabaseHas('area_devices', ['id' => $this->device->id]);
});
