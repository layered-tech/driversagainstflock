<?php

use App\Jobs\ReconcileAlprPresenceReports;
use App\Models\AlprPresenceReport;
use App\Models\ModerationActivity;
use App\Models\ModerationFlag;
use App\Models\User;
use App\Models\WatchedArea;
use App\Services\OpenStreetMap\AlprPresenceReports;
use App\Services\OpenStreetMap\ModerationSummaries;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Routing\Middleware\ThrottleRequestsWithRedis;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\CreatesModerationSource;

uses(CreatesModerationSource::class);

beforeEach(function (): void {
    // Exercise the real named limits against the test cache, not shared developer Redis.
    $this->app->bind(ThrottleRequestsWithRedis::class, ThrottleRequests::class);
    Queue::fake([ReconcileAlprPresenceReports::class]);
    $this->createModerationSource();
    $this->sourceNode(987654321);
    $this->payload = [
        'osm_node_id' => 987654321, 'response' => 'not_there', 'platform' => 'android_auto',
        'reporter_id' => '0123456789abcdef0123456789abcdef', 'event_key' => 'encounter-0123456789abcdef',
        'passed_at' => now()->subSeconds(10)->toISOString(), 'occurred_at' => now()->subSeconds(5)->toISOString(),
        'submitted_at' => now()->toISOString(), 'observed' => ['version' => 1, 'latitude' => 30.5, 'longitude' => -97.5],
    ];
});

test('a negative report promptly opens one area flag using canonical identity and server geography', function () {
    WatchedArea::factory()->create();
    $this->payload['observed']['longitude'] = 12;
    $this->postJson('/api/v1/alpr-presence-reports', [...$this->payload, 'user_id' => 999])->assertUnprocessable();
    $this->postJson('/api/v1/alpr-presence-reports', $this->payload)->assertCreated()->assertJsonPath('status', 'received');
    $report = AlprPresenceReport::firstOrFail();
    $flag = ModerationFlag::firstOrFail();
    expect($report->osm_node_id)->toBe(987654321)->and($report->user_id)->toBeNull()
        ->and($report->reporter_key)->not->toBe($this->payload['reporter_id'])
        ->and($report->server_longitude)->toBe(-97.5)->and($report->observed['longitude'])->toBe(12)
        ->and($flag->source)->toBe('alpr_presence')->and($flag->rule_id)->toBeNull()
        ->and($flag->evidence['report_count'])->toBe(1)->and(ModerationFlag::active()->count())->toBe(1);
});

test('retries are idempotent and a reused key with different evidence is rejected', function () {
    WatchedArea::factory()->create();
    $this->postJson('/api/v1/alpr-presence-reports', $this->payload)->assertCreated();
    $hash = ModerationFlag::first()->evidence_hash;
    $this->postJson('/api/v1/alpr-presence-reports', $this->payload)->assertOk();
    $this->postJson('/api/v1/alpr-presence-reports', [...$this->payload, 'platform' => 'carplay'])->assertStatus(409);
    expect(AlprPresenceReport::count())->toBe(1)->and(ModerationFlag::count())->toBe(1)
        ->and(ModerationFlag::first()->evidence_hash)->toBe($hash);
});

test('only negative reports for known canonical ALPR nodes are accepted', function (string $response) {
    $this->postJson('/api/v1/alpr-presence-reports', [...$this->payload, 'response' => $response])->assertUnprocessable();
    expect(AlprPresenceReport::count())->toBe(0);
})->with(['still_there', 'dismiss', 'present', '']);

test('unknown nodes and invalid occurrence ordering cannot create reports', function () {
    $this->postJson('/api/v1/alpr-presence-reports', [...$this->payload, 'osm_node_id' => 1])->assertUnprocessable();
    $this->postJson('/api/v1/alpr-presence-reports', [...$this->payload, 'passed_at' => now()->addHour()->toISOString()])->assertUnprocessable();
    expect(AlprPresenceReport::count())->toBe(0);
});

test('unassigned evidence is retained and a later area reconciles it once', function () {
    $this->postJson('/api/v1/alpr-presence-reports', $this->payload)->assertCreated();
    expect(ModerationFlag::count())->toBe(0);
    WatchedArea::factory()->create();
    app(AlprPresenceReports::class)->reconcile(987654321);
    app(AlprPresenceReports::class)->reconcile(987654321);
    expect(ModerationFlag::count())->toBe(1)->and(AlprPresenceReport::first()->moderation_flag_id)->not->toBeNull();
});

test('review is source specific and delayed evidence does not undo a dismissal', function () {
    WatchedArea::factory()->create();
    $this->postJson('/api/v1/alpr-presence-reports', $this->payload)->assertCreated();
    $this->moderator();
    $flag = ModerationFlag::first();
    $originalHash = $flag->evidence_hash;
    $this->patch('/moderation/flags/'.$flag->id.'/dismiss', ['evidence_hash' => $originalHash])->assertRedirect();
    $this->postJson('/api/v1/alpr-presence-reports', $this->payload)->assertOk();
    $this->postJson('/api/v1/alpr-presence-reports', [...$this->payload, 'event_key' => 'delayed-0123456789abcdef'])->assertCreated();
    expect($flag->fresh()->status)->toBe('dismissed')->and(AlprPresenceReport::count())->toBe(2);
    $this->travel(1)->minutes();
    $this->postJson('/api/v1/alpr-presence-reports', [...$this->payload, 'event_key' => 'new-0123456789abcdef',
        'passed_at' => now()->subSeconds(10)->toISOString(), 'occurred_at' => now()->subSeconds(5)->toISOString(), 'submitted_at' => now()->toISOString(),
    ])->assertCreated();
    expect($flag->fresh()->status)->toBe('open')->and(ModerationFlag::count())->toBe(1)
        ->and(ModerationActivity::where('action', 'flag.dismissed')->first()->details['name'])->toBe('Driver reported missing');
    $this->patch('/moderation/flags/'.$flag->id.'/dismiss', ['evidence_hash' => $originalHash])->assertSessionHasErrors('flag');
});

test('current area coverage excludes moved nodes without losing evidence', function () {
    WatchedArea::factory()->create();
    $this->postJson('/api/v1/alpr-presence-reports', $this->payload)->assertCreated();
    $this->sourceNode(987654321, 2, ['latitude' => 40, 'longitude' => -110]);
    expect(ModerationFlag::active()->count())->toBe(0)->and(AlprPresenceReport::count())->toBe(1);
});

test('my areas includes creators who unsubscribed and report recency is independent of node edits', function () {
    $user = $this->moderator();
    WatchedArea::factory()->create(['user_id' => $user->id]);
    $this->sourceNode(987654321, 2, ['osm_updated_at' => now()->subYears(3)]);
    $this->postJson('/api/v1/alpr-presence-reports', $this->payload)->assertCreated();
    $this->get('/moderation/flagged?flag_source=alpr_presence&area_scope=my&report_window=24h')->assertInertia(fn ($page) => $page
        ->has('records.data', 1)->where('records.data.0.id', 987654321)->where('records.data.0.flags.0.source', 'alpr_presence'));
    $this->get('/moderation/nodes/987654321?from=flagged&area_scope=my&flag_source=alpr_presence')->assertInertia(fn ($page) => $page
        ->has('reports.data', 1)->missing('reports.data.0.reporter_key')->where('listingFilters.area_scope', 'my'));
    $this->get('/moderation/areas')->assertInertia(fn ($page) => $page->where('records.data.0.open_reported_nodes', 1)->where('records.data.0.open_flags', null));
    $flag = ModerationFlag::first();
    $this->patch('/moderation/flags/'.$flag->id.'/dismiss', ['evidence_hash' => $flag->evidence_hash])->assertRedirect();
    $this->get('/moderation/flagged?flag_source=alpr_presence&report_state=dismissed&area_scope=my')->assertInertia(fn ($page) => $page->has('records.data', 1));
});

test('boundary and overlapping areas share one flag and unrelated my areas are excluded', function () {
    $user = $this->moderator();
    $this->sourceNode(987654321, 2, ['latitude' => 30, 'longitude' => -98]);
    WatchedArea::factory()->count(2)->create();
    $this->postJson('/api/v1/alpr-presence-reports', $this->payload)->assertCreated();
    expect(ModerationFlag::count())->toBe(1)->and(ModerationFlag::active()->count())->toBe(1);
    $this->get('/moderation/flagged?flag_source=alpr_presence&area_scope=my')->assertInertia(fn ($page) => $page->has('records.data', 0));
    $area = WatchedArea::first();
    $area->watchers()->attach($user);
    $this->get('/moderation/flagged?flag_source=alpr_presence&area_scope=my')->assertInertia(fn ($page) => $page->has('records.data', 1));
    WatchedArea::query()->delete();
    expect(ModerationFlag::active()->count())->toBe(0)->and(AlprPresenceReport::count())->toBe(1);
});

test('unavailable reader returns retryable failure without acknowledging evidence', function () {
    config(['osm.reader.versions_table' => 'unavailable_presence_source']);
    $this->postJson('/api/v1/alpr-presence-reports', $this->payload)->assertStatus(503)->assertHeader('Retry-After', '60');
    expect(AlprPresenceReport::count())->toBe(0);
});

test('nonmoderators cannot read report history or dismiss evidence', function () {
    WatchedArea::factory()->create();
    $this->postJson('/api/v1/alpr-presence-reports', $this->payload)->assertCreated();
    $this->actingAs(User::factory()->create());
    $this->get('/moderation/nodes/987654321')->assertForbidden();
    $this->patch('/moderation/flags/'.ModerationFlag::first()->id.'/dismiss', ['evidence_hash' => ModerationFlag::first()->evidence_hash])->assertForbidden();
});

test('the public reporting route enforces its IP limit while retaining retry identity', function () {
    for ($attempt = 0; $attempt < 30; $attempt++) {
        $this->postJson('/api/v1/alpr-presence-reports', $this->payload)->assertSuccessful();
    }
    $this->postJson('/api/v1/alpr-presence-reports', $this->payload)->assertTooManyRequests();
    expect(AlprPresenceReport::count())->toBe(1);
});

test('backend authentication is attributed without accepting an OSM client identity', function () {
    $user = User::factory()->create();
    Sanctum::actingAs($user);
    $this->postJson('/api/v1/alpr-presence-reports', $this->payload)->assertCreated();
    expect(AlprPresenceReport::first()->user_id)->toBe($user->id);
});

test('node evidence is paginated and current report counts survive stale rule summaries', function () {
    $user = $this->moderator();
    $area = WatchedArea::factory()->create(['user_id' => $user->id]);
    $service = app(AlprPresenceReports::class);
    for ($i = 0; $i < 27; $i++) {
        $service->accept([...$this->payload, 'event_key' => 'paginated-event-'.str_pad((string) $i, 4, '0', STR_PAD_LEFT)]);
    }
    $this->get('/moderation/nodes/987654321?from=flagged&reports_page=2&flag_source=alpr_presence&area='.$area->id)
        ->assertInertia(fn ($page) => $page->has('reports.data', 2)->where('reports.total', 27)->where('listingFilters.area', (string) $area->id));
    $summaries = app(ModerationSummaries::class);
    expect($summaries->area($area)['data']['open_reported_nodes'])->toBe(1);
    $this->sourceNode(987654321, 2, ['latitude' => 40, 'longitude' => -110]);
    expect($summaries->area($area)['data']['open_reported_nodes'])->toBe(0);
    expect(AlprPresenceReport::count())->toBe(27);
});

test('newly received offline evidence appears in received-time filters', function () {
    $this->moderator();
    WatchedArea::factory()->create();
    $this->payload['passed_at'] = now()->subDays(40)->toISOString();
    $this->payload['occurred_at'] = now()->subDays(40)->addSeconds(5)->toISOString();
    $this->payload['submitted_at'] = now()->subDays(40)->addSeconds(5)->toISOString();
    $this->postJson('/api/v1/alpr-presence-reports', $this->payload)->assertCreated();
    $this->get('/moderation/flagged?flag_source=alpr_presence&report_window=24h')
        ->assertInertia(fn ($page) => $page->has('records.data', 1));
});
