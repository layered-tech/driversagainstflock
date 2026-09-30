<?php

use App\Models\ModerationEditorSummary;
use App\Models\WatchedArea;
use App\Services\OpenStreetMap\ModerationEditorSummaries;
use App\Services\OpenStreetMap\ModerationOutcomeProcessor;
use App\Services\OpenStreetMap\ModerationReader;
use App\Services\OpenStreetMap\ModerationSummaries;
use App\Services\OpenStreetMap\ModerationSummaryCache;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Defer\DeferredCallbackCollection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\CreatesModerationSource;

uses(CreatesModerationSource::class);
beforeEach(function (): void {
    $this->createModerationSource();
    Cache::flush();
});

test('summary cache hits expires and invalidates without summary tables', function () {
    $cache = app(ModerationSummaryCache::class);
    $calls = 0;
    $calculate = function () use (&$calls): array {
        return ['value' => ++$calls];
    };
    expect($cache->remember('test', ['uid' => 1], $calculate)['data']['value'])->toBe(1);
    expect($cache->remember('test', ['uid' => 1], $calculate)['data']['value'])->toBe(1);
    $this->travel(601)->seconds();
    expect($cache->remember('test', ['uid' => 1], $calculate)['data']['value'])->toBe(2);
    $cache->invalidate();
    expect($cache->remember('test', ['uid' => 1], $calculate)['data']['value'])->toBe(3);
    expect($cache->remember('test', ['uid' => 2], $calculate)['data']['value'])->toBe(4);
});

test('summaries deduplicate reverted changesets and exclude incomplete contributions', function () {
    $this->sourceChangeset(100);
    $this->sourceChangeset(101, ['osm_uid' => 456]);
    foreach ([200, 201] as $id) {
        $this->sourceNode($id, 1, ['tags' => json_encode(['operator' => 'A'])]);
        $this->sourceNode($id, 2, ['changeset_id' => 101, 'osm_uid' => 456, 'tags' => json_encode(['operator' => 'B'])]);
    }
    $processor = app(ModerationOutcomeProcessor::class);
    $processor->process(200);
    $summary = app(ModerationSummaries::class)->editor(123)['data'];
    expect($summary['survival']['unknown'])->toBe(1)->and($summary['survival']['percent'])->toBeNull();
    $processor->process(201);
    app(ModerationSummaryCache::class)->invalidate();
    $summary = app(ModerationSummaries::class)->editor(123)['data'];
    expect($summary['survival']['reverted'])->toBe(1)->and($summary['survival']['percent'])->toBe(0.0)->and($summary['revert_stats']['affected_nodes'])->toBe(2);
    $this->moderator();
    $this->get('/moderation/editors/123?outcome=reverted')->assertInertia(fn (Assert $page) => $page->has('records.data', 1)->has('records.data.0.outcomes', 2));
});

test('area membership uses both sides of moves and deletion location without bbox inference', function () {
    $area = WatchedArea::factory()->create();
    $overlap = WatchedArea::factory()->create();
    foreach ([100, 101, 102, 103] as $id) {
        $this->sourceChangeset($id);
    }
    $this->sourceNode();
    $this->sourceNode(200, 2, ['changeset_id' => 101, 'longitude' => -90, 'geom' => DB::raw('ST_SetSRID(ST_MakePoint(-90,30.5),4326)')]);
    $this->sourceNode(201, 1, ['changeset_id' => 100]);
    $this->sourceNode(201, 2, ['changeset_id' => 102, 'visible' => false, 'latitude' => null, 'longitude' => null, 'geom' => null]);
    $reader = app(ModerationReader::class);
    foreach ([$area, $overlap] as $boundary) {
        expect($reader->listing('changesets', ['area' => $boundary->id])->orderBy('id')->pluck('id')->all())->toBe([100, 101, 102]);
        $summary = app(ModerationSummaries::class)->area($boundary)['data'];
        expect($summary['changesets_count'])->toBe(3)->and($summary['affected_nodes'])->toBe(2);
    }
});

test('editor sorting covers the complete dataset before pagination', function () {
    $this->moderator();
    $now = now();
    ModerationEditorSummary::insert(collect(range(1, 201))->map(fn (int $uid): array => [
        'osm_uid' => $uid, 'name' => 'mapper'.$uid, 'added' => $uid, 'calculated_at' => $now, 'created_at' => $now, 'updated_at' => $now,
    ])->all());
    $this->get('/moderation/editors?sort=added&order=desc')->assertInertia(fn (Assert $page) => $page->has('records.data', 200)->where('records.data.0.osm_uid', 201)->where('records.data.199.osm_uid', 2));
    $this->get('/moderation/editors?sort=added&order=desc&page=2')->assertInertia(fn (Assert $page) => $page->has('records.data', 1)->where('records.data.0.osm_uid', 1));
});

test('every editor sort is applied before persisted rows are paginated', function () {
    $this->moderator();
    $now = now();
    ModerationEditorSummary::insert(collect(range(1, 201))->map(fn (int $uid): array => [
        'osm_uid' => $uid,
        'name' => 'mapper'.str_pad((string) $uid, 3, '0', STR_PAD_LEFT),
        'last_active' => $now->copy()->addSeconds($uid),
        'tracked_changesets' => $uid,
        'added' => $uid,
        'modified' => $uid,
        'deleted' => $uid,
        'flags_count' => $uid,
        'survival_percent' => $uid / 3,
        'calculated_at' => $now,
        'created_at' => $now,
        'updated_at' => $now,
    ])->all());
    $area = WatchedArea::factory()->create();
    $lastSummary = ModerationEditorSummary::where('osm_uid', 201)->firstOrFail();
    $lastSummary->areas()->attach($area, ['refresh_token' => 'current']);
    $lastSummary->update(['areas_count' => 1]);

    foreach (['name', 'changesets_count', 'added', 'modified', 'deleted', 'flags_count', 'survival', 'area_count', 'last_active'] as $sort) {
        $this->get('/moderation/editors?sort='.$sort.'&order=desc')->assertInertia(fn (Assert $page) => $page->where('records.data.0.osm_uid', 201));
    }
});

test('editor filters are applied to the complete persisted dataset before pagination', function () {
    $this->moderator();
    $now = now();
    ModerationEditorSummary::insert(collect(range(1, 201))->map(fn (int $uid): array => [
        'osm_uid' => $uid,
        'name' => $uid === 201 ? 'Target mapper' : 'Other mapper '.$uid,
        'last_active' => $uid === 201 ? $now : $now->copy()->subDays(2),
        'calculated_at' => $now,
        'created_at' => $now,
        'updated_at' => $now,
    ])->all());
    $area = WatchedArea::factory()->create();
    ModerationEditorSummary::where('osm_uid', 201)->firstOrFail()->areas()->attach($area, ['refresh_token' => 'current']);

    foreach (['user=Target', 'user=201', 'window=24h', 'area='.$area->id] as $filter) {
        $this->get('/moderation/editors?'.$filter)->assertInertia(fn (Assert $page) => $page
            ->has('records.data', 1)
            ->where('records.data.0.osm_uid', 201));
    }
});

test('one editor summary is persisted with derived moderation metrics', function () {
    $this->sourceChangeset(attributes: ['alpr_nodes_created' => 1, 'alpr_nodes_touched' => 1]);
    $this->sourceNode();
    app(ModerationOutcomeProcessor::class)->process(200);

    app(ModerationEditorSummaries::class)->refreshEditor(123);

    expect(ModerationEditorSummary::where('osm_uid', 123)->first())
        ->name->toBe('mapper')
        ->tracked_changesets->toBe(1)
        ->added->toBe(1)
        ->survival_percent->toBe(100.0)
        ->survival_reverted->toBe(0)
        ->flags_count->toBeNull()
        ->calculated_at->not->toBeNull()
        ->dirty_at->toBeNull();
});

test('a newer dirty marker survives an editor calculation', function () {
    $this->sourceChangeset();
    ModerationEditorSummary::create(['osm_uid' => 123, 'dirty_at' => now()->subSecond()]);
    $summaries = $this->mock(ModerationSummaries::class);
    $summaries->shouldReceive('states')->once()->andReturnUsing(function (): array {
        app(ModerationEditorSummaries::class)->markEditorsDirty([123]);

        return [100 => 'unknown'];
    });
    $summaries->shouldReceive('flagsForEditor')->once()->with(123)->andReturnNull();

    app(ModerationEditorSummaries::class)->refreshEditor(123);

    expect(ModerationEditorSummary::where('osm_uid', 123)->firstOrFail())
        ->calculated_at->not->toBeNull()
        ->dirty_at->not->toBeNull();
});

test('area membership refresh replaces persisted editor relationships', function () {
    $area = WatchedArea::factory()->create();
    $removed = ModerationEditorSummary::create(['osm_uid' => 999, 'areas_count' => 1]);
    $removed->areas()->attach($area, ['refresh_token' => 'stale']);
    $this->sourceChangeset();
    $this->sourceNode();

    app(ModerationEditorSummaries::class)->refreshArea($area);

    expect($area->fresh()->summary_dirty_at)->toBeNull()
        ->and(ModerationEditorSummary::where('osm_uid', 123)->firstOrFail())
        ->areas_count->toBe(1)
        ->and(ModerationEditorSummary::where('osm_uid', 123)->firstOrFail()->areas()->whereKey($area)->exists())->toBeTrue()
        ->and($removed->fresh())
        ->areas_count->toBe(0)
        ->and($removed->areas()->whereKey($area)->exists())->toBeFalse();
});

test('new unprocessed node versions make survival unknown until outcomes catch up', function () {
    $this->sourceChangeset(100, ['alpr_nodes_touched' => 1]);
    $this->sourceNode();
    app(ModerationOutcomeProcessor::class)->process(200);
    expect(app(ModerationSummaries::class)->editor(123)['data']['survival']['intact'])->toBe(1);
    $this->sourceNode(200, 2, ['changeset_id' => 101, 'osm_uid' => 456]);
    app(ModerationSummaryCache::class)->invalidate();
    expect(app(ModerationSummaries::class)->editor(123)['data']['survival']['unknown'])->toBe(1);
});

test('database cache prevents a competing calculation while its lock is held', function () {
    config(['database.connections.moderation_cache_test' => config('database.connections.pgsql'), 'cache.default' => 'moderation_test',
        'cache.stores.moderation_test' => ['driver' => 'database', 'connection' => 'moderation_cache_test', 'table' => 'cache', 'lock_table' => 'cache_locks', 'prefix' => 'moderation-test:']]);
    $cache = app(ModerationSummaryCache::class);
    $key = 'moderation:summary:v2:'.hash('sha256', json_encode(['initial', 'concurrent', [], now()->utc()->toDateString()], JSON_THROW_ON_ERROR));
    $lock = Cache::lock($key.':calculate', 30);
    expect($lock->get())->toBeTrue();
    $calls = 0;
    try {
        expect(fn () => $cache->remember('concurrent', [], function () use (&$calls): array {
            $calls++;

            return [];
        }))
            ->toThrow(LockTimeoutException::class);
        expect($calls)->toBe(0);
    } finally {
        $lock->release();
        DB::disconnect('moderation_cache_test');
    }
});

test('stale summaries remain available while a deferred refresh replaces them', function () {
    $cache = app(ModerationSummaryCache::class);
    $calls = 0;
    $calculate = function () use (&$calls): array {
        return ['value' => ++$calls];
    };
    $first = $cache->remember('stale', [], $calculate);
    $this->travel(301)->seconds();
    expect($cache->remember('stale', [], $calculate))->toBe($first)->and($calls)->toBe(1);
    app(DeferredCallbackCollection::class)->invoke();
    expect($cache->remember('stale', [], $calculate)['data']['value'])->toBe(2);
});

test('editors page reads persisted rows without querying the OSM connection', function () {
    $this->moderator();
    ModerationEditorSummary::create(['osm_uid' => 123, 'name' => 'Cached mapper', 'tracked_changesets' => 5, 'calculated_at' => now()]);
    $connection = DB::connection(config('osm.reader.connection'));
    $connection->enableQueryLog();

    $this->get('/moderation/editors')->assertInertia(fn (Assert $page) => $page
        ->where('records.data.0.name', 'Cached mapper')
        ->where('records.data.0.tracked_changesets', 5));

    $queries = collect($connection->getQueryLog())->pluck('query')->implode("\n");
    expect($queries)->not->toContain('testing_changesets')->not->toContain('testing_node_versions');
    $connection->disableQueryLog();
});
