<?php

use App\Models\User;
use App\Services\OpenStreetMap\ModerationReader;
use App\Services\OpenStreetMap\ModerationSummaries;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\CreatesModerationSource;

uses(CreatesModerationSource::class);
beforeEach(function (): void {
    $this->createModerationSource();
});
test('moderation requires a verified approved OSM session on every endpoint', function () {
    $this->get('/moderation')->assertRedirect('/login');
    $this->get('/moderation/nodes/200')->assertRedirect('/login');
    $user = User::factory()->create(['email' => 'pfeifer.christopher@gmail.com']);
    $this->actingAs($user)->get('/moderation')->assertForbidden();
    $user = $this->moderator();
    config(['moderation.approved_osm_ids' => []]);
    $this->get('/moderation')->assertForbidden();
    $this->get('/moderation/changesets/100')->assertForbidden();
    $this->get('/moderation/nodes/200')->assertForbidden();
    $this->patch('/moderation/nodes/200/review')->assertForbidden();
    $this->post('/moderation/areas')->assertForbidden();
    $this->get('/moderation/areas/search')->assertForbidden();
    $this->get('/moderation?view=audit')->assertForbidden();
});
test('approved moderators can filter and paginate live changesets', function () {
    $this->moderator();
    foreach (range(1, 201) as $id) {
        $this->sourceChangeset($id);
    }
    $this->get('/moderation?view=changesets')->assertInertia(fn (Assert $page) => $page->component('Moderation/Index')->has('records.data', 200)->missing('records.total')->where('records.next_page_url', fn ($url) => $url !== null)->where('source.state', 'ready'));
    $this->get('/moderation?view=changesets&page=2')->assertInertia(fn (Assert $page) => $page->has('records.data', 1));
    $this->get('/moderation?view=changesets&changeset=1')->assertInertia(fn (Assert $page) => $page->has('records.data', 1)->where('records.data.0.id', 1));
    $this->get('/moderation?sort=unsafe')->assertSessionHasErrors('sort');
});
test('approved moderators can search ALPR nodes by exact OSM ID', function () {
    $this->moderator();
    $this->sourceNode(200);
    $this->sourceNode(201);

    $this->get('/moderation?view=nodes&osm_id=201')->assertInertia(fn (Assert $page) => $page
        ->where('filters.osm_id', '201')
        ->has('records.data', 1)
        ->where('records.data.0.id', 201));

    $this->get('/moderation?view=nodes&osm_id=invalid')->assertSessionHasErrors('osm_id');
});

test('approved moderators can open a dedicated ALPR node profile with its complete history', function () {
    $this->moderator();
    $this->sourceChangeset(100, ['tags' => json_encode(['comment' => 'Added surveyed camera'])]);
    $this->sourceChangeset(101, ['tags' => json_encode(['comment' => 'Moved to the correct pole'])]);
    $this->sourceChangeset(102, ['tags' => json_encode(['comment' => 'Camera removed'])]);
    $this->sourceNode(200, 1, [
        'changeset_id' => 100,
        'osm_updated_at' => now()->subDays(3),
        'tags' => json_encode(['surveillance:type' => 'ALPR']),
    ]);
    $this->sourceNode(200, 2, [
        'changeset_id' => 101,
        'osm_uid' => 456,
        'osm_user' => 'second_mapper',
        'latitude' => 30.5005,
        'longitude' => -97.5005,
        'geom' => DB::raw('ST_SetSRID(ST_MakePoint(-97.5005,30.5005),4326)'),
        'osm_updated_at' => now()->subDay(),
        'tags' => json_encode(['surveillance:type' => 'ALPR', 'operator' => 'Flock Safety', 'direction' => '90']),
    ]);
    $this->sourceNode(200, 3, [
        'changeset_id' => 102,
        'osm_uid' => 789,
        'osm_user' => 'third_mapper',
        'visible' => false,
        'latitude' => null,
        'longitude' => null,
        'geom' => null,
        'osm_updated_at' => now(),
        'tags' => json_encode([]),
    ]);

    $this->get('/moderation/nodes/200')->assertInertia(fn (Assert $page) => $page
        ->component('Moderation/Node')
        ->where('node.id', 200)
        ->where('node.visible', false)
        ->where('node.location_is_historical', true)
        ->has('versions', 3)
        ->where('versions.0.comment', 'Added surveyed camera')
        ->where('versions.1.osm_user', 'second_mapper')
        ->where('versions.2.comment', 'Camera removed')
        ->where('versions.2.latitude', 30.5005)
        ->where('versions.2.location_is_historical', true)
        ->has('flags', 0));
});

test('missing ALPR node profiles return not found', function () {
    $this->moderator();

    $this->get('/moderation/nodes/999')->assertNotFound();
});
test('reviews are audited locally and do not write OSM data', function () {
    $this->moderator();
    $this->sourceChangeset();
    $row = app(ModerationReader::class)->changesets()->first();
    $this->from('/moderation?view=changesets')->patch('/moderation/changesets/100/review', ['revision' => $row->revision, 'status' => 'Reviewed'])->assertRedirect();
    $this->assertDatabaseHas('moderation_reviews', ['subject_id' => 100, 'status' => 'Reviewed']);
    $this->assertDatabaseHas('moderation_activities', ['action' => 'changeset.reviewed', 'subject_id' => 100]);
    expect(DB::table('testing_changesets')->value('alpr_nodes_created'))->toBe(2);
});
test('stale revisions and source failures cannot save decisions', function () {
    $this->moderator();
    $this->sourceChangeset();
    $this->patch('/moderation/changesets/100/review', ['revision' => str_repeat('x', 32), 'status' => 'Reviewed'])->assertSessionHasErrors('review');
    $this->assertDatabaseCount('moderation_reviews', 0);
    config(['osm.reader.changesets_table' => 'source_not_ready']);
    $this->get('/moderation?view=changesets')->assertInertia(fn (Assert $page) => $page->where('source.state', 'unavailable')->has('records.data', 0));
});

test('node dismissals are persistent and idempotent', function () {
    $this->moderator();
    $this->sourceNode();
    $node = app(ModerationReader::class)->listing('nodes', [])->first();
    for ($attempt = 0; $attempt < 2; $attempt++) {
        $this->patch('/moderation/nodes/200/review', ['revision' => $node->revision, 'status' => 'Dismissed'])->assertRedirect();
    }
    $this->assertDatabaseHas('moderation_reviews', ['subject_id' => 200, 'subject_type' => 'node', 'status' => 'Dismissed']);
    $this->assertDatabaseCount('moderation_activities', 1);
});

test('OSM approval alone is insufficient without a verified OSM login session', function () {
    $user = $this->moderator();
    $this->withSession(['osm_authenticated_uid' => '999'])->get('/moderation')->assertForbidden();
    $this->withSession(['osm_authenticated_uid' => null])->patch('/moderation/changesets/100/review')->assertForbidden();
});

test('loading moderation nodes and changesets does not run aggregate queries', function (string $view) {
    $this->moderator();
    $this->sourceNode();
    $this->sourceChangeset();
    DB::connection()->enableQueryLog();
    $this->get('/moderation?view='.$view)->assertOk()
        ->assertInertia(fn (Assert $page) => $page->missing('records.total')->where('counts.nodes', null));
    $queries = collect(DB::connection()->getQueryLog())->pluck('query')->implode("\n");
    expect($queries)->not->toMatch('/\b(count|max|min|sum|avg)\s*\(/i');
    DB::connection()->disableQueryLog();
})->with(['nodes', 'flagged', 'changesets']);

test('moderation no longer exposes rule options or automatically flags large changesets', function () {
    $this->moderator();
    $this->sourceChangeset(100, ['alpr_nodes_created' => 20, 'alpr_nodes_deleted' => 5]);
    $this->get('/moderation?view=changesets')->assertInertia(fn (Assert $page) => $page
        ->where('view', 'changesets')->missing('ruleOptions')
        ->where('records.data.0.status', 'Needs review'));
});

test('editor profiles include twelve calendar weeks and preserve manual flagged timelines', function () {
    $this->travelTo(now()->setDate(2026, 9, 7)->setTime(12, 0)->utc());
    $this->moderator();
    $this->sourceChangeset(100, ['created_at' => now()->subWeeks(11)]);
    $this->sourceChangeset(101);
    $this->sourceChangeset(102, ['created_at' => now()->subWeeks(12)]);
    $row = app(ModerationReader::class)->changesets()->where('source.id', 101)->first();
    $this->patch('/moderation/changesets/101/review', ['revision' => $row->revision, 'status' => 'Flagged'])->assertRedirect();
    $this->get('/moderation?view=profile&uid=123')->assertInertia(fn (Assert $page) => $page
        ->where('profile.tracked_changesets', 3)->where('profile.status', null)->where('profile.flags_count', null)
        ->has('weeks', 12)->where('weeks.0.total', 1)->where('weeks.1.total', 0)->where('weeks.11.total', 1));
    $this->get('/moderation?view=profile&uid=123&statuses[]=Flagged')->assertInertia(fn (Assert $page) => $page
        ->has('records.data', 1)->where('records.data.0.id', 101)->where('profile.flagged_changesets', 1));
});

test('missing persisted summaries show a refreshing state without synchronous calculation', function () {
    $this->moderator();
    $this->mock(ModerationSummaries::class)->shouldNotReceive('editors');
    $this->get('/moderation?view=editors')->assertInertia(fn (Assert $page) => $page->where('source.state', 'refreshing')->has('records.data', 0));
});
