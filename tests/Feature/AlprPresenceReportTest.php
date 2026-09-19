<?php

use App\Jobs\ReconcileAlprPresenceReports;
use App\Models\AlprPresenceReport;
use App\Models\ModerationActivity;
use App\Models\ModerationFlag;
use App\Models\ModerationProcess;
use App\Models\ModerationRule;
use App\Models\User;
use App\Models\WatchedArea;
use App\Services\OpenStreetMap\AlprPresenceReports;
use App\Services\OpenStreetMap\ModerationReader;
use App\Services\OpenStreetMap\ModerationRuleEvaluator;
use App\Services\OpenStreetMap\ModerationSummaries;
use App\Services\OpenStreetMap\ModerationSummaryCache;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Routing\Middleware\ThrottleRequestsWithRedis;
use Illuminate\Support\Facades\Concurrency;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
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

test('concurrent requests deduplicate evidence and preserve reviewed flags for delayed reports', function () {
    $schema = 'presence_concurrency_'.Str::lower(Str::random(12));
    $connection = 'presence_concurrency_setup';
    $connectionConfig = [
        ...config('database.connections.pgsql'),
        'search_path' => $schema.',public',
    ];
    config(['database.connections.'.$connection => $connectionConfig]);
    $database = DB::connection($connection);
    $database->statement('CREATE SCHEMA '.$schema);

    try {
        foreach (['moderation_flags', 'alpr_presence_reports', 'watched_areas'] as $table) {
            $database->statement('CREATE TABLE '.$schema.'.'.$table.' (LIKE public.'.$table.' INCLUDING ALL)');
        }
        $database->statement('CREATE TABLE '.$schema.'.testing_node_versions (
            id bigserial PRIMARY KEY,
            node_id bigint NOT NULL,
            osm_version integer NOT NULL,
            visible boolean NOT NULL,
            latitude double precision,
            longitude double precision,
            geom geometry(Point, 4326),
            tags jsonb NOT NULL,
            osm_updated_at timestamptz NOT NULL,
            changeset_id bigint NOT NULL,
            osm_uid bigint,
            osm_user varchar(255)
        )');
        $database->table('testing_node_versions')->insert([
            'node_id' => 987654321,
            'osm_version' => 1,
            'visible' => true,
            'latitude' => 30.5,
            'longitude' => -97.5,
            'geom' => DB::raw('ST_SetSRID(ST_MakePoint(-97.5,30.5),4326)'),
            'tags' => json_encode(['surveillance:type' => 'ALPR'], JSON_THROW_ON_ERROR),
            'osm_updated_at' => now(),
            'changeset_id' => 100,
            'osm_uid' => 123,
            'osm_user' => 'mapper',
        ]);
        $database->table('watched_areas')->insert([
            'name' => 'Concurrent reports',
            'kind' => 'bbox',
            'definition' => '30,-98 → 31,-97',
            'geometry' => json_encode([
                'type' => 'Polygon',
                'coordinates' => [[[-98, 30], [-97, 30], [-97, 31], [-98, 31], [-98, 30]]],
            ], JSON_THROW_ON_ERROR),
            'bounds' => json_encode([-98, 30, -97, 31], JSON_THROW_ON_ERROR),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::disconnect($connection);

        $submit = Closure::bind(static function (array $payload) use ($connectionConfig): int {
            config([
                'cache.default' => 'array',
                'database.default' => 'presence_concurrency',
                'database.connections.presence_concurrency' => $connectionConfig,
                'osm.reader.connection' => 'presence_concurrency',
                'osm.reader.versions_table' => 'testing_node_versions',
            ]);
            DB::purge('presence_concurrency');

            return app(AlprPresenceReports::class)->accept($payload)->id;
        }, null, null);
        $payload = $this->payload;

        [$firstId, $secondId] = Concurrency::run([
            Closure::bind(static fn (): int => $submit($payload), null, null),
            Closure::bind(static fn (): int => $submit($payload), null, null),
        ]);
        expect($firstId)->toBe($secondId)
            ->and($database->table('alpr_presence_reports')->count())->toBe(1)
            ->and($database->table('moderation_flags')->count())->toBe(1);

        $dismissedAt = now();
        $database->table('moderation_flags')->update([
            'status' => 'dismissed',
            'dismissed_at' => $dismissedAt,
        ]);
        $delayed = [
            ...$payload,
            'passed_at' => $dismissedAt->copy()->subMinutes(2)->toISOString(),
            'occurred_at' => $dismissedAt->copy()->subMinute()->toISOString(),
            'submitted_at' => $dismissedAt->copy()->subMinute()->toISOString(),
        ];
        Concurrency::run([
            Closure::bind(static fn (): int => $submit([...$delayed, 'event_key' => 'delayed-concurrent-event-a']), null, null),
            Closure::bind(static fn (): int => $submit([...$delayed, 'event_key' => 'delayed-concurrent-event-b']), null, null),
        ]);
        $flag = $database->table('moderation_flags')->sole();
        $evidence = json_decode($flag->evidence, true, flags: JSON_THROW_ON_ERROR);
        expect($database->table('alpr_presence_reports')->count())->toBe(3)
            ->and($database->table('moderation_flags')->count())->toBe(1)
            ->and($flag->status)->toBe('dismissed')
            ->and($evidence['report_count'])->toBe(3);
    } finally {
        DB::connection($connection)->statement('DROP SCHEMA IF EXISTS '.$schema.' CASCADE');
        DB::purge($connection);
    }
});

test('a projection failure rolls back inserted evidence and does not invalidate summaries', function () {
    WatchedArea::factory()->create();
    $cache = $this->mock(ModerationSummaryCache::class);
    $cache->shouldNotReceive('invalidate');
    Event::listen('eloquent.creating: '.ModerationFlag::class, function (): never {
        throw new RuntimeException('Forced projection failure');
    });

    try {
        expect(fn () => app(AlprPresenceReports::class)->accept($this->payload))
            ->toThrow(RuntimeException::class, 'Forced projection failure');
    } finally {
        Event::forget('eloquent.creating: '.ModerationFlag::class);
    }

    expect(AlprPresenceReport::count())->toBe(0)
        ->and(ModerationFlag::count())->toBe(0);
});

test('committed report and review changes invalidate moderation summaries', function () {
    WatchedArea::factory()->create();
    $cache = $this->mock(ModerationSummaryCache::class);
    $cache->shouldReceive('invalidate')->once();

    app(AlprPresenceReports::class)->accept($this->payload);

    $this->moderator();
    $flag = ModerationFlag::firstOrFail();
    $cache->shouldReceive('invalidate')->once();
    $this->patch('/moderation/flags/'.$flag->id.'/dismiss', [
        'evidence_hash' => $flag->evidence_hash,
    ])->assertRedirect();
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

test('mixed rule and report area counts deduplicate nodes and retain known report totals', function () {
    $areas = WatchedArea::factory()->count(2)->create();
    app(AlprPresenceReports::class)->accept($this->payload);
    $rule = ModerationRule::factory()->create(['enabled' => true]);
    $reader = app(ModerationReader::class);
    app(ModerationRuleEvaluator::class)->evaluate(
        $rule,
        $reader->normalize($reader->nodes()->firstOrFail()),
    );
    ModerationProcess::create([
        'name' => 'rule:'.$rule->id.':'.$rule->version,
        'state' => 'complete',
        'last_success_at' => now(),
    ]);

    foreach ($areas as $area) {
        $summary = app(ModerationSummaries::class)->area($area)['data'];
        expect($summary['open_reported_nodes'])->toBe(1)
            ->and($summary['open_violations'])->toBe(1)
            ->and($summary['open_flags'])->toBe(1);
    }

    ModerationProcess::query()->delete();
    app(ModerationSummaryCache::class)->invalidate();
    foreach ($areas as $area) {
        $summary = app(ModerationSummaries::class)->area($area)['data'];
        expect($summary['open_reported_nodes'])->toBe(1)
            ->and($summary['open_flags'])->toBeNull();
    }
});

test('rule evaluation disabling and deletion leave driver report flags active', function () {
    WatchedArea::factory()->create();
    app(AlprPresenceReports::class)->accept($this->payload);
    $presenceFlag = ModerationFlag::where('source', 'alpr_presence')->firstOrFail();
    $rule = ModerationRule::factory()->create(['enabled' => true]);
    $reader = app(ModerationReader::class);
    $evaluator = app(ModerationRuleEvaluator::class);
    $node = $reader->normalize($reader->nodes()->firstOrFail());

    $evaluator->evaluate($rule, $node);
    expect(ModerationFlag::where('source', 'rule')->count())->toBe(1)
        ->and($presenceFlag->fresh()->status)->toBe('open');

    $evaluator->evaluate($rule, [
        ...$node,
        'tags' => [...$node['tags'], 'operator' => 'City'],
    ]);
    expect(ModerationFlag::where('source', 'rule')->firstOrFail()->status)->toBe('resolved')
        ->and($presenceFlag->fresh()->status)->toBe('open');

    $rule->update(['enabled' => false]);
    expect(ModerationFlag::active()->pluck('id')->all())->toBe([$presenceFlag->id]);

    $rule->delete();
    expect(ModerationFlag::where('source', 'rule')->count())->toBe(0)
        ->and(ModerationFlag::active()->pluck('id')->all())->toBe([$presenceFlag->id]);
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
